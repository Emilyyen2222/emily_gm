/** 存自己的記帳稱呼。空字串代表清掉，卡片就回到中性標題 */
export default defineEventHandler(async (event): Promise<{ label: string | null }> => {
  const body = await readBody<{ idToken?: string; label?: unknown }>(event)
  const { userId, displayName } = await verifyIdToken(body?.idToken)

  const label = sanitizeExpenseLabel(body?.label)

  const supabase = useSupabase()
  const { error } = await supabase
    .from('users')
    .upsert({ user_id: userId, display_name: displayName, expense_label: label }, { onConflict: 'user_id' })
  if (error) {
    throw createError({ statusCode: 500, statusMessage: `儲存失敗：${error.message}` })
  }

  return { label }
})
