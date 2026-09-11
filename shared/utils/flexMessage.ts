import { LIVER_CARE_TOTAL, type DailyRecord } from '../types/record'

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
 */
export function buildDailyFlexMessage(record: DailyRecord) {
  const name = record.displayName ?? '某位夥伴'
  const percent = Math.round((record.liverScore / LIVER_CARE_TOTAL) * 100)

  const notes = [
    { label: '夢', value: record.sleepNote },
    { label: '心情', value: record.moodNote },
    { label: '排便', value: record.bowelNote },
    { label: '過敏', value: record.allergyNote },
  ].filter((n): n is { label: string; value: string } => Boolean(n.value))

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
    {
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      spacing: 'md',
      contents: [
        row('睡眠', record.sleepScore === null ? '－' : `${record.sleepScore}%`),
        row('心情', record.mood ?? '－'),
        row('自我照顧', `${record.liverScore} / ${LIVER_CARE_TOTAL}`),
        ...(record.steps === null ? [] : [row('步數', `${record.steps.toLocaleString()} 步`)]),
      ],
    },
  ]

  // 幾點睡到幾點醒。只有兩個時間都填了才顯示，否則資訊不完整反而令人困惑
  if (record.bedTime && record.wakeTime) {
    body.push({
      type: 'text',
      text: `${record.bedTime} → ${record.wakeTime}${record.sleepHours ? `・${record.sleepHours} 小時` : ''}`,
      size: 'sm',
      color: C.brownLight,
      margin: 'md',
    })
  }

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
    contents: Array.from({ length: LIVER_CARE_TOTAL }, (_, i) => ({
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
      // 「拍拍」把單向的廣播變成雙向。互相監督的關鍵其實不是看到數字，
      // 是知道有人看到了你。走 postback 由 bot 用 reply 回應，不計入推播額度。
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: C.cream,
        paddingAll: '18px',
        paddingTop: 'none',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            color: '#FCDC94',
            height: 'sm',
            action: {
              type: 'postback',
              label: '拍拍',
              data: `action=pat&name=${encodeURIComponent(name)}`,
              displayText: `拍拍 ${name}`,
            },
          },
        ],
      },
    },
  }
}

function truncate(text: string): string {
  return text.length > NOTE_PREVIEW_LENGTH ? `${text.slice(0, NOTE_PREVIEW_LENGTH)}…` : text
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
