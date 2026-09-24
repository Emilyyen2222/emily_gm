/**
 * 前後端共用的表單與 API 型別。
 * 改動選項時只需改這裡，前端 UI 與後端白名單驗證會一起跟上。
 */

export const ALLERGY_OPTIONS = ['今天沒有', '鼻子過敏', '眼睛過敏', '皮膚過敏'] as const

/** 選了這一項就代表沒有其他症狀，兩者互斥 */
export const ALLERGY_NONE = '今天沒有'
export type AllergyOption = (typeof ALLERGY_OPTIONS)[number]

/**
 * 自我照顧的可選項目池。
 *
 * 2026-09 改為每人自選 2–5 項：用一份固定清單定義「照顧自己該長什麼樣子」
 * 對每個人都不準——有人在乎經絡保健，有人在乎冥想寫日誌。清單越長，
 * 每個人看到的無關項目就越多。改成自選之後，達成率才真的有意義。
 */
export const HABIT_POOL = [
  '敲肝經膽經',
  '吃膠原蛋白',
  '吃保健食品',
  '感恩冥想',
  '寫日誌',
  '伸展',
  '早睡',
  '喝足量的水',
  '沒喝酒',
  '運動',
  '沒生氣',
] as const
export type Habit = (typeof HABIT_POOL)[number]

/** 尚未設定過的人，先用原本的三項當預設 */
export const DEFAULT_HABITS: string[] = ['敲肝經膽經', '吃膠原蛋白', '吃保健食品']

export const HABIT_MIN = 2
export const HABIT_MAX = 5
/** 自訂項目的字數上限。太長會在表單的按鈕上撐破版面 */
export const HABIT_LABEL_MAX = 8

/** 睡眠的五個等級。無 0：睡了就不可能是 0%，而且趨勢圖會直接掉到底，看起來像災難。
 *  這五個值與舊資料一致（當初由 1–5 分換算而來）。 */
export const SLEEP_LEVELS = [20, 40, 60, 80, 100] as const

export const MOOD_OPTIONS = ['😊', '😐', '😔', '😡'] as const
export type MoodOption = (typeof MOOD_OPTIONS)[number]

/** 心情換算成分數，用於計算平均與關聯分析 */
export const MOOD_SCORE: Record<string, number> = {
  '😊': 100,
  '😐': 66,
  '😔': 33,
  '😡': 0,
}



/**
 * 體溫的合理範圍。超出這個範圍的多半是打錯（少打小數點、單位打成華氏），
 * 擋下來比存進去好——一筆 365 度會讓整張趨勢圖失去刻度。
 */
export const TEMP_MIN = 34
export const TEMP_MAX = 42

/** 排便一天最多記幾次。這是防呆上限，不是想限制誰 */
export const BOWEL_MAX_TIMES = 10

/** 備註欄位的長度上限 */
export const NOTE_MAX_LENGTH = 200

/** 記帳品項的字數上限。卡片上一行放得下才有意義，太長會擠掉金額 */
export const EXPENSE_ITEM_MAX = 20
/** 一天最多記幾筆。這是防呆上限，不是想限制誰 */
export const EXPENSE_MAX_ITEMS = 20
/** 記帳卡片標題的字數上限。使用者自己寫整句，卡片上只有一行，太長會被截掉 */
export const EXPENSE_LABEL_MAX = 12
/** 單筆金額上限，與資料庫的 check 一致 */
export const EXPENSE_AMOUNT_MAX = 1000000

/**
 * 一筆花費。
 *
 * shared 是「這一筆」要不要出現在分享卡片上，預設 false。
 * 金額比其他欄位敏感，而且送進聊天室就收不回來 —— 寧可少分享，
 * 不可多分享，所以這裡不跟著整張卡片的分享與否走，一筆一筆自己決定。
 */
export interface ExpenseItem {
  item: string
  amount: number
  shared: boolean
}

/**
 * 使用者在表單上填的內容。
 * 所有欄位都可以是 null —— 這是刻意的：使用者可以只填一部分先送出，
 * 晚點再開回來把剩下的補完（同一天走 upsert 更新同一列）。
 */
export interface RecordInput {
  sleepScore: number | null
  /** 由 bedTime 與 wakeTime 自動算出，前端不直接編輯 */
  sleepHours: number | null
  bedTime: string | null
  wakeTime: string | null
  sleepNote: string | null
  /** 早晨剛醒、還沒下床量的基礎體溫。看基礎狀態與發炎程度 */
  morningTemp: number | null
  /** 睡前體溫。看體溫下降與當晚入睡的關聯 */
  nightTemp: number | null
  bowelMovement: boolean | null
  /**
   * 每次排便的時間（HH:MM），記了幾個就是幾次。
   * 表單上還沒選好的那一格是 null，送出時後端會濾掉
   */
  bowelTimes: (string | null)[]
  leaveHomeTime: string | null
  leaveOfficeTime: string | null
  allergy: string[]
  mood: string | null
  moodNote: string | null
  /** 只給自己的。永遠不會出現在分享卡片上 */
  privateNote: string | null
  liverCare: string[]
  /** 今日花費。每一筆自己帶著要不要分享 */
  expenses: ExpenseItem[]
  /** 本次是否分享到群組 */
  shared: boolean
  /** 開啟 LIFF 的來源聊天室（僅群組情境有值） */
  sourceChatId: string | null
}

