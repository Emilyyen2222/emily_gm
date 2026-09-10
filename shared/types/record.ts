/**
 * 前後端共用的表單與 API 型別。
 * 改動選項時只需改這裡，前端 UI 與後端白名單驗證會一起跟上。
 */

export const ALLERGY_OPTIONS = ['無', '鼻塞', '眼睛癢', '皮膚癢'] as const
export type AllergyOption = (typeof ALLERGY_OPTIONS)[number]

/**
 * 自我照顧的每日習慣。
 * 2026-09 更新：原本是「昨晚 11 點前入睡／無飲酒／早上喝溫水／吃保健食品」，
 * 改成 Emily 實際想追蹤的三項經絡與保健習慣。
 */
export const LIVER_CARE_OPTIONS = ['敲肝經膽經', '吃膠原蛋白', '吃保健食品'] as const
export type LiverCareOption = (typeof LIVER_CARE_OPTIONS)[number]

export const MOOD_OPTIONS = ['😊', '😐', '😔', '😡'] as const
export type MoodOption = (typeof MOOD_OPTIONS)[number]

/**
 * 經期。這是隱私欄位，永遠不會出現在群組卡片上。
 * 追蹤它的理由是它會同時影響睡眠、心情與過敏 —— 少了這個變因，
 * 之後的關聯分析很容易得出錯誤結論。
 */
export const PERIOD_OPTIONS = ['無', '輕', '中', '重'] as const
export type PeriodOption = (typeof PERIOD_OPTIONS)[number]

/** 心情換算成分數，用於計算平均與關聯分析 */
export const MOOD_SCORE: Record<string, number> = {
  '😊': 100,
  '😐': 66,
  '😔': 33,
  '😡': 0,
}

/** 護肝總項數，用於計算達標率 */
export const LIVER_CARE_TOTAL = LIVER_CARE_OPTIONS.length

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
  allergy: string[]
  allergyNote: string | null
  mood: string | null
  moodNote: string | null
  period: string | null
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
  /** 自我照顧達標數，由後端計算 */
  liverScore: number
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
    allergy: [],
    allergyNote: null,
    mood: null,
    moodNote: null,
    period: null,
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
    input.allergy.length > 0,
    input.mood !== null,
    input.period !== null,
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
