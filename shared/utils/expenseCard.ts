import { EXPENSE_ITEM_MAX, formatAmount, type ExpenseItem } from '../types/record'

// 與每日卡片同一套色票
const C = {
  orange: '#F9A726',
  brown: '#3A2513',
  brownLight: '#6F5B49',
  cream: '#FFF8EF',
  border: '#EAD7BD',
} as const

/**
 * 花費卡片。
 *
 * 資料範圍：只含「按下按鈕的這個人自己」標成分享的那幾筆花費。沒標分享的
 * 不會出現，連筆數與總計都不透露 —— 卡片上的合計只加得出已分享的那幾筆，
 * 否則從差額就能反推出沒分享的金額。卡片上沒有任何健康資料。
 *
 * 送達對象：使用者按下按鈕，透過 liff.sendMessages() 發到「他自己開啟 LIFF
 * 的那個聊天室」。沒有任何自動推播，也不會出現在每日提醒或週報裡。
 *
 * 不能加任何按鈕：使用者發送的 Flex 訊息帶 action 會被 LINE 以
 * INVALID_MESSAGE 整則拒收。
 */
/**
 * 卡片頂端那一行。
 *
 * 稱呼是每個人自己在表單裡填的，沒填就用中性的「花費」——
 * 這個 app 不只一個人在用，標題裡不能出現不屬於這個人的名字。
 */
export function expenseCardTitle(label: string | null): string {
  return label ? `記給 ${label}` : '花費'
}

export function buildExpenseFlexMessage(opts: {
  displayName: string | null
  date: string
  expenses: ExpenseItem[]
  /** 使用者自己填的稱呼，例如男友的暱稱。沒填就是 null */
  label?: string | null
}) {
  const shared = opts.expenses.filter((e) => e.shared && e.item.trim())
  if (!shared.length) return null

  const name = opts.displayName ?? '某位夥伴'
  const total = shared.reduce((sum, e) => sum + e.amount, 0)
  const date = opts.date.slice(5).replace('-', '/')
  const title = expenseCardTitle(opts.label ?? null)

  return {
    type: 'flex' as const,
    altText: `${name}・${title}：${date} 共 ${shared.length} 筆、合計 ${formatAmount(total)}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: C.cream,
        paddingAll: '18px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', width: '4px', backgroundColor: C.orange, cornerRadius: '2px', contents: [] },
              { type: 'text', text: `💰 ${title}・${date}`, size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
            ],
          },
          { type: 'text', text: name, size: 'xl', weight: 'bold', color: C.brown, wrap: true, margin: 'md' },
          { type: 'separator', margin: 'lg', color: C.border },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'md',
            contents: shared.map((e) => ({
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: e.item.slice(0, EXPENSE_ITEM_MAX),
                  size: 'sm',
                  color: C.brownLight,
                  flex: 5,
                  wrap: true,
                },
                { type: 'text', text: formatAmount(e.amount), size: 'sm', weight: 'bold', color: C.brown, flex: 3, align: 'end' },
              ],
            })),
          },
          { type: 'separator', margin: 'lg', color: C.border },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'lg',
            contents: [
              { type: 'text', text: '合計', size: 'sm', weight: 'bold', color: C.brown, flex: 5 },
              { type: 'text', text: formatAmount(total), size: 'md', weight: 'bold', color: C.orange, flex: 3, align: 'end' },
            ],
          },
        ],
      },
    },
  }
}
