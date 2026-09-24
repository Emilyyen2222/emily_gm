import type { NewsKind } from './newsSources'
import type { NewsStory } from './newsDigest'
import { rowToRecord } from './records'

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
  opts: { addressed: boolean },
): Promise<unknown | null> {
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
 * 回覆最新的一份新聞。09:00 的排程產生好存在資料庫，這裡只讀不產生。
 * 當天還沒產生就是前一天的，卡片頂端的日期看得出來。
 */
export async function newsReply(kind: NewsKind): Promise<unknown> {
  const latest = await loadLatestDigest<NewsStory[]>(kind, taipeiToday())
  return latest?.content.length ? newsCarousel(kind, latest.date, latest.content) : textMessage(NEWS_EMPTY)
}
