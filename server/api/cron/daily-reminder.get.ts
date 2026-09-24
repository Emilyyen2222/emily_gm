/**
 * 早上的提醒推播。由 Vercel Cron 於 03:00 UTC（= 台北 11:00）觸發。
 *
 * Vercel Hobby 方案的每個 Cron 一天只能觸發一次；週報沒有另設排程，
 * 而是在這裡判斷「今天是不是星期一」再決定要不要一併發出。
 * 今日單字取自 09:00 的新聞排程（/api/cron/news）產生好的新聞，這裡只負責帶出去。
 */
export default defineEventHandler(async (event) => {
  // 今日單字每個聊天室都一樣，讀一次就好
  let word: Promise<unknown | null> | null = null
  const loadWord = () => (word ??= todayWordCard())

  return runReminder(event, 'daily-reminder', async (url, chat) => {
    const messages: unknown[] = [
      reminderCard({
        label: '早安',
        title: '今天睡得如何？',
        body: '花 10 秒記錄一下，想到什麼填什麼就好。',
        button: '開始記錄',
        url,
      }),
    ]

    // 週報只發到本人的一對一聊天室，而且只含他自己的資料。
    // 群組不再收到任何週報 —— 在能百分之百確定「誰屬於這個群組」之前，
    // 任何跨使用者的彙整都有把別人資料送錯地方的風險。
    if (taipeiWeekday() === 1 && chat.chatType === 'user') {
      const weekly = await buildPersonalWeeklyReport(chat.chatId, taipeiToday())
      if (weekly) messages.push(weekly)
    }

    // 今日單字跟在提醒卡片後面，同一次 push 不多用額度。
    // 當天 09:00 的新聞沒產生就不附，提醒照常發
    const wordMessage = await loadWord()
    if (wordMessage) messages.push(wordMessage)

    return messages
  })
})

async function todayWordCard(): Promise<unknown | null> {
  try {
    const today = taipeiToday()
    const w = await pickTodayWord(today)
    return w ? wordCard(today, w) : null
  } catch {
    // 讀不到新聞，提醒照常發
    return null
  }
}
