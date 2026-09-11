import { rowToRecord } from './records'

/**
 * 把使用者的文字訊息對應到回覆卡片。
 *
 * 群組裡一律只在被 @ 到時才回應，不接受裸關鍵字。原因是「今天」「本週」
 * 在日常對話裡太常見 —— 有人隨口打了「今天」兩個字，bot 就會把那個人的
 * 健康紀錄連同備註貼進群組，那是非預期的隱私外洩，而且觸發門檻低到一定會發生。
 *
 * 一對一沒有這個風險（只有本人看得到），所以任何訊息都會回應。
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

  if (/^(排行|排名)$/.test(text)) {
    // 排行是群組功能，一對一看自己的排行沒有意義
    if (!chatId) return helpCard(url, inGroup)
    return (await buildWeeklyReport(taipeiToday())) ?? helpCard(url, inGroup)
  }

  return helpCard(url, inGroup)
}
