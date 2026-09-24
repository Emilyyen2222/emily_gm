import { DEFAULT_EXERCISES, normalizeRows, type WeightUnit, type WorkoutExercise, type WorkoutMax, type WorkoutResponse } from '../../../shared/types/workout'

/** 進步曲線看多久以前的紀錄 */
const HISTORY_DAYS = 180

/**
 * 讀自己某一天的訓練，以及畫進步曲線要的歷史最大重量。
 *
 * 身分一律由 ID Token 決定，查詢條件寫死 user_id —— 這個端點在任何參數
 * 組合下都不可能回傳別人的資料。
 */
export default defineEventHandler(async (event): Promise<WorkoutResponse> => {
  const { userId } = await verifyIdToken(getIdTokenFromHeader(event))
  const today = taipeiToday()
  const date = validWorkoutDate(getQuery(event).date, today) ?? today

  const supabase = useSupabase()
  const [{ data: dayRows }, { data: historyRows }, { data: user }] = await Promise.all([
    supabase
      .from('workouts')
      .select('exercise, unit, sets, shared')
      .eq('user_id', userId)
      .eq('workout_date', date)
      .order('sort_order', { ascending: true }),
    supabase
      .from('workouts')
      .select('workout_date, exercise, unit, sets')
      .eq('user_id', userId)
      .gte('workout_date', addDays(today, -HISTORY_DAYS))
      .order('workout_date', { ascending: true }),
    supabase.from('users').select('custom_exercises').eq('user_id', userId).maybeSingle(),
  ])

  // 資料庫欄位叫 sets（最早是一組一筆），讀出來統一整理成「重量 × 次數 × 組數」
  const exercises: WorkoutExercise[] = (dayRows ?? []).map((r) => ({ exercise: r.exercise, unit: r.unit, rows: normalizeRows(r.sets) }))

  // 每個動作上次用的單位：歷史照日期由舊到新，後面的覆蓋前面的
  const lastUnits: Record<string, WeightUnit> = {}
  const history: WorkoutMax[] = []
  for (const r of historyRows ?? []) {
    lastUnits[r.exercise] = r.unit
    const weights = normalizeRows(r.sets).map((s) => s.weight).filter((w): w is number => w !== null)
    if (weights.length) history.push({ date: r.workout_date, exercise: r.exercise, unit: r.unit, maxWeight: Math.max(...weights) })
  }

  // 自己新增過的，加上歷史裡出現過、但已經不在預設清單的動作（例如預設清單調整過），
  // 否則以前練過的動作會從清單上消失，只能重新打字
  const pastNames = (historyRows ?? []).map((r) => r.exercise as string)
  const custom = [...new Set([...(user?.custom_exercises ?? []), ...pastNames])].filter((e) => !DEFAULT_EXERCISES.includes(e))

  return {
    today,
    date,
    exercises,
    shared: (dayRows ?? []).some((r) => r.shared),
    customExercises: custom,
    lastUnits,
    history,
  }
})
