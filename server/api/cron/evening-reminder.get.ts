/**
 * 晚上的提醒推播。由 Vercel Cron 於 13:00 UTC（= 台北 21:00）觸發。
 *
 * 存在的理由：上下班時間、保健食品、💩 這些欄位，早上十點根本答不出來。
 * 只有早上提醒的話，表單有一半的欄位等於是逼使用者空著。
 *
 * 曾因訊息額度考量停用過。推播是按觸及人數計費的，對象變多時要重新評估。
 */
export default defineEventHandler(async (event) => {
  return runReminder(event, 'evening-reminder', async (url) => [
    reminderCard({
      label: '晚安',
      title: '今天過得如何？',
      body: '\n🕐　💊　💩\n\n補一下就好。',
      button: '開始記錄',
      url,
    }),
  ])
})
