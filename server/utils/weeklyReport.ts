import { careRate } from '../../shared/types/record'

const C = { orange: '#F9A726', brown: '#3A2513', brownLight: '#6F5B49', cream: '#FFF8EF', border: '#EAD7BD' } as const

/**
 * 上週回顧。
 *
 * 這張卡片「不含任何人的名字或個人數字」。
 *
 * 先前的版本會列出每個人的記錄天數、自我照顧達成率與平均睡眠時數，
 * 然後推播給所有對象——包含一對一聊天室。結果是：收到的人看到了一群
 * 不一定與他有任何關係的人的健康資料。查詢本身也從未限定範圍，
 * 撈的是資料庫裡所有人的紀錄。
 *
 * 沒有可靠的方式判斷「誰該出現在哪張卡片上」：webhook 給的群組 ID 與
 * LIFF 給的並不一致，要正確地把人對應回群組並不單純。與其做一個可能
 * 仍會漏的過濾，不如讓推播出去的內容根本不含個人資料。
 * 個人的數字留在各自的「我的紀錄」頁，那裡只看得到自己的。
 */
export async function buildWeeklyReport(today: string) {
  const start = addDays(today, -7)
  const end = addDays(today, -1)

  const supabase = useSupabase()
  const { data } = await supabase
    .from('records')
    .select('user_id, liver_score, liver_total, sleep_score, sleep_hours, record_date')
    .gte('record_date', start)
    .lte('record_date', end)

  if (!data?.length) return null

  const totalDays = data.length
  const people = new Set(data.map((r) => r.user_id)).size

  const sleepScores = data.map((r) => r.sleep_score).filter((n): n is number => n !== null)
  const avgSleep = sleepScores.length
    ? Math.round(sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length)
    : null

  const hours = data.map((r) => r.sleep_hours).filter((n): n is number => n !== null).map(Number)
  const avgHours = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null

  const cares = data.map((r) => careRate({ liverScore: r.liver_score ?? 0, liverTotal: r.liver_total ?? 3 }))
  const avgCare = cares.length ? Math.round(cares.reduce((a, b) => a + b, 0) / cares.length) : null

  // 最好眠的一天：同一天所有人的睡眠分數取平均。只有日期，沒有人名
  const byDate = new Map<string, number[]>()
  for (const row of data) {
    if (row.sleep_score === null) continue
    byDate.set(row.record_date, [...(byDate.get(row.record_date) ?? []), row.sleep_score])
  }
  const bestDay = [...byDate.entries()]
    .map(([date, scores]) => ({ date, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
    .sort((a, b) => b.avg - a.avg)[0]

  const rows: unknown[] = [statRow('一起記錄了', `${totalDays} 天・${people} 個人`)]
  if (bestDay) rows.push(statRow('最好眠的一天', `${bestDay.date.slice(5).replace('-', '/')}・${bestDay.avg}%`))
  if (avgSleep !== null) rows.push(statRow('平均睡眠品質', `${avgSleep}%`))
  if (avgHours !== null) rows.push(statRow('平均睡眠時數', `${avgHours.toFixed(1)} 小時`))
  if (avgCare !== null) rows.push(statRow('平均自我照顧', `${avgCare}%`))

  return {
    type: 'flex',
    altText: `上週回顧：一起記錄了 ${totalDays} 天`,
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
          { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'md', contents: rows },
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
