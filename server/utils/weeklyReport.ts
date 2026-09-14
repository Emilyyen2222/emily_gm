import { careRate } from '../../shared/types/record'

const C = { orange: '#F9A726', brown: '#3A2513', brownLight: '#6F5B49', cream: '#FFF8EF', border: '#EAD7BD' } as const

/**
 * 個人週報：只含「這一個人」自己的資料，只發到他自己的一對一聊天室。
 *
 * 為什麼不做群組版：
 * 先前的群組週報列出每個人的名字與數字，推播給所有對象——包含一對一
 * 聊天室裡與其他人毫無關係的使用者。那是嚴重的隱私外洩，而且送出去就
 * 收不回來（LINE 沒有讓機器人撤回訊息的 API）。
 *
 * 要做「只列出同群組成員」需要一份可靠的群組成員名單，但我們沒有：
 * webhook 給的群組 ID 與 LIFF 給的並不一致，無法把記錄者對應回群組。
 * 在能百分之百確定名單正確之前，寧可只發個人資料給本人。
 */
export async function buildPersonalWeeklyReport(userId: string, today: string) {
  const start = addDays(today, -7)
  const end = addDays(today, -1)

  const supabase = useSupabase()
  const { data } = await supabase
    .from('records')
    .select('liver_score, liver_total, sleep_score, sleep_hours, record_date')
    .eq('user_id', userId)
    .gte('record_date', start)
    .lte('record_date', end)

  if (!data?.length) return null

  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)
  const sleep = avg(data.map((r) => r.sleep_score).filter((n): n is number => n !== null))
  const hours = avg(data.map((r) => r.sleep_hours).filter((n): n is number => n !== null).map(Number))
  const care = avg(data.map((r) => careRate({ liverScore: r.liver_score ?? 0, liverTotal: r.liver_total ?? 3 })))

  const best = [...data]
    .filter((r) => r.sleep_score !== null)
    .sort((a, b) => (b.sleep_score ?? 0) - (a.sleep_score ?? 0))[0]

  const rows: unknown[] = [statRow('記錄天數', `${data.length} / 7 天`)]
  if (sleep !== null) rows.push(statRow('平均睡眠', `${Math.round(sleep)}%`))
  if (hours !== null) rows.push(statRow('平均睡了', `${hours.toFixed(1)} 小時`))
  if (care !== null) rows.push(statRow('自我照顧', `${Math.round(care)}%`))
  if (best) rows.push(statRow('睡最好的一天', `${best.record_date.slice(5).replace('-', '/')}・${best.sleep_score}%`))

  return {
    type: 'flex',
    altText: `你的上週回顧：記錄了 ${data.length} 天`,
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
              { type: 'text', text: '你的上週回顧', size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
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
          {
            type: 'text',
            text: '想給群組看的話，到「我的紀錄」就能分享',
            size: 'xs',
            color: C.brownLight,
            margin: 'lg',
            wrap: true,
          },
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
