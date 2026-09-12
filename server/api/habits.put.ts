import { sanitizeHabits } from '../../shared/types/record'

/** 儲存自己選的自我照顧項目 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ idToken?: string; habits?: unknown }>(event)
  const { userId, displayName } = await verifyIdToken(body?.idToken)

  const habits = sanitizeHabits(body?.habits)
  if (!habits) {
    throw createError({ statusCode: 400, statusMessage: '請選 2 到 5 項' })
  }

  const supabase = useSupabase()
  const { error } = await supabase
    .from('users')
    .upsert({ user_id: userId, display_name: displayName, habits }, { onConflict: 'user_id' })
  if (error) {
    throw createError({ statusCode: 500, statusMessage: `儲存失敗：${error.message}` })
  }

  return { habits }
})
