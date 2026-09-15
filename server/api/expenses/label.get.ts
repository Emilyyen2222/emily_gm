/** 讀自己的記帳稱呼。身分由 ID Token 決定，讀不到別人的 */
export default defineEventHandler(async (event): Promise<{ label: string | null }> => {
  const { userId } = await verifyIdToken(getIdTokenFromHeader(event))
  return { label: await getExpenseLabel(userId) }
})
