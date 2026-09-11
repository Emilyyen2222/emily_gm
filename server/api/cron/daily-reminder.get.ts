/**
 * 早上的提醒推播。由 Vercel Cron 於 02:00 UTC（= 台北 10:00）觸發。
 *
 * Vercel Hobby 方案的 Cron 一天只能觸發一次，所以週報沒有另設排程，
 * 而是在這裡判斷「今天是不是星期一」再決定要不要一併發出。
 */
export default defineEventHandler(async (event) => {
  return runReminder(event, 'daily-reminder', async (url) => {
    const messages: unknown[] = [
      reminderCard({
        label: '早安',
        title: '今天睡得如何？',
        body: '花 10 秒記錄一下，想到什麼填什麼就好。',
        button: '開始記錄',
        url,
      }),
    ]

    if (taipeiWeekday() === 1) {
      const weekly = await buildWeeklyReport(taipeiToday())
      if (weekly) messages.push(weekly)
    }

    return messages
  })
})
