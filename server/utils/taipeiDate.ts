const TAIPEI = 'Asia/Taipei'

/**
 * Vercel 的執行環境是 UTC，直接用 new Date() 取日期會在台灣時間 08:00 之前
 * 算成前一天。所有「今天是哪一天」的判斷都必須經過這裡。
 */
export function taipeiToday(base: Date = new Date()): string {
  // en-CA 的日期格式正好是 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base)
}

/** 台北時區的星期幾，0 = 星期日 */
export function taipeiWeekday(base: Date = new Date()): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: TAIPEI, weekday: 'short' }).format(base)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short)
}

/** 對 YYYY-MM-DD 加減天數，回傳同樣格式 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  // 用 UTC 建構避免本地時區把日期推掉一天
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
