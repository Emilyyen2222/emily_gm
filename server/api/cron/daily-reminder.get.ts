/**
 * 早上的提醒推播。由 Vercel Cron 於 02:00 UTC（= 台北 10:00）觸發。
 *
 * Vercel Hobby 方案的 Cron 一天只能觸發一次，所以週報沒有另設排程，
 * 而是在這裡判斷「今天是不是星期一」再決定要不要一併發出。
 */
export default defineEventHandler(async (event) => {
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

    // 週報只發給群組。一對一聊天室裡談「大家」沒有意義 ——
    // 那個人不一定跟其他記錄者有任何關係。
    if (taipeiWeekday() === 1 && chat.chatType !== 'user') {
      const weekly = await buildWeeklyReport(taipeiToday())
      if (weekly) messages.push(weekly)
    }

    return messages
  })
})
