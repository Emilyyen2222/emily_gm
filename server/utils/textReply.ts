import type { NewsKind } from './newsSources'
import type { NewsStory } from './newsDigest'
import { rowToRecord } from './records'
import { parseSquatCommand, squatProgressText, SQUAT_GOAL_MAX, type SquatCommand } from '../../shared/types/squat'

/**
 * 把使用者的文字訊息對應到回覆卡片。
 *
 * 群組裡一律只在被 @ 到時才回應，不接受裸關鍵字。原因是「今天」「本週」
 * 在日常對話裡太常見 —— 有人隨口打了「今天」兩個字，bot 就會把那個人的
 * 健康紀錄連同備註貼進群組，那是非預期的隱私外洩，而且觸發門檻低到一定會發生。
 *
 * 一對一沒有這個風險（只有本人看得到），所以任何訊息都會回應。
 *
 * 固定指令以外的訊息交給 AI 回答（見 aiReply.ts）。
 */
export async function buildTextReply(
  rawText: string,
  userId: string | undefined,
  chatId: string | undefined,
  opts: { addressed: boolean; groupId?: string },
): Promise<unknown | null> {
  // 深蹲打卡是唯一不用 @ 的指令：只認「深蹲 60」這種完整格式，
  // 回覆也只有打卡的人自己的進度，送回他打字的這個聊天室
  const squat = parseSquatCommand(rawText)
  if (squat && userId && (opts.addressed || squat.type === 'checkin')) {
    try {
      return await squatReply(squat, userId, chatId, opts.groupId)
    } catch {
      // 不能靜悄悄失敗：沒回話的話，打卡的人會以為記到了
      return textMessage('沒記到，請再打一次')
    }
  }

  // 群組裡沒被 @ 到就徹底安靜
  if (!opts.addressed) return null

  const inGroup = Boolean(chatId)
  const url = liffUrl()
  const text = rawText.trim()

  // 「拍拍 XXX」是卡片按鈕送出的訊息，本身就是完整的表達，bot 不需要接話
  if (/^拍拍/.test(text)) return null

  if (/^(記錄|紀錄|記|填|填寫)$/.test(text)) return startCard(url)
  if (/^(說明|幫助|help|？|\?)$/i.test(text)) return helpCard(url, inGroup)

  if (/^(今天|今日)$/.test(text)) {
    if (!userId) return helpCard(url, inGroup)
    const supabase = useSupabase()
    const { data } = await supabase
      .from('records')
      .select('*')
      .eq('user_id', userId)
      .eq('record_date', taipeiToday())
      .maybeSingle()
    return data ? buildDailyFlexMessage(rowToRecord(data)) : noRecordCard(url)
  }

  if (/^(本週|這週|這周|本周)$/.test(text)) {
    if (!userId) return helpCard(url, inGroup)
    const today = taipeiToday()
    const from = addDays(today, -6)
    const supabase = useSupabase()
    const { data } = await supabase
      .from('records')
      .select('*')
      .eq('user_id', userId)
      .gte('record_date', from)
      .lte('record_date', today)
    const summary = summarise((data ?? []).map(rowToRecord))
    return weekCard({ from: from.slice(5).replace('-', '/'), to: today.slice(5).replace('-', '/'), ...summary, url })
  }

  // 新聞是公開內容，群組裡被 @ 到也照樣回
  if (/^(新聞|健康新聞)$/.test(text)) return newsReply('health')
  if (/^AI\s*新聞$/i.test(text)) return newsReply('ai')
  if (/^(股市|股票)新聞$/.test(text)) return newsReply('stock')

  if (/^AI\s*設定$/i.test(text)) {
    if (inGroup) return textMessage(AI_TEXT.settingsInGroup)
    if (!userId) return helpCard(url, inGroup)
    return aiSettings(userId)
  }

  // 只 @ 了 bot 沒打字，或拿不到 userId（無法計次）時，給說明卡片
  if (!text || !userId) return helpCard(url, inGroup)

  // 其他看不懂的訊息交給 AI
  return aiReply(text, userId, inGroup)
}

/**
 * 回覆最新的一份新聞。08:00 的排程產生好存在資料庫，這裡只讀不產生。
 * 當天還沒產生就是前一天的，卡片頂端的日期看得出來。
 */
export async function newsReply(kind: NewsKind): Promise<unknown> {
  const latest = await loadLatestDigest<NewsStory[]>(kind, taipeiToday())
  return latest?.content.length ? newsCarousel(kind, latest.date, latest.content) : textMessage(NEWS_EMPTY)
}

/**
 * 深蹲指令的回覆。加入、退出只在群組有效（綁的是這個群組），
 * 一對一打「加入深蹲」只說明要去群組加入。
 */
async function squatReply(cmd: SquatCommand, userId: string, chatId: string | undefined, groupId: string | undefined) {
  const today = taipeiToday()
  // 群組裡的回覆帶名字，取自這個群組的成員資料；一對一不帶
  const name = chatId ? ((await getProfile(userId, chatId))?.displayName ?? null) : null
  const who = name ? `${name} ` : '你'

  switch (cmd.type) {
    case 'checkin': {
      await addSquatCheckin(userId, cmd.reps, today)
      return textMessage(squatProgressText({ name, ...(await getSquatProgress(userId, today)) }))
    }
    case 'checkin-not-number':
      return textMessage('要用數字記，例如「深蹲 60」')
    case 'undo': {
      const removed = await undoSquatCheckin(userId, today)
      if (removed === null) return textMessage('今天沒有從聊天記的深蹲。訓練頁記的請到訓練頁修改')
      const { total, goal } = await getSquatProgress(userId, today)
      return textMessage(`已刪掉剛才的 ${removed} 下，今天 ${total}/${goal}`)
    }
    case 'goal': {
      if (cmd.goal === null) return textMessage(`目標要是 1 到 ${SQUAT_GOAL_MAX} 之間的數字，例如「深蹲目標 50」`)
      await setSquatGoal(userId, cmd.goal)
      return textMessage(`每天目標改成 ${cmd.goal} 下`)
    }
    case 'join': {
      if (!groupId) {
        return textMessage('深蹲挑戰要在群組裡加入：在群組 @我 打「加入深蹲」，看板只會出現在那個群組。\n在這裡打「深蹲 60」也可以記錄。')
      }
      if (cmd.goal !== null) await setSquatGoal(userId, cmd.goal)
      const already = await joinSquat(groupId, userId)
      const goal = cmd.goal ?? (await getSquatGoals([userId]))[userId]!
      if (already) {
        return textMessage(cmd.goal !== null ? `${who}的每天目標改成 ${goal} 下` : `${who}已經在深蹲挑戰裡了，每天目標 ${goal} 下`)
      }
      return textMessage(
        `${who}加入了深蹲挑戰，每天目標 ${goal} 下。\n每天早上的提醒會列出前一天有蹲的人和次數，訓練頁記的深蹲也算在內。\n記錄直接打「深蹲 60」，不用 @ 我。`,
      )
    }
    case 'leave': {
      if (!groupId) return textMessage('你還沒在這個群組加入深蹲挑戰')
      const was = await leaveSquat(groupId, userId)
      return textMessage(was ? `${who}退出了深蹲挑戰，之後早上的提醒不會再列出你` : '你還沒在這個群組加入深蹲挑戰')
    }
  }
}
