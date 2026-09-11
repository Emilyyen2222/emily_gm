import { rowToRecord } from './records'

/**
 * 把使用者的文字訊息對應到回覆卡片。
 *
 * 群組裡 bot 會收到所有訊息，所以比對刻意嚴格：整句去除空白後要剛好等於
 * 關鍵字才算。respondToUnknown 為 true（一對一，或群組裡被 @ 到）時，
 * 看不懂的訊息才回說明卡；否則一律回 null，代表保持安靜。
 */
export async function buildTextReply(
  rawText: string,
  userId: string | undefined,
  chatId: string | undefined,
  opts: { respondToUnknown: boolean },
): Promise<unknown | null> {
  const url = liffUrl()
  const text = rawText.trim()

  if (/^(記錄|紀錄|記|填|填寫)$/.test(text)) return startCard(url)
  if (/^(說明|幫助|help|？|\?)$/i.test(text)) return helpCard(url)

  if (/^(今天|今日)$/.test(text)) {
    if (!userId) return helpCard(url)
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
    if (!userId) return helpCard(url)
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
    if (!chatId) return helpCard(url)
    return (await buildWeeklyReport(taipeiToday())) ?? helpCard(url)
  }

  return opts.respondToUnknown ? helpCard(url) : null
}
