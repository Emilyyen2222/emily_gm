import {
  EXPENSE_AMOUNT_MAX,
  EXPENSE_LABEL_MAX,
  EXPENSE_ITEM_MAX,
  EXPENSE_MAX_ITEMS,
  type ExpenseItem,
} from '../../shared/types/record'

/** 資料庫列 -> API 回傳格式 */
export function rowToExpense(row: Record<string, any>): ExpenseItem {
  return {
    item: row.item ?? '',
    amount: Number(row.amount ?? 0),
    shared: row.shared === true,
  }
}

/**
 * 清洗前端送來的花費清單。
 *
 * shared 只認 true，其餘一律 false —— 少分享是可以補的，多分享不行。
 * 沒有品項或金額不是數字的列直接丟掉：那是使用者按了「新增一筆」卻沒填完，
 * 不該因此擋下整張表單的儲存。
 */
export function sanitizeExpenses(input: unknown): ExpenseItem[] {
  if (!Array.isArray(input)) return []
  const cleaned: ExpenseItem[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = typeof (raw as any).item === 'string' ? (raw as any).item.trim().slice(0, EXPENSE_ITEM_MAX) : ''
    const amount = Number((raw as any).amount)
    if (!item || !Number.isFinite(amount)) continue
    cleaned.push({
      item,
      amount: Math.min(EXPENSE_AMOUNT_MAX, Math.max(0, Math.round(amount))),
      shared: (raw as any).shared === true,
    })
    if (cleaned.length >= EXPENSE_MAX_ITEMS) break
  }
  return cleaned
}

/** 讀出某人某幾天的花費，依日期分組。只以 user_id 查詢，不可能讀到別人的 */
export async function getExpensesByDate(
  userId: string,
  from: string,
  to: string,
): Promise<Record<string, ExpenseItem[]>> {
  const supabase = useSupabase()
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .gte('spent_date', from)
    .lte('spent_date', to)
    .order('sort_order', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: `查詢失敗：${error.message}` })

  const grouped: Record<string, ExpenseItem[]> = {}
  for (const row of data ?? []) {
    ;(grouped[row.spent_date] ??= []).push(rowToExpense(row))
  }
  return grouped
}

/**
 * 覆寫某人某一天的花費。
 *
 * 表單每次送出的都是「今天的完整清單」，所以先刪掉當天的列再寫入新的，
 * 使用者刪掉某一筆才會真的消失。刪除範圍鎖在 user_id + spent_date，
 * 動不到別人、也動不到其他日子。
 */
export async function replaceExpenses(userId: string, spentDate: string, expenses: ExpenseItem[]) {
  const supabase = useSupabase()

  const { error: delError } = await supabase
    .from('expenses')
    .delete()
    .eq('user_id', userId)
    .eq('spent_date', spentDate)

  if (delError) throw createError({ statusCode: 500, statusMessage: `寫入失敗：${delError.message}` })

  if (!expenses.length) return []

  const { data, error } = await supabase
    .from('expenses')
    .insert(
      expenses.map((e, i) => ({
        user_id: userId,
        spent_date: spentDate,
        item: e.item,
        amount: e.amount,
        shared: e.shared,
        sort_order: i,
      })),
    )
    .select()

  if (error) throw createError({ statusCode: 500, statusMessage: `寫入失敗：${error.message}` })
  return (data ?? []).map(rowToExpense)
}

/**
 * 記帳卡片的標題。整句由每個人自己填，沒填就是 null（卡片顯示中性的「花費」）。
 * 一定要是每人一份 —— 這個 app 不只一個人在用，寫死在程式裡的話，
 * 別人記帳時卡片上會出現不屬於他的字。
 */
export async function getExpenseLabel(userId: string): Promise<string | null> {
  const supabase = useSupabase()
  const { data } = await supabase.from('users').select('expense_label').eq('user_id', userId).maybeSingle()
  const label = data?.expense_label
  return typeof label === 'string' && label.trim() ? label.trim() : null
}

/** 清洗標題。全空白視同沒填，回 null 把它清掉 */
export function sanitizeExpenseLabel(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim().slice(0, EXPENSE_LABEL_MAX)
  return trimmed || null
}
