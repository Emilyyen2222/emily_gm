/**
 * 訓練紀錄（重量訓練）前後端共用的型別與規則。
 * 有氧（時間、距離）刻意先不做，只記重量與次數。
 */

/**
 * 預設的動作清單：第一組下肢、第二組上肢，每組裡最常做的排前面。
 * 畫面上只用間距把兩組稍微分開，不寫分類標題。
 * 自己新增的動作另外存在 users.custom_exercises
 */
export const EXERCISE_GROUPS: readonly (readonly string[])[] = [
  ['硬舉', '深蹲', '保加利亞分腿蹲', '腿推', '臀推'],
  ['引體向上', '胸推', '肩推', '槓鈴划船', '滑輪下拉'],
]

export const DEFAULT_EXERCISES: readonly string[] = EXERCISE_GROUPS.flat()

export const WEIGHT_UNITS = ['kg', 'lb'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

/** 動作名稱的字數上限。卡片上一行放得下才有意義 */
export const EXERCISE_NAME_MAX = 12
/** 一天最多幾個動作、每個動作最多幾行、一行最多幾組。這是防呆上限，不是想限制誰 */
export const WORKOUT_MAX_EXERCISES = 15
export const WORKOUT_MAX_ROWS = 10
export const SETS_MAX = 50
export const WEIGHT_MAX = 1000
export const REPS_MAX = 1000

export const LB_PER_KG = 2.20462

/**
 * 一行：「重量 × 次數 × 組數」，健身記錄的一般寫法。
 * 大部分動作一行就記完；中途換重量（例如漸增）才會有第二行。
 * weight 為 null 代表自體重。表單上還沒填的格子也可能是 null，送出時後端會處理。
 */
export interface WorkoutRow {
  weight: number | null
  reps: number | null
  sets: number | null
}

export interface WorkoutExercise {
  exercise: string
  /** 每個動作各自選單位：同一間健身房裡，啞鈴可能是 lb、槓鈴是 kg */
  unit: WeightUnit
  rows: WorkoutRow[]
}

/** 某個動作在某天的最大重量，畫進步曲線用 */
export interface WorkoutMax {
  date: string
  exercise: string
  unit: WeightUnit
  maxWeight: number
}

export interface WorkoutResponse {
  /** 後端以 Asia/Taipei 判定的今天 */
  today: string
  date: string
  exercises: WorkoutExercise[]
  shared: boolean
  /** 自己新增過的動作 */
  customExercises: string[]
  /** 每個動作上次用的單位，新加動作時預設用它 */
  lastUnits: Record<string, WeightUnit>
  /** 最近的最大重量紀錄，畫進步曲線用 */
  history: WorkoutMax[]
}

/** 換算到指定單位，保留一位小數 */
export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight
  const converted = from === 'lb' ? weight / LB_PER_KG : weight * LB_PER_KG
  return Math.round(converted * 10) / 10
}

/** 重量顯示：整數不帶小數點，其餘留一位 */
export function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1)
}

/**
 * 整理資料庫裡的 sets 欄位。
 * 最早的版本是一組一筆（{weight, reps}，沒有 sets），讀出來時把連續相同的合併成
 * 「重量 × 次數 × 組數」，舊紀錄就會以新的寫法顯示，不會遺失。
 */
export function normalizeRows(raw: unknown): WorkoutRow[] {
  const rows: WorkoutRow[] = (Array.isArray(raw) ? raw : []).map((r: any) => ({
    weight: typeof r?.weight === 'number' ? r.weight : null,
    reps: typeof r?.reps === 'number' ? r.reps : null,
    sets: typeof r?.sets === 'number' ? r.sets : 1,
  }))
  const merged: WorkoutRow[] = []
  for (const r of rows) {
    const last = merged[merged.length - 1]
    if (last && last.weight === r.weight && last.reps === r.reps) last.sets = (last.sets ?? 1) + (r.sets ?? 1)
    else merged.push({ ...r })
  }
  return merged
}

/**
 * 清洗前端送來的訓練內容。不信任任何前端數值：
 * 名稱截長度、單位白名單、重量與次數限範圍，沒填次數的行直接丟掉，沒填組數當 1 組。
 */
export function sanitizeWorkout(raw: unknown): WorkoutExercise[] {
  if (!Array.isArray(raw)) return []
  const out: WorkoutExercise[] = []
  const seen = new Set<string>()

  for (const item of raw.slice(0, WORKOUT_MAX_EXERCISES)) {
    const exercise = typeof item?.exercise === 'string' ? item.exercise.trim().slice(0, EXERCISE_NAME_MAX) : ''
    // 同一天同一個動作只留一份，否則進步曲線會算重複
    if (!exercise || seen.has(exercise)) continue

    const unit: WeightUnit = (WEIGHT_UNITS as readonly string[]).includes(item?.unit) ? item.unit : 'kg'
    const cleaned = (Array.isArray(item?.rows) ? item.rows : [])
      .slice(0, WORKOUT_MAX_ROWS)
      .map((r: any) => ({
        weight: cleanNumber(r?.weight, WEIGHT_MAX),
        reps: cleanInteger(r?.reps, REPS_MAX),
        sets: cleanInteger(r?.sets, SETS_MAX) ?? 1,
      }))
      .filter((r: WorkoutRow) => r.reps !== null)
    const rows = normalizeRows(cleaned)

    if (!rows.length) continue
    seen.add(exercise)
    out.push({ exercise, unit, rows })
  }
  return out
}

function cleanNumber(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(max, Math.round(n * 10) / 10)
}

function cleanInteger(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(max, n)
}

/**
 * 卡片上一個動作的摘要：「60 kg × 8 下 × 3 組」，換過重量就用頓號接下一行；
 * 沒填重量寫「自體重」。
 */
export function summarizeSets(ex: WorkoutExercise): string {
  return ex.rows
    .filter((r) => r.reps !== null)
    .map((r) => `${r.weight === null ? '自體重' : `${formatWeight(r.weight)} ${ex.unit}`} × ${r.reps} 下 × ${r.sets ?? 1} 組`)
    .join('、')
}
