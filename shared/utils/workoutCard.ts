import { summarizeSets, type WorkoutExercise } from '../types/workout'

// 與每日卡片同一套色票
const C = {
  orange: '#F9A726',
  brown: '#3A2513',
  brownLight: '#6F5B49',
  cream: '#FFF8EF',
  border: '#EAD7BD',
} as const

/**
 * 訓練卡片。
 *
 * 資料範圍：只含「按下分享的這個人自己」那一天的訓練，沒有任何健康資料。
 *
 * 送達對象：使用者勾了分享、按下儲存後，透過 liff.sendMessages() 發到
 * 「他自己開啟 LIFF 的那個聊天室」。沒有任何自動推播。
 *
 * 不能加任何按鈕：使用者發送的 Flex 訊息帶 action 會被 LINE 以
 * INVALID_MESSAGE 整則拒收。
 */
export function buildWorkoutFlexMessage(opts: { displayName: string | null; date: string; exercises: WorkoutExercise[] }) {
  const exercises = opts.exercises.filter((e) => summarizeSets(e))
  if (!exercises.length) return null

  const name = opts.displayName ?? '某位夥伴'
  const [, m, d] = opts.date.split('-')
  const date = `${Number(m)}/${Number(d)}`

  return {
    type: 'flex' as const,
    altText: `${name} 的訓練 ${date}：${exercises.map((e) => e.exercise).join('、')}`,
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
              { type: 'text', text: `訓練 ${date}`, size: 'sm', weight: 'bold', color: C.orange, gravity: 'center' },
            ],
          },
          { type: 'text', text: `${name} 的訓練`, size: 'xl', weight: 'bold', color: C.brown, wrap: true, margin: 'md' },
          { type: 'separator', margin: 'lg', color: C.border },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'md',
            contents: exercises.map((e) => ({
              type: 'box',
              layout: 'horizontal',
              spacing: 'md',
              contents: [
                { type: 'text', text: e.exercise, size: 'sm', color: C.brownLight, flex: 3, wrap: true },
                { type: 'text', text: summarizeSets(e), size: 'sm', weight: 'bold', color: C.brown, flex: 5, align: 'end', wrap: true },
              ],
            })),
          },
        ],
      },
    },
  }
}
