/**
 * 月經週期前後端共用的規則。資料來自 iPhone 健康 App（經由捷徑同步）。
 * 純函式放這裡，沒有資料庫，才能單獨測試。
 */

/** 捷徑每次送最近幾天，後端就整批取代這幾天 */
export const PERIOD_SYNC_DAYS = 90

/**
 * 同一次經期中間最多可以空幾天。漏記一天（記了 1、2、4 號）不該被當成新的週期。
 * 空兩天以上才算下一次。
 */
const PERIOD_GAP_DAYS = 1

/** GET /api/period/me 的回應 */
export interface PeriodStatusResponse {
  /** 設定過同步碼。沒設定過的人（朋友）表單上完全不顯示這一區 */
  connected: boolean
  /** period = 經期中、cycle = 不在經期、none = 最近沒有紀錄 */
  phase: 'period' | 'cycle' | 'none'
  /** 經期第幾天，或週期第幾天（從最近一次經期第一天算起） */
  day: number | null
}

/**
 * 從經期日期算出今天的狀態。days 是 YYYY-MM-DD，順序不拘。
 * 週期第一天 = 最近一次經期的第一天；今天本身在那次經期裡（含中間空的一天）就是「經期第 N 天」。
 */
export function periodStatus(days: string[], today: string): { phase: PeriodStatusResponse['phase']; day: number | null } {
  const sorted = [...new Set(days)].filter((d) => d <= today).sort()
  if (!sorted.length) return { phase: 'none', day: null }

  // 從最後一天往回找這次經期的第一天
  let start = sorted[sorted.length - 1]!
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (diffDays(sorted[i]!, start) > PERIOD_GAP_DAYS + 1) break
    start = sorted[i]!
  }
  const last = sorted[sorted.length - 1]!
  const day = diffDays(start, today) + 1
  // 只有健康 App 裡今天有記，才算經期中。今天還沒記的話顯示週期第幾天，記了下次同步就會跟上
  const inPeriod = last === today
  return { phase: inPeriod ? 'period' : 'cycle', day }
}

/** 驗證捷徑送來的日期：YYYY-MM-DD、在最近 PERIOD_SYNC_DAYS 天內。不合格的直接丟掉 */
export function sanitizePeriodDates(raw: unknown, today: string): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[\s,，、]+/)
      : []
  const from = shiftDate(today, -(PERIOD_SYNC_DAYS - 1))
  const out = new Set<string>()
  for (const item of list.slice(0, 500)) {
    if (typeof item !== 'string') continue
    const d = item.trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) continue
    if (d < from || d > today) continue
    out.add(d)
  }
  return [...out].sort()
}

/** b 減 a 的天數 */
function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
