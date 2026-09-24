import { careRate, type DailyRecord } from '../types/record'

// 與 tailwind.config.ts 同一套色票（SugarTopia 色系）。
// Flex Message 只吃 hex 字串，無法引用 Tailwind class，所以在這裡複寫一份。
const C = {
  orange: '#F9A726',
  gold: '#FCDC94',
  brown: '#3A2513',
  brownLight: '#6F5B49',
  cream: '#FFF8EF',
  border: '#EAD7BD',
} as const

/** 卡片上每則備註的顯示上限。想看全文的人可以直接問本人 */
const NOTE_PREVIEW_LENGTH = 60

/**
 * 每日分享卡片。
 *
 * 公開範圍：除了 privateNote（「只給自己的」），其餘欄位都會出現在這裡。
 * privateNote 是使用者唯一確定不會被看到的地方，任何情況下都不得放進卡片。
 *
 * 花費不在這張卡片上，一筆都沒有。記帳的分享對象與健康紀錄不同（是特定
 * 某個人，不是朋友群組），所以獨立成 expenseCard.ts 的另一張卡、由另一顆
 * 按鈕發送。把兩者放同一張卡的話，往群組分享今日狀態就會連金額一起送出去。
 *
 * 這張卡片不能有任何按鈕。它是透過 liff.sendMessages() 以使用者的名義發出的，
 * 而那條路徑不接受含 action 的 Flex 訊息——整則會被以 400 INVALID_MESSAGE 拒收，
 * 連帶讓使用者以為儲存失敗。實測確認：同一張卡片拿掉 footer 按鈕就能送出。
 * （LINE 的 validate/push 端點驗的是機器人發送那條路，會放行，不能用來驗這張卡。）
 */
export function buildDailyFlexMessage(record: DailyRecord) {
  const name = record.displayName ?? '某位夥伴'
  const percent = careRate(record)

  const notes = [
    { label: '夢', value: record.sleepNote },
    { label: '心情', value: record.moodNote },
  ].filter((n): n is { label: string; value: string } => Boolean(n.value))

  // 欄位順序刻意與表單一致：使用者剛填完就看到卡片，兩邊順序不同會讓人
  // 一時對不上自己填了什麼。
  const rows: unknown[] = []
  if (record.sleepScore !== null) rows.push(row('睡眠', `${record.sleepScore}%`))
  if (record.bedTime && record.wakeTime) {
    rows.push(subRow(`${record.bedTime} → ${record.wakeTime}${record.sleepHours ? `・${record.sleepHours} 小時` : ''}`))
  }
  if (record.bowelMovement !== null) {
    // 標籤直接用 💩，值才是內容 —— 標籤和值都放 emoji 會變成兩個符號並排，
    // 反而看不懂哪個是哪個。「還沒」比「沒有」好，今天還沒過完。
    rows.push(row('💩', record.bowelMovement ? bowelText(record.bowelTimes) : '還沒'))
  }
  if (record.leaveHomeTime && record.leaveOfficeTime) {
    rows.push(row('上班', `${record.leaveHomeTime} → ${record.leaveOfficeTime}`))
  }
  if (record.allergy.length) rows.push(row('過敏', record.allergy.join('、')))
  if (record.mood) rows.push(row('心情', record.mood))
  rows.push(row('自我照顧', `${record.liverScore} / ${record.liverTotal}`))
  if (record.liverCare.length) rows.push(subRow(record.liverCare.join('、')))

  const body: unknown[] = [
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        { type: 'box', layout: 'vertical', width: '4px', backgroundColor: C.orange, cornerRadius: '2px', contents: [] },
        { type: 'text', text: '今日狀態', size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
      ],
    },
    { type: 'text', text: name, size: 'xl', weight: 'bold', color: C.brown, wrap: true, margin: 'md' },
    { type: 'separator', margin: 'lg', color: C.border },
    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'md', contents: rows },
  ]

  if (notes.length) {
    body.push({ type: 'separator', margin: 'lg', color: C.border })
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      spacing: 'md',
      contents: notes.map((note) => ({
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        contents: [
          { type: 'text', text: note.label, size: 'xs', color: C.orange, weight: 'bold' },
          { type: 'text', text: truncate(note.value), size: 'sm', color: C.brown, wrap: true },
        ],
      })),
    })
  }

  // 進度條刻意不使用紅色 —— 這是自我追蹤不是考核，低分不該被視覺指責
  body.push({
    type: 'box',
    layout: 'horizontal',
    margin: 'lg',
    spacing: 'xs',
    contents: Array.from({ length: Math.max(1, record.liverTotal) }, (_, i) => ({
      type: 'box',
      layout: 'vertical',
      height: '6px',
      cornerRadius: '3px',
      backgroundColor: i < record.liverScore ? C.orange : C.gold,
      contents: [],
    })),
  })
  body.push({
    type: 'text',
    text: encouragement(percent),
    size: 'xs',
    color: C.brownLight,
    margin: 'md',
    wrap: true,
  })

  return {
    type: 'flex' as const,
    // altText 會出現在通知列與不支援 Flex 的裝置上，必填
    altText: `${name} 完成了今日狀態記錄：睡眠 ${record.sleepScore === null ? '－' : record.sleepScore + '%'}，自我照顧 ${percent}%`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: C.cream,
        paddingAll: '18px',
        spacing: 'none',
        contents: body,
      },
    },
  }
}

function truncate(text: string): string {
  return text.length > NOTE_PREVIEW_LENGTH ? `${text.slice(0, NOTE_PREVIEW_LENGTH)}…` : text
}

/** 附屬在上一列底下的說明文字，例如睡眠時間、自我照顧的項目清單 */
function subRow(text: string) {
  return { type: 'text', text, size: 'xs', color: C.brownLight, wrap: true, align: 'end' }
}

function row(label: string, value: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: C.brownLight, flex: 3 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: C.brown, flex: 4, align: 'end' },
    ],
  }
}

/** 文案一律正向：有記錄本身就值得肯定，沒達標不做負面評價 */
function encouragement(percent: number): string {
  if (percent >= 100) return '今天全部達成，是一顆超棒的四季豆👍'
  if (percent >= 60) return '今天狀態不錯，繼續當一顆很棒的四季豆😇'
  if (percent > 0) return '有做到就已經是一顆好的四季豆☺️'
  return '今天有記錄下來，就是一顆很棒的四季豆了😌'
}

/** 多次排便的時間用頓號串起來；按了「有」但沒填時間就顯示「有」 */
export function bowelText(times: (string | null)[]): string {
  const filled = times.filter((t): t is string => Boolean(t))
  return filled.length ? filled.join('、') : '有'
}
