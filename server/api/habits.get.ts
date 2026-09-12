import { HABIT_POOL } from '../../shared/types/record'

/** 讀取自己選的自我照顧項目 */
export default defineEventHandler(async (event) => {
  const { userId } = await verifyIdToken(getIdTokenFromHeader(event))
  const supabase = useSupabase()
  const { data } = await supabase.from('users').select('habits').eq('user_id', userId).maybeSingle()
  return {
    pool: HABIT_POOL,
    habits: Array.isArray(data?.habits) && data.habits.length ? data.habits : null,
  }
})
