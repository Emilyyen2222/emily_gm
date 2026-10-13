import type { PeriodStatusResponse } from '../../../shared/types/period'

/**
 * 自己今天在週期的第幾天。身分一律由 ID Token 決定，不可能回傳別人的資料。
 * 只回狀態與天數，不回傳日期清單。
 */
export default defineEventHandler(async (event): Promise<PeriodStatusResponse> => {
  const { userId } = await verifyIdToken(getIdTokenFromHeader(event))
  return getPeriodStatus(userId, taipeiToday())
})
