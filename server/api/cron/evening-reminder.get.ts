/**
 * 晚上的提醒推播。由 Vercel Cron 於 13:00 UTC（= 台北 21:00）觸發。
 *
 * 存在的理由：步數、排便、上下班時間這些欄位，早上十點根本答不出來。
 * 只有早上提醒的話，表單有一半的欄位等於是逼使用者空著。
 *
 * 曾因訊息額度考量停用過，群組減少後（目前 3 個推播對象、約 180 則/月）
 * 重新啟用。若之後對象變多要重新評估。
 */
export default defineEventHandler(async (event) => {
  return runReminder(event, 'evening-reminder', async (url) => [
    reminderCard({
      label: '晚安',
      title: '今天過得如何？',
      body: '\n🕐 上下班時間\n🌿 保健食品\n💩 排便\n\n補一下就好。',
      button: '開始記錄',
      url,
    }),
  ])
})
