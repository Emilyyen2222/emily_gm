import { careRate } from '../../shared/types/record'

const C = { orange: '#F9A726', brown: '#3A2513', brownLight: '#6F5B49', cream: '#FFF8EF', border: '#EAD7BD' } as const

/**
 * 上週回顧。
 *
 * 刻意不排名：排名只有第一名看了開心，其他人每週被提醒一次自己落後，
 * 久了就不想打開。順序照「第一次記錄的時間」排，因為照任何數值排序，
 * 就算不寫名次，第一行還是會被讀成第一名。
 */
export async function buildWeeklyReport(today: string) {
  const start = addDays(today, -7)
  const end = addDays(today, -1)

  const supabase = useSupabase()
  const { data } = await supabase
    .from('records')
    .select('user_id, display_name, liver_score, liver_total, sleep_score, sleep_hours, record_date, created_at')
    .gte('record_date', start)
    .lte('record_date', end)
    .order('created_at')

  if (!data?.length) return null

  const byUser = new Map<string, { name: string; days: number; rates: number[]; hours: number[] }>()
  for (const row of data) {
    const entry = byUser.get(row.user_id) ?? {
      name: row.display_name ?? '匿名',
      days: 0,
      rates: [] as number[],
      hours: [] as number[],
    }
    entry.name = row.display_name ?? entry.name
    entry.days += 1
    entry.rates.push(careRate({ liverScore: row.liver_score ?? 0, liverTotal: row.liver_total ?? 3 }))
    if (row.sleep_hours !== null) entry.hours.push(Number(row.sleep_hours))
    byUser.set(row.user_id, entry)
  }

  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)
  const people = [...byUser.values()].map((u) => ({
    name: u.name,
    days: u.days,
    care: avg(u.rates),
    hours: avg(u.hours),
  }))

  // 最好眠的一天：同一天所有人的睡眠分數取平均
  const byDate = new Map<string, number[]>()
  for (const row of data) {
    if (row.sleep_score === null) continue
    byDate.set(row.record_date, [...(byDate.get(row.record_date) ?? []), row.sleep_score])
  }
  const bestDay = [...byDate.entries()]
    .map(([date, scores]) => ({ date, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
    .sort((a, b) => b.avg - a.avg)[0]

  const allSleep = data.map((r) => r.sleep_score).filter((n): n is number => n !== null)
  const overallSleep = allSleep.length ? Math.round(allSleep.reduce((a, b) => a + b, 0) / allSleep.length) : null

  const extras: unknown[] = []
  if (bestDay) extras.push(statRow('最好眠的一天', `${bestDay.date.slice(5).replace('-', '/')}・${bestDay.avg}%`))
  if (overallSleep !== null) extras.push(statRow('大家平均睡眠', `${overallSleep}%`))

  return {
    type: 'flex',
    altText: `上週回顧：${people.length} 個人、共記錄 ${people.reduce((s, p) => s + p.days, 0)} 天`,
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
              { type: 'text', text: '上週回顧', size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
            ],
          },
          {
            type: 'text',
            text: `${start.slice(5).replace('-', '/')} – ${end.slice(5).replace('-', '/')}`,
            size: 'xs',
            color: C.brownLight,
            margin: 'sm',
          },
          { type: 'separator', margin: 'lg', color: C.border },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'lg',
            contents: people.map((p) => ({
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              contents: [
                { type: 'text', text: p.name, size: 'sm', weight: 'bold', color: C.brown, wrap: true },
                {
                  type: 'text',
                  text: [
                    `記錄 ${p.days} 天`,
                    p.care === null ? null : `自我照顧 ${Math.round(p.care)}%`,
                    p.hours === null ? null : `平均睡 ${p.hours.toFixed(1)} 小時`,
                  ]
                    .filter(Boolean)
                    .join('・'),
                  size: 'xs',
                  color: C.brownLight,
                  wrap: true,
                },
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
