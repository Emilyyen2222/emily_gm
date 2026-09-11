/**
 * 晚上的提醒推播。由 Vercel Cron 於 13:00 UTC（= 台北 21:00）觸發。
 *
 * 存在的理由：排便、上下班時間、保健食品這些欄位，早上根本答不出來。
 * 只有早上提醒的話，那些欄位等於是逼使用者空著。
 */
export default defineEventHandler(async (event) => {
  return runReminder(event, 'evening-reminder', async (url) => [
    reminderCard({
      label: '晚安',
      title: '今天過得如何？',
      body: '排便、上下班時間、保健食品，補一下就好。',
      button: '開始記錄',
      url,
    }),
  ])
})
