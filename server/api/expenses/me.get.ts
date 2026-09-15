import { expenseTotal, type ExpenseItem } from '../../../shared/types/record'

export interface MonthlyExpensesResponse {
  /** YYYY-MM，後端以台北時區決定的預設值 */
  month: string
  /** 由新到舊，只有真的記過的日子才會出現 */
  days: { date: string; items: ExpenseItem[]; total: number }[]
  total: number
}

/**
 * 查詢自己某一個月的花費。
 *
 * 身分一律由 ID Token 決定，查詢條件寫死 user_id —— 這個端點在任何參數
 * 組合下都不可能回傳別人的資料，也沒有任何跨使用者的彙總。
 *
 * 不沿用 /api/records/me 的 30 天視窗：那個視窗算不出完整的「本月」，
 * 而把它拉長又會連帶改變趨勢圖與洞察的統計區間。
 */
export default defineEventHandler(async (event): Promise<MonthlyExpensesResponse> => {
  const { userId } = await verifyIdToken(getIdTokenFromHeader(event))

  const raw = String(getQuery(event).month ?? '')
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : taipeiToday().slice(0, 7)

  const from = `${month}-01`
  // 下個月的 0 號就是這個月的最後一天，閏年與大小月都不必自己判斷
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year!, mon!, 0)).getUTCDate()
  const to = `${month}-${String(lastDay).padStart(2, '0')}`

  const grouped = await getExpensesByDate(userId, from, to)

  const days = Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ date, items: grouped[date]!, total: expenseTotal(grouped[date]!) }))

  return { month, days, total: days.reduce((sum, d) => sum + d.total, 0) }
})
