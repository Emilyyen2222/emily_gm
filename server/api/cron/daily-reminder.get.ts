import { LIVER_CARE_TOTAL } from '../../../shared/types/record'

/**
 * 每日提醒推播。由 Vercel Cron 於 00:00 UTC（= 台北 08:00）觸發。
 *
 * Vercel Hobby 方案的 Cron 一天只能觸發一次，所以週報沒有另設排程，
 * 而是在這裡判斷「今天是不是星期一」再決定要不要一併發出。
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // 這是公開網址，沒有這道檢查任何人都能觸發推播
  if (!config.cronSecret || getHeader(event, 'authorization') !== `Bearer ${config.cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: '未授權' })
  }

  const supabase = useSupabase()
  const { data: chats, error } = await supabase.from('chats').select('chat_id').eq('active', true)
  if (error) {
    throw createError({ statusCode: 500, statusMessage: `讀取推播目標失敗：${error.message}` })
  }

  if (!chats?.length) {
    return { sent: 0, weekly: false, note: '尚無已登記的群組，請先把 bot 邀請進群組' }
  }

  const url = liffUrl()
  const isMonday = taipeiWeekday() === 1
  const weeklyMessage = isMonday ? await buildWeeklyReport() : null

  let sent = 0
  const failed: string[] = []

  for (const chat of chats) {
    const messages: unknown[] = [reminderCard(url)]
    if (weeklyMessage) messages.push(weeklyMessage)

    try {
      await pushMessage(chat.chat_id, messages)
      sent++
    } catch {
      // 單一群組失敗（例如 bot 已被踢除）不應中斷其他群組的推播
      failed.push(chat.chat_id)
    }
  }

  return { sent, failed, weekly: Boolean(weeklyMessage) }
})

/** 早安提醒卡片。用按鈕而不是裸網址，點擊區域大得多，也比較不像廣告訊息 */
function reminderCard(url: string) {
  return {
    type: 'flex',
    altText: `早安！來記錄一下今天的狀態吧 ${url}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFF8EF',
        paddingAll: '18px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', width: '4px', backgroundColor: '#F9A726', cornerRadius: '2px', contents: [] },
              { type: 'text', text: '早安', size: 'sm', weight: 'bold', color: '#F9A726', gravity: 'center' },
            ],
          },
          {
            type: 'text',
            text: '今天睡得如何？',
            size: 'xl',
            weight: 'bold',
            color: '#3A2513',
            margin: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: '花 10 秒記錄一下，想到什麼填什麼就好。',
            size: 'sm',
            color: '#6F5B49',
            margin: 'sm',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFF8EF',
        paddingAll: '18px',
        paddingTop: 'none',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#F9A726',
            height: 'sm',
            action: { type: 'uri', label: '開始記錄', uri: url },
          },
        ],
      },
    },
  }
}

/** 上週（一到日）各成員的護肝達標率排行 */
async function buildWeeklyReport() {
  const today = taipeiToday()
  const start = addDays(today, -7)
  const end = addDays(today, -1)

  const supabase = useSupabase()
  const { data } = await supabase
    .from('records')
    .select('user_id, display_name, liver_score')
    .gte('record_date', start)
    .lte('record_date', end)

  if (!data?.length) return null

  const byUser = new Map<string, { name: string; score: number; days: number }>()
  for (const row of data) {
    const entry = byUser.get(row.user_id) ?? { name: row.display_name ?? '匿名', score: 0, days: 0 }
    entry.name = row.display_name ?? entry.name
    entry.score += row.liver_score ?? 0
    entry.days += 1
    byUser.set(row.user_id, entry)
  }

  const ranking = [...byUser.values()]
    .map((u) => ({ ...u, rate: Math.round((u.score / (u.days * LIVER_CARE_TOTAL)) * 100) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10)

  return {
    type: 'flex',
    altText: `上週護肝排行：${ranking[0]!.name} ${ranking[0]!.rate}%`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '上週護肝排行', weight: 'bold', size: 'lg' },
          { type: 'text', text: `${start} ~ ${end}`, size: 'xs', color: '#6b7280' },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: ranking.map((u, i) => ({
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: `${i + 1}.`, size: 'sm', color: '#6b7280', flex: 1 },
                { type: 'text', text: u.name, size: 'sm', flex: 5, wrap: true },
                { type: 'text', text: `${u.rate}%`, size: 'sm', weight: 'bold', flex: 2, align: 'end' },
                { type: 'text', text: `${u.days} 天`, size: 'xs', color: '#9ca3af', flex: 2, align: 'end' },
              ],
            })),
          },
        ],
      },
    },
  }
}
