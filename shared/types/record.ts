/**
 * 前後端共用的表單與 API 型別。
 * 改動選項時只需改這裡，前端 UI 與後端驗證會一起跟上。
 */

export const ALLERGY_OPTIONS = ['無', '鼻塞', '打噴嚏', '眼睛癢'] as const
export type AllergyOption = (typeof ALLERGY_OPTIONS)[number]

export const LIVER_CARE_OPTIONS = [
  '昨晚11點前入睡',
  '無飲酒',
  '早上喝溫水',
  '吃保健食品',
] as const
export type LiverCareOption = (typeof LIVER_CARE_OPTIONS)[number]

export const MOOD_OPTIONS = ['😊', '😐', '😔', '😡'] as const
export type MoodOption = (typeof MOOD_OPTIONS)[number]

/** 護肝總項數，用於計算達標率 */
export const LIVER_CARE_TOTAL = LIVER_CARE_OPTIONS.length

/** 使用者在表單上填的內容 */
export interface RecordInput {
  sleepScore: number | null
  sleepHours: number | null
  bowelMovement: boolean | null
  bowelTime: string | null
  allergy: string[]
  mood: string | null
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
  /** 護肝達標數，由後端計算 */
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
    bowelMovement: null,
    bowelTime: null,
    allergy: [],
    mood: null,
    liverCare: [],
    shared: true,
    sourceChatId: null,
  }
}