/** 送往 POST /api/records 的完整 payload */
export interface SubmitRecordPayload extends RecordInput {
  idToken: string
}

/** 後端回傳的一筆紀錄 */
export interface DailyRecord extends RecordInput {
  /**
   * 已停用的備註欄位。表單不再收集（排便備註從未有人使用，過敏備註兩筆），
   * 但舊紀錄仍要能在「每日」分頁看到，資料不該因為欄位下架就憑空消失。
   */
  bowelNote?: string | null
  allergyNote?: string | null
  recordDate: string
  displayName: string | null
  /** 自我照顧達成數，由後端計算 */
  liverScore: number
  /** 當下那筆紀錄的分母（使用者當時選了幾項）。存下來，日後改設定不會讓歷史失真 */
  liverTotal: number
  updatedAt: string | null
}

export interface RecordsResponse {
  /** 後端以 Asia/Taipei 判定的今天，前端一律以此為準 */
  today: string
  records: DailyRecord[]
}

export interface SubmitRecordResponse {
  record: DailyRecord
}

export function emptyRecordInput(): RecordInput {
  return {
    sleepScore: null,
    sleepHours: null,
    bedTime: null,
    wakeTime: null,
    sleepNote: null,
    morningTemp: null,
    nightTemp: null,
    bowelMovement: null,
    bowelTimes: [],
    leaveHomeTime: null,
    leaveOfficeTime: null,
    allergy: [],
    mood: null,
    moodNote: null,
    privateNote: null,
    liverCare: [],
    expenses: [],
    shared: true,
    sourceChatId: null,
  }
}

/** 這筆紀錄填了多少？用於前端顯示完成度，鼓勵使用者回來補完 */
export function countFilled(input: RecordInput): { filled: number; total: number } {
  const checks = [
    input.sleepScore !== null,
    input.bedTime !== null && input.wakeTime !== null,
    input.bowelMovement !== null,
    input.leaveHomeTime !== null,
    input.leaveOfficeTime !== null,
    input.allergy.length > 0,
    input.mood !== null,
    input.liverCare.length > 0,
  ]
  return { filled: checks.filter(Boolean).length, total: checks.length }
}


/** 由入睡與起床時間算出睡眠時數。跨夜是常態，所以負值要加回 24 小時 */
export function computeSleepHours(bedTime: string | null, wakeTime: string | null): number | null {
  if (!bedTime || !wakeTime) return null
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  let diff = toMinutes(wakeTime) - toMinutes(bedTime)
  if (diff <= 0) diff += 24 * 60
  return Math.round((diff / 60) * 10) / 10
}

/** 自我照顧達成率。分母用紀錄當下存下來的值，不受日後改設定影響 */
export function careRate(record: { liverScore: number; liverTotal: number }): number {
  return record.liverTotal > 0 ? Math.round((record.liverScore / record.liverTotal) * 100) : 0
}

/**
 * 清洗使用者選的項目。
 *
 * 允許項目池以外的自訂字串 —— 池子再怎麼加也涵蓋不了每個人，有人想記
 * 「練琴」「不熬夜」，那對他們才是真正的自我照顧。字串不一致（「運動」
 * 與「去運動」）不構成問題，因為我們從不跨使用者比較項目內容：
 * 週報比的是達成率，洞察比的是同一個人有做與沒做的日子。
 */
export function sanitizeHabits(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const cleaned = input
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().slice(0, HABIT_LABEL_MAX))
    .filter(Boolean)
  const picked = [...new Set(cleaned)]
  if (picked.length < HABIT_MIN || picked.length > HABIT_MAX) return null

  // 池子裡的項目照池子的順序排在前面，自訂的接在後面 ——
  // 畫面上才不會因為點選順序不同而每次都跳來跳去
  const pool = HABIT_POOL as readonly string[]
  return [...pool.filter((h) => picked.includes(h)), ...picked.filter((h) => !pool.includes(h))]
}


/** 今日花費小計。只給本人看，不做任何跨使用者比較 */
export function expenseTotal(expenses: ExpenseItem[]): number {
  return expenses.reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0)
}

/** 金額顯示格式，例如 $1,250 */
export function formatAmount(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`
}

/**
 * 清洗體溫輸入。超出合理範圍一律視為沒填（多半是打錯），
 * 小數點後只留一位——體溫計就只有一位，多的位數是假的精度。
 */
export function cleanTemp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n * 10) / 10
  if (rounded < TEMP_MIN || rounded > TEMP_MAX) return null
  return rounded
}
