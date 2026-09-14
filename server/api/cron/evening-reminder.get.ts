/**
 * 晚上的提醒推播。
 *
 * 存在的理由：上下班時間、保健食品、💩 這些欄位，早上十點根本答不出來。
 * 只有早上提醒的話，表單有一半的欄位等於是逼使用者空著。
 *
 * 目前「沒有」排入 vercel.json 的 cron。推播是按觸及人數計費的，
 * 免費額度 200 則/月，早晚各推一次會是約 300 則，月底前就會用完 ——
 * 而額度用完時推播只會安靜地失敗。留早上這次，晚上的欄位靠使用者
 * 自己回來補。
 *
 * 端點保留著，隨時可以手動觸發，或在額度允許時把排程加回去：
 *   { "path": "/api/cron/evening-reminder", "schedule": "0 13 * * *" }
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
