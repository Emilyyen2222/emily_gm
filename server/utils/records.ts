import {
  ALLERGY_OPTIONS,
  DEFAULT_HABITS,
  MOOD_OPTIONS,
  NOTE_MAX_LENGTH,
  computeSleepHours,
  type DailyRecord,
  type RecordInput,
} from '../../shared/types/record'

/** 資料庫列 -> API 回傳格式（snake_case -> camelCase） */
export function rowToRecord(row: Record<string, any>): DailyRecord {
  return {
    recordDate: row.record_date,
    displayName: row.display_name ?? null,
    sleepScore: row.sleep_score ?? null,
    sleepHours: row.sleep_hours === null || row.sleep_hours === undefined ? null : Number(row.sleep_hours),
    bedTime: row.bed_time ? String(row.bed_time).slice(0, 5) : null,
    wakeTime: row.wake_time ? String(row.wake_time).slice(0, 5) : null,
    sleepNote: row.sleep_note ?? null,
    bowelMovement: row.bowel_movement ?? null,
    bowelTime: row.bowel_time ? String(row.bowel_time).slice(0, 5) : null,
    bowelNote: row.bowel_note ?? null,
    leaveHomeTime: row.leave_home_time ? String(row.leave_home_time).slice(0, 5) : null,
    leaveOfficeTime: row.leave_office_time ? String(row.leave_office_time).slice(0, 5) : null,
    steps: row.steps ?? null,
    allergy: row.allergy ?? [],
    allergyNote: row.allergy_note ?? null,
    mood: row.mood ?? null,
    moodNote: row.mood_note ?? null,
    privateNote: row.private_note ?? null,
    liverCare: row.liver_care ?? [],
    liverScore: row.liver_score ?? 0,
    liverTotal: row.liver_total ?? DEFAULT_HABITS.length,
    shared: row.shared ?? false,
    sourceChatId: row.source_chat_id ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

/** 只保留白名單內的選項，擋掉前端亂送的值 */
function whitelist(values: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && allowed.includes(v)))]
}

/** 睡眠滿意度是 0-100 的百分比，以 5 為級距 */
function clampScore(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, Math.round(n / 5) * 5))
}

/**
 * 清洗前端送來的表單內容。
 * 不信任任何前端數值，包含護肝分數 —— 那是後端依 liverCare 自行算出來的。
 */
export function sanitizeRecordInput(input: Partial<RecordInput>, habits: string[]) {
  // 白名單是「這個人自己選的項目」，不是全域清單 ——
  // 否則有人送出池子裡但自己沒選的項目，達成數會超過分母
  const liverCare = whitelist(input.liverCare, habits)
  const allergy = whitelist(input.allergy, ALLERGY_OPTIONS)

  const bedTime = isTimeString(input.bedTime) ? input.bedTime : null
  const wakeTime = isTimeString(input.wakeTime) ? input.wakeTime : null

  return {
    sleepScore: input.sleepScore === null || input.sleepScore === undefined ? null : clampScore(input.sleepScore),
    // 睡眠時數一律由後端從入睡／起床時間算出，不接受前端傳入
    sleepHours: computeSleepHours(bedTime, wakeTime),
    bedTime,
    wakeTime,
    sleepNote: cleanNote(input.sleepNote),
    bowelMovement: typeof input.bowelMovement === 'boolean' ? input.bowelMovement : null,
    // 沒排便就不該有排便時間
    bowelTime: input.bowelMovement === true && isTimeString(input.bowelTime) ? input.bowelTime : null,
    bowelNote: cleanNote(input.bowelNote),
    leaveHomeTime: isTimeString(input.leaveHomeTime) ? input.leaveHomeTime : null,
    leaveOfficeTime: isTimeString(input.leaveOfficeTime) ? input.leaveOfficeTime : null,
    steps: clampSteps(input.steps),
    // 選了「無」就不該同時有其他症狀
    allergy: allergy.includes('無') ? ['無'] : allergy,
    allergyNote: cleanNote(input.allergyNote),
    mood: typeof input.mood === 'string' && (MOOD_OPTIONS as readonly string[]).includes(input.mood) ? input.mood : null,
    moodNote: cleanNote(input.moodNote),
    privateNote: cleanNote(input.privateNote),
    liverCare,
    liverScore: liverCare.length,
    liverTotal: habits.length,
    shared: input.shared === true,
    sourceChatId: typeof input.sourceChatId === 'string' && input.sourceChatId ? input.sourceChatId : null,
  }
}

/** 步數：上限取一個極端但仍可能的值，擋掉明顯的輸入錯誤（例如多打一個零） */
function clampSteps(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(200000, Math.max(0, Math.round(n)))
}

/** 備註：去頭尾空白、截斷過長內容，全空白視同沒填 */
function cleanNote(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, NOTE_MAX_LENGTH)
}

function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
