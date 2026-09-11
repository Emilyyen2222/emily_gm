import { LIVER_CARE_TOTAL } from '../../../shared/types/record'

/**
 * 早上的提醒推播。由 Vercel Cron 於 00:00 UTC（= 台北 08:00）觸發。
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
      const weekly = await buildWeeklyReport()
      if (weekly) messages.push(weekly)
    }

    return messages
  })
})

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
    altText: `上週誰的肝最乾淨：${ranking[0]!.name} ${ranking[0]!.rate}%`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '上週誰的肝最乾淨', weight: 'bold', size: 'lg' },
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
