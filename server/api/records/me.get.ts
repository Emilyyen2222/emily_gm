import type { RecordsResponse } from '../../../shared/types/record'

/**
 * 查詢自己的近期紀錄。
 * 回傳的 today 是後端以台北時區判定的日期，前端要用它來比對「今天填過了沒」，
 * 不要自己算 —— 使用者的手機時區不一定是台北。
 */
export default defineEventHandler(async (event): Promise<RecordsResponse> => {
  const { userId } = await verifyIdToken(getIdTokenFromHeader(event))

  const query = getQuery(event)
  const days = Math.min(90, Math.max(1, Number(query.days) || 7))

  const today = taipeiToday()
  const since = addDays(today, -(days - 1))

  const supabase = useSupabase()
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('user_id', userId)
    .gte('record_date', since)
    .lte('record_date', today)
    .order('record_date', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: `查詢失敗：${error.message}` })
  }

  return { today, records: (data ?? []).map(rowToRecord) }
})
