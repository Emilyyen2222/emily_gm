import { DEFAULT_EXERCISES, sanitizeWorkout, type WorkoutExercise } from '../../../shared/types/workout'

/** 自己新增的動作最多記幾個。這是防呆上限，不是想限制誰 */
const CUSTOM_EXERCISES_MAX = 50

/**
 * 儲存自己某一天的訓練：整天的內容整批取代（刪掉舊的再寫入）。
 * 頁面上刪掉的動作，存檔後在資料庫裡也要消失，逐筆比對反而容易漏。
 */
export default defineEventHandler(async (event): Promise<{ date: string; exercises: WorkoutExercise[] }> => {
  const body = await readBody<{ idToken?: string; date?: unknown; exercises?: unknown; shared?: unknown }>(event)
  const { userId, displayName } = await verifyIdToken(body?.idToken)

  const today = taipeiToday()
  const date = validWorkoutDate(body?.date, today)
  if (!date) throw createError({ statusCode: 400, statusMessage: '日期不對' })

  const exercises = sanitizeWorkout(body?.exercises)
  const shared = body?.shared === true
  const supabase = useSupabase()

  const { error: deleteError } = await supabase.from('workouts').delete().eq('user_id', userId).eq('workout_date', date)
  if (deleteError) throw createError({ statusCode: 500, statusMessage: `儲存失敗：${deleteError.message}` })

  if (exercises.length) {
    const { error } = await supabase.from('workouts').insert(
      exercises.map((ex, i) => ({
        user_id: userId,
        workout_date: date,
        exercise: ex.exercise,
        unit: ex.unit,
        sets: ex.rows,
        shared,
        sort_order: i,
      })),
    )
    if (error) throw createError({ statusCode: 500, statusMessage: `儲存失敗：${error.message}` })
  }

  // 用過的自訂動作記起來，下次直接出現在清單裡
  const custom = exercises.map((e) => e.exercise).filter((e) => !DEFAULT_EXERCISES.includes(e))
  if (custom.length) {
    const { data: user } = await supabase.from('users').select('custom_exercises').eq('user_id', userId).maybeSingle()
    const merged = [...new Set([...(user?.custom_exercises ?? []), ...custom])].slice(-CUSTOM_EXERCISES_MAX)
    await supabase
      .from('users')
      .upsert({ user_id: userId, display_name: displayName, custom_exercises: merged }, { onConflict: 'user_id' })
  }

  return { date, exercises }
})
