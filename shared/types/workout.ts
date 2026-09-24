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
/** 一天最多幾個動作、每個動作最多幾組。這是防呆上限，不是想限制誰 */
export const WORKOUT_MAX_EXERCISES = 15
export const WORKOUT_MAX_SETS = 20
export const WEIGHT_MAX = 1000
export const REPS_MAX = 1000

export const LB_PER_KG = 2.20462

/**
 * 一組。weight 為 null 代表自體重（引體向上這類）。
 * 表單上還沒填的格子 reps 也可能是 null，送出時後端會濾掉。
 */
export interface WorkoutSet {
  weight: number | null
  reps: number | null
}

export interface WorkoutExercise {
  exercise: string
  /** 每個動作各自選單位：同一間健身房裡，啞鈴可能是 lb、槓鈴是 kg */
  unit: WeightUnit
  sets: WorkoutSet[]
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
 * 清洗前端送來的訓練內容。不信任任何前端數值：
 * 名稱截長度、單位白名單、重量與次數限範圍，沒填次數的組直接丟掉。
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
    const sets: WorkoutSet[] = (Array.isArray(item?.sets) ? item.sets : [])
      .slice(0, WORKOUT_MAX_SETS)
      .map((s: any) => ({ weight: cleanNumber(s?.weight, WEIGHT_MAX), reps: cleanInteger(s?.reps, REPS_MAX) }))
      .filter((s: WorkoutSet) => s.reps !== null)

    if (!sets.length) continue
    seen.add(exercise)
    out.push({ exercise, unit, sets })
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
 * 卡片上一個動作的摘要。
 * 每組都一樣：「60 kg × 8 × 3 組」；每組不同：「40×10、45×8、45×6 kg」；沒填重量是「自體重」。
 */
export function summarizeSets(ex: WorkoutExercise): string {
  const sets = ex.sets.filter((s) => s.reps !== null)
  if (!sets.length) return ''
  const w = (weight: number | null) => (weight === null ? '自體重' : formatWeight(weight))

  const first = sets[0]!
  const allSame = sets.every((s) => s.weight === first.weight && s.reps === first.reps)
  if (allSame) {
    const weight = first.weight === null ? '自體重' : `${formatWeight(first.weight)} ${ex.unit}`
    return `${weight} × ${first.reps}${sets.length > 1 ? ` × ${sets.length} 組` : ''}`
  }

  const parts = sets.map((s) => `${w(s.weight)}×${s.reps}`).join('、')
  return sets.some((s) => s.weight !== null) ? `${parts} ${ex.unit}` : parts
}
