import { LIVER_CARE_TOTAL } from '../../shared/types/record'

const C = { orange: '#F9A726', brown: '#3A2513', brownLight: '#6F5B49', cream: '#FFF8EF', border: '#EAD7BD' } as const

/**
 * 上週回顧。標題保留「上週誰的肝最乾淨」，但內容不只排行 ——
 * 只有排行的話，落後的人每週被提醒一次自己墊底，久了就不想看。
 * 加上「最好眠的一天」「大家平均」「進步最多」讓它更像回顧而不是評比。
 */
export async function buildWeeklyReport(today: string) {
  const start = addDays(today, -7)
  const end = addDays(today, -1)
  const prevStart = addDays(today, -14)
  const prevEnd = addDays(today, -8)

  const supabase = useSupabase()
  const { data } = await supabase
    .from('records')
    .select('user_id, display_name, liver_score, sleep_score, record_date')
    .gte('record_date', prevStart)
    .lte('record_date', end)

  if (!data?.length) return null

  const lastWeek = data.filter((r) => r.record_date >= start)
  if (!lastWeek.length) return null
  const weekBefore = data.filter((r) => r.record_date <= prevEnd)

  const rateByUser = (rows: typeof data) => {
    const map = new Map<string, { name: string; score: number; days: number }>()
    for (const row of rows) {
      const e = map.get(row.user_id) ?? { name: row.display_name ?? '匿名', score: 0, days: 0 }
      e.name = row.display_name ?? e.name
      e.score += row.liver_score ?? 0
      e.days += 1
      map.set(row.user_id, e)
    }
    return map
  }

  const current = rateByUser(lastWeek)
  const previous = rateByUser(weekBefore)

  const ranking = [...current.entries()]
    .map(([userId, u]) => ({ userId, ...u, rate: Math.round((u.score / (u.days * LIVER_CARE_TOTAL)) * 100) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10)

  // 最好眠的一天：把同一天所有人的睡眠分數平均起來比較
  const byDate = new Map<string, number[]>()
  for (const row of lastWeek) {
    if (row.sleep_score === null) continue
    byDate.set(row.record_date, [...(byDate.get(row.record_date) ?? []), row.sleep_score])
  }
  const bestDay = [...byDate.entries()]
    .map(([date, scores]) => ({ date, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
    .sort((a, b) => b.avg - a.avg)[0]

  const allSleep = lastWeek.map((r) => r.sleep_score).filter((n): n is number => n !== null)
  const avgSleep = allSleep.length ? Math.round(allSleep.reduce((a, b) => a + b, 0) / allSleep.length) : null

  // 進步最多：跟前一週比，只看兩週都有紀錄的人
  let mostImproved: { name: string; delta: number } | null = null
  for (const entry of ranking) {
    const before = previous.get(entry.userId)
    if (!before) continue
    const beforeRate = Math.round((before.score / (before.days * LIVER_CARE_TOTAL)) * 100)
    const delta = entry.rate - beforeRate
    if (delta > 0 && (!mostImproved || delta > mostImproved.delta)) mostImproved = { name: entry.name, delta }
  }

  const extras: unknown[] = []
  if (bestDay) extras.push(statRow('最好眠的一天', `${bestDay.date.slice(5).replace('-', '/')}・${bestDay.avg}%`))
  if (avgSleep !== null) extras.push(statRow('大家平均睡眠', `${avgSleep}%`))
  if (mostImproved) extras.push(statRow('進步最多', `${mostImproved.name} +${mostImproved.delta}%`))

  return {
    type: 'flex',
    altText: `上週誰的肝最乾淨：${ranking[0]!.name} ${ranking[0]!.rate}%`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: C.cream,
        paddingAll: '18px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', width: '4px', backgroundColor: C.orange, cornerRadius: '2px', contents: [] },
              { type: 'text', text: '上週誰的肝最乾淨', size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
            ],
          },
          { type: 'text', text: `${start.slice(5).replace('-', '/')} – ${end.slice(5).replace('-', '/')}`, size: 'xs', color: C.brownLight, margin: 'sm' },
          { type: 'separator', margin: 'lg', color: C.border },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: ranking.map((u, i) => ({
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: `${i + 1}`, size: 'sm', color: C.brownLight, flex: 1 },
                { type: 'text', text: u.name, size: 'sm', color: C.brown, flex: 5, wrap: true },
                { type: 'text', text: `${u.rate}%`, size: 'sm', weight: 'bold', color: C.brown, flex: 2, align: 'end' },
                { type: 'text', text: `${u.days} 天`, size: 'xs', color: C.brownLight, flex: 2, align: 'end' },
              ],
            })),
          },
          ...(extras.length
            ? [
                { type: 'separator', margin: 'lg', color: C.border },
                { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'md', contents: extras },
              ]
            : []),
        ],
      },
    },
  }
}

function statRow(label: string, value: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: C.brownLight, flex: 4 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: C.brown, flex: 5, align: 'end' },
    ],
  }
}
