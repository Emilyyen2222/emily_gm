/**
 * 晚上的提醒推播。
 *
 * 存在的理由：排便、上下班時間、保健食品這些欄位，早上根本答不出來。
 *
 * 目前「沒有」排入 vercel.json 的 cron —— LINE 官方帳號輕用量方案的
 * 每月訊息額度有限，早晚各推一次會讓用量翻倍。端點保留著，隨時可以
 * 手動觸發，或在額度允許時把排程加回去：
 *   { "path": "/api/cron/evening-reminder", "schedule": "0 13 * * *" }
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
