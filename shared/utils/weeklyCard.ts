import { careRate, type DailyRecord } from '../types/record'

const C = { orange: '#F9A726', brown: '#3A2513', brownLight: '#6F5B49', cream: '#FFF8EF', border: '#EAD7BD' } as const

/**
 * 上週回顧卡片（使用者主動分享到群組用）。
 *
 * 資料範圍：只含「按下分享的這個人自己」的紀錄。呼叫端傳進來的 records
 * 來自 /api/records/me，那個端點以 ID Token 驗證身分、只回傳本人的資料，
 * 所以這張卡片在任何情況下都不可能含到別人的內容。
 *
 * 送達對象：由使用者按下按鈕、透過 liff.sendMessages() 發到「他自己開啟
 * LIFF 的那個聊天室」。沒有任何自動推播。
 *
 * 區間固定為上週一到上週日，不用「最近 7 天」——每個人的 7 天起點不同的話，
 * 群組裡的數字就沒有互相對照的意義。
 *
 * 不能加任何按鈕：使用者發送的 Flex 訊息帶 action 會被 LINE 以
 * INVALID_MESSAGE 整則拒收。
 */
export function buildWeeklyShareCard(opts: {
  displayName: string | null
  from: string
  to: string
  records: DailyRecord[]
}) {
  const { records } = opts
  const name = opts.displayName ?? '某位夥伴'
  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)

  const sleep = avg(records.map((r) => r.sleepScore).filter((n): n is number => n !== null))
  const hours = avg(records.map((r) => r.sleepHours).filter((n): n is number => n !== null))
  const care = avg(records.map(careRate))

  const rows: unknown[] = [row('記錄天數', `${records.length} / 7 天`)]
  if (sleep !== null) rows.push(row('平均睡眠', `${Math.round(sleep)}%`))
  if (hours !== null) rows.push(row('平均睡了', `${hours.toFixed(1)} 小時`))
  if (care !== null) rows.push(row('自我照顧', `${Math.round(care)}%`))

  return {
    type: 'flex' as const,
    altText: `${name} 的上週回顧：記錄了 ${records.length} 天`,
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
          { type: 'text', text: name, size: 'xl', weight: 'bold', color: C.brown, margin: 'md', wrap: true },
          {
            type: 'text',
            text: `${opts.from.slice(5).replace('-', '/')} – ${opts.to.slice(5).replace('-', '/')}`,
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

function row(label: string, value: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: C.brownLight, flex: 4 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: C.brown, flex: 5, align: 'end' },
    ],
  }
}

/** 上週一與上週日的日期。以台北時區的今天為基準，所有人算出來的區間都一樣 */
export function lastWeekRange(today: string): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number)
  const base = new Date(Date.UTC(y!, m! - 1, d!))
  const weekday = base.getUTCDay() // 0 = 週日
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1
  const monday = new Date(base)
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday - 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) }
}
