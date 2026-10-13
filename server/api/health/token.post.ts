/**
 * 產生健康 App 同步碼。只回傳這一次，之後資料庫裡只有雜湊，忘了就重新產生。
 */
export default defineEventHandler(async (event): Promise<{ token: string }> => {
  const body = await readBody<{ idToken?: string }>(event)
  const { userId } = await verifyIdToken(body?.idToken)
  return { token: await createSyncToken(userId) }
})
