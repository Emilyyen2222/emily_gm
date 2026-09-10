import {
  ALLERGY_OPTIONS,
  LIVER_CARE_OPTIONS,
  MOOD_OPTIONS,
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
    bowelMovement: row.bowel_movement ?? null,
    bowelTime: row.bowel_time ? String(row.bowel_time).slice(0, 5) : null,
    allergy: row.allergy ?? [],
    mood: row.mood ?? null,
    liverCare: row.liver_care ?? [],
    liverScore: row.liver_score ?? 0,
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

function clampScore(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(5, Math.max(1, Math.round(n)))
}

function clampHours(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(24, Math.max(0, Math.round(n * 10) / 10))
}

/**
 * 清洗前端送來的表單內容。
 * 不信任任何前端數值，包含護肝分數 —— 那是後端依 liverCare 自行算出來的。
 */
export function sanitizeRecordInput(input: Partial<RecordInput>) {
  const liverCare = whitelist(input.liverCare, LIVER_CARE_OPTIONS)
  const allergy = whitelist(input.allergy, ALLERGY_OPTIONS)

  return {
    sleepScore: input.sleepScore === null || input.sleepScore === undefined ? null : clampScore(input.sleepScore),
    sleepHours: input.sleepHours === null || input.sleepHours === undefined ? null : clampHours(input.sleepHours),
    bowelMovement: typeof input.bowelMovement === 'boolean' ? input.bowelMovement : null,
    // 沒排便就不該有排便時間
    bowelTime: input.bowelMovement === true && isTimeString(input.bowelTime) ? input.bowelTime : null,
    // 選了「無」就不該同時有其他症狀
    allergy: allergy.includes('無') ? ['無'] : allergy,
    mood: typeof input.mood === 'string' && (MOOD_OPTIONS as readonly string[]).includes(input.mood) ? input.mood : null,
    liverCare,
    liverScore: liverCare.length,
    shared: input.shared === true,
    sourceChatId: typeof input.sourceChatId === 'string' && input.sourceChatId ? input.sourceChatId : null,
  }
}

function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
