/**
 * 前後端共用的表單與 API 型別。
 * 改動選項時只需改這裡，前端 UI 與後端白名單驗證會一起跟上。
 */

export const ALLERGY_OPTIONS = ['無', '鼻塞', '眼睛癢', '皮膚癢'] as const
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

/** 走路達標的門檻，用於顯示與關聯分析 */
export const STEPS_GOAL = 5000



/** 備註欄位的長度上限 */
export const NOTE_MAX_LENGTH = 200

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
  bowelMovement: boolean | null
  bowelTime: string | null
  bowelNote: string | null
  leaveHomeTime: string | null
  leaveOfficeTime: string | null
  steps: number | null
  allergy: string[]
  allergyNote: string | null
  mood: string | null
  moodNote: string | null
  /** 只給自己的。永遠不會出現在分享卡片上 */
  privateNote: string | null
  liverCare: string[]
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
    bowelMovement: null,
    bowelTime: null,
    bowelNote: null,
    leaveHomeTime: null,
    leaveOfficeTime: null,
    steps: null,
    allergy: [],
    allergyNote: null,
    mood: null,
    moodNote: null,
    privateNote: null,
    liverCare: [],
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
    input.steps !== null,
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

/** 清洗使用者選的項目：必須在項目池內、去重、數量在 2–5 之間 */
export function sanitizeHabits(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const pool = HABIT_POOL as readonly string[]
  const picked = [...new Set(input.filter((v): v is string => typeof v === 'string' && pool.includes(v)))]
  if (picked.length < HABIT_MIN || picked.length > HABIT_MAX) return null
  // 依照項目池的順序排列，畫面上才不會因為點選順序不同而跳來跳去
  return pool.filter((h) => picked.includes(h))
}
