import { MOOD_SCORE, STEPS_GOAL, careRate, type DailyRecord } from '../../shared/types/record'

const C = {
  orange: '#F9A726',
  gold: '#FCDC94',
  brown: '#3A2513',
  brownLight: '#6F5B49',
  cream: '#FFF8EF',
  border: '#EAD7BD',
} as const

/** 共用的卡片外框：一條橘色細線加標籤，跟其他卡片同一套視覺 */
function bubble(label: string, contents: unknown[], footer?: unknown) {
  return {
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
            { type: 'text', text: label, size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
          ],
        },
        ...contents,
      ],
    },
    ...(footer
      ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: C.cream,
            paddingAll: '18px',
            paddingTop: 'none',
            contents: [footer],
          },
        }
      : {}),
  }
}

function button(label: string, url: string) {
  return {
    type: 'button',
    style: 'primary',
    color: C.orange,
    height: 'sm',
    action: { type: 'uri', label, uri: url },
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

/**
 * 說明卡片。
 *
 * 刻意不先講「我看不懂」—— 使用者打了看不懂的字不是做錯事，
 * 直接把能用的東西攤開來比先指出對方的錯誤有用。
 */
export function helpCard(url: string, inGroup = false) {
  return {
    type: 'flex',
    altText: '可以跟我說：記錄 / 今天 / 本週 / 排行',
    contents: bubble(
      '可以這樣用',
      [
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'md',
          contents: [
            row('記錄', '開始今天的記錄'),
            row('今天', '看今天填了什麼'),
            row('本週', '看這週的摘要'),
            row('排行', '看群組排行'),
          ],
        },
        {
          // 圖文選單只存在於一對一聊天室，群組沒有，所以那句話在群組是錯的
          type: 'text',
          text: inGroup ? '在群組要 @ 我才會回應' : '或直接點下面的選單',
          size: 'xs',
          color: C.brownLight,
          margin: 'lg',
          wrap: true,
        },
      ],
      button('開始記錄', url),
    ),
  }
}

/** 「記錄」的回應 */
export function startCard(url: string) {
  return {
    type: 'flex',
    altText: `來記錄今天的狀態 ${url}`,
    contents: bubble(
      '開始',
      [{ type: 'text', text: '想到什麼填什麼就好。', size: 'md', color: C.brown, margin: 'md', wrap: true }],
      button('開始記錄', url),
    ),
  }
}

/** 今天還沒有紀錄時的回應 */
export function noRecordCard(url: string) {
  return {
    type: 'flex',
    altText: `今天還沒有紀錄 ${url}`,
    contents: bubble(
      '今天',
      [{ type: 'text', text: '還沒有紀錄', size: 'md', color: C.brown, margin: 'md' }],
      button('現在記', url),
    ),
  }
}

/** 「本週」的摘要 */
export function weekCard(opts: {
  from: string
  to: string
  sleep: number | null
  care: number | null
  steps: number | null
  days: number
  url: string
}) {
  return {
    type: 'flex',
    altText: `本週摘要：記錄 ${opts.days} 天`,
    contents: bubble(
      '本週',
      [
        { type: 'text', text: `${opts.from} – ${opts.to}`, size: 'xs', color: C.brownLight, margin: 'sm' },
        { type: 'separator', margin: 'lg', color: C.border },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'md',
          contents: [
            row('睡眠平均', opts.sleep === null ? '－' : `${opts.sleep}%`),
            row('自我照顧', opts.care === null ? '－' : `${opts.care}%`),
            row('平均步數', opts.steps === null ? '－' : `${opts.steps.toLocaleString()} 步`),
            row('記錄天數', `${opts.days} / 7`),
          ],
        },
      ],
      button('看詳細', `${opts.url}/history`),
    ),
  }
}

/** 把一批紀錄整理成本週摘要需要的數字 */
export function summarise(records: DailyRecord[]) {
  const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null)
  return {
    sleep: avg(records.map((r) => r.sleepScore).filter((n): n is number => n !== null)),
    care: records.length ? avg(records.map(careRate)) : null,
    steps: avg(records.map((r) => r.steps).filter((n): n is number => n !== null)),
    days: records.length,
  }
}
