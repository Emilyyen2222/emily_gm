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
  green: '#5A8F29',
} as const

/**
 * 每日分享卡片。
 *
 * 隱私原則：只放社交友善的摘要（睡眠分數、心情、自我照顧達標率），
 * 絕不放排便時間、過敏細節與任何備註文字 —— 群組所有人都看得到這張卡片。
 */
export function buildDailyFlexMessage(record: DailyRecord) {
  const name = record.displayName ?? '某位夥伴'
  const percent = Math.round((record.liverScore / LIVER_CARE_TOTAL) * 100)

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
        contents: [
          // 標頭：一條金色細線 + 標籤，比純文字標題更有份量
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', width: '4px', backgroundColor: C.orange, cornerRadius: '2px', contents: [] },
              { type: 'text', text: '今日狀態', size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
            ],
          },
          {
            type: 'text',
            text: name,
            size: 'xl',
            weight: 'bold',
            color: C.brown,
            wrap: true,
            margin: 'md',
          },
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
            ],
          },
          // 進度條：用色塊而非紅綠燈式的圓點。
          // 刻意不使用紅色 —— 這是自我追蹤不是考核，低分不該被視覺指責。
          {
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
          },
          {
            type: 'text',
            text: encouragement(percent),
            size: 'xs',
            color: C.brownLight,
            margin: 'md',
            wrap: true,
          },
        ],
      },
    },
  }
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
  if (percent >= 100) return '今天全部達成，很棒 ✨'
  if (percent >= 60) return '今天狀態不錯，繼續保持'
  if (percent > 0) return '有做到就是好的開始'
  return '今天有記錄下來，就已經在往前了'
}
