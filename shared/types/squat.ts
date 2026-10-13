/**
 * 深蹲挑戰前後端共用的規則。
 *
 * 每天的進度 = 聊天打卡（squat_checkins）+ 訓練頁「深蹲」的次數 × 組數。
 * 純函式放這裡，沒有資料庫與 LINE，才能單獨測試。
 */

/** 訓練頁裡算進挑戰的動作名稱。保加利亞分腿蹲等其他動作不算 */
export const SQUAT_EXERCISE = '深蹲'
export const SQUAT_GOAL_DEFAULT = 100
/** 目標與單次打卡的上限，與資料庫的 check 一致 */
export const SQUAT_GOAL_MAX = 1000
export const SQUAT_REPS_MAX = 1000
/** 連續天數往回看多久。超過就顯示到這裡為止 */
export const SQUAT_STREAK_LOOKBACK = 366

/** GET /api/squats/today 的回應 */
export interface SquatTodayResponse {
  today: string
  /** 兩邊加總 */
  total: number
  /** 只有聊天打卡的部分。訓練頁顯示用，那裡改不到這些 */
  chatTotal: number
  goal: number
  /** 最近 7 天有沒有蹲過。從沒蹲過的人不顯示進度，不讓他每天看到 0/100 */
  recent: boolean
}

export type SquatCommand =
  | { type: 'checkin'; reps: number }
  /** 「深蹲六十」這種：看得出是想打卡，但不是數字 */
  | { type: 'checkin-not-number' }
  | { type: 'undo' }
  | { type: 'goal'; goal: number | null }

/**
 * 只認完整的指令格式。群組裡打卡不用 @，所以「我昨天深蹲 60 下好累」
 * 這種聊天不能被當成打卡 —— 一律從頭比到尾。
 * 數字超出範圍時 goal 回 null，由呼叫端提示。
 */
export function parseSquatCommand(raw: string): SquatCommand | null {
  const text = raw.trim()

  const checkin = text.match(/^深蹲\s*(\d{1,5})\s*[下次]?$/)
  if (checkin) {
    const reps = Number(checkin[1])
    return reps >= 1 && reps <= SQUAT_REPS_MAX ? { type: 'checkin', reps } : { type: 'checkin-not-number' }
  }
  if (/^深蹲\s*[零〇一二兩三四五六七八九十百千]+\s*[下次]?$/.test(text)) return { type: 'checkin-not-number' }

  if (/^取消深蹲$/.test(text)) return { type: 'undo' }

  const goal = text.match(/^深蹲目標\s*(\S+?)\s*[下次]?$/)
  if (goal) return { type: 'goal', goal: parseGoal(goal[1]!) }

  return null
}

/** 1～上限的整數，其餘回 null */
function parseGoal(s: string): number | null {
  if (!/^\d{1,5}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= SQUAT_GOAL_MAX ? n : null
}

/**
 * 截至 endDate 為止，連續達標幾天（含 endDate）。endDate 沒達標就是 0。
 * 用「現在的目標」回頭算：改了目標，過去的天數會照新目標重算。
 */
export function squatStreak(daily: Record<string, number>, goal: number, endDate: string): number {
  let streak = 0
  let date = endDate
  while (streak < SQUAT_STREAK_LOOKBACK && (daily[date] ?? 0) >= goal) {
    streak++
    date = shiftDate(date, -1)
  }
  return streak
}

/** 打卡後的回覆。name 只在群組裡帶 */
export function squatProgressText(opts: { name: string | null; total: number; goal: number; streak: number }): string {
  const who = opts.name ? `${opts.name} ` : ''
  if (opts.total < opts.goal) return `✅ ${who}今天 ${opts.total}/${opts.goal}`
  const streak = opts.streak >= 2 ? `，連續 ${opts.streak} 天` : ''
  return `🎉 ${who}今天 ${opts.total}/${opts.goal} 達標${streak}`
}

export interface SquatBoardMember {
  name: string
  /** 昨天有沒有在這個群組打卡。沒有的不列名字，但近 7 天的合計照算 */
  checkedInHere: boolean
  goal: number
  /** 日期 → 當天次數。至少要涵蓋近 7 天，算連續天數則要更久 */
  daily: Record<string, number>
}

/**
 * 早上提醒附的看板文字。members 必須「已經」只剩近 7 天在這個群組打過卡、而且確認還在群組的人。
 * 只列昨天在這個群組打過卡的人；沒有就回 null，不附看板。
 * 次數是那個人昨天的總數（含一對一打卡與訓練頁），跟打卡時 bot 在群組回的數字一致。
 * 近 7 天的合計算全部 members（包括昨天沒打卡、所以沒列出名字的人）。
 */
export function squatBoardText(members: SquatBoardMember[], yesterday: string): string | null {
  const lines: string[] = []
  for (const m of members) {
    const total = m.daily[yesterday] ?? 0
    if (!m.checkedInHere || total <= 0) continue
    if (total < m.goal) {
      lines.push(`${m.name} ${total}/${m.goal}`)
      continue
    }
    const streak = squatStreak(m.daily, m.goal, yesterday)
    lines.push(`${m.name} ${total}/${m.goal} 🎉${streak >= 2 ? ` 連續 ${streak} 天` : ''}`)
  }
  if (!lines.length) return null

  let week = 0
  for (const m of members) {
    for (let i = 0; i < 7; i++) week += m.daily[shiftDate(yesterday, -i)] ?? 0
  }
  return ['昨天的深蹲', ...lines, `近 7 天大家一共 ${week} 下`].join('\n')
}

/** YYYY-MM-DD 加減天數。shared 裡用不到 server 的 addDays，自己算一份 */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
