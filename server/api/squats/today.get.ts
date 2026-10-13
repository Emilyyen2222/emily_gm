import type { SquatTodayResponse } from '../../../shared/types/squat'

/**
 * 自己今天的深蹲進度，每日表單與訓練頁顯示用。
 * 身分一律由 ID Token 決定，查詢條件寫死 user_id，不可能回傳別人的資料；
 * 也不回傳加入了哪些群組，只回有沒有加入。
 */
export default defineEventHandler(async (event): Promise<SquatTodayResponse> => {
  const { userId } = await verifyIdToken(getIdTokenFromHeader(event))
  const today = taipeiToday()
  const [{ total, goal }, chatTotal, joined] = await Promise.all([
    getSquatProgress(userId, today),
    getSquatChatTotal(userId, today),
    hasSquatMembership(userId),
  ])
  return { today, total, chatTotal, goal, joined }
})
