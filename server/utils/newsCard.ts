import type { NewsKind } from './newsSources'
import type { NewsStory } from './newsDigest'

const C = {
  orange: '#F9A726',
  brown: '#3A2513',
  brownLight: '#6F5B49',
  cream: '#FFF8EF',
  border: '#EAD7BD',
} as const

const LABEL: Record<NewsKind, string> = { health: '健康新知', ai: 'AI 新聞' }

const text = (value: string, opts: Record<string, unknown> = {}) => ({ type: 'text', text: value, wrap: true, color: C.brown, ...opts })

/** 標題列：橘色細線＋標籤，右邊可放頁碼 */
function header(label: string, right?: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'box', layout: 'vertical', width: '4px', backgroundColor: C.orange, cornerRadius: '2px', contents: [] },
      { type: 'text', text: label, size: 'sm', weight: 'bold', color: C.orange, gravity: 'center', flex: 1 },
      ...(right ? [{ type: 'text', text: right, size: 'xs', color: C.brownLight, align: 'end', gravity: 'center', flex: 0 }] : []),
    ],
  }
}

/** 單字：一個一行，英文粗體在左、中文在右 */
function vocabList(vocab: { en: string; zh: string }[]) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'lg',
    spacing: 'xs',
    contents: vocab.map((v) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        text(v.en, { size: 'xs', weight: 'bold', flex: 3 }),
        text(v.zh, { size: 'xs', color: C.brownLight, flex: 2, align: 'end' }),
      ],
    })),
  }
}

/**
 * 新聞卡片：3 則左右滑。
 * 重點不加項目符號：中文深色大字＋英文淺色小字為一組，組與組之間拉大間距來分隔，
 * 省下符號的寬度讓每行多放幾個字。
 */
export function newsCarousel(kind: NewsKind, digestDate: string, stories: NewsStory[]) {
  const label = `${LABEL[kind]} ${monthDayOf(digestDate)}`
  return {
    type: 'flex',
    altText: `${label}：${stories.map((s) => s.title).join('／')}`,
    contents: {
      type: 'carousel',
      contents: stories.map((s, i) => ({
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: C.cream,
          paddingAll: '20px',
          contents: [
            header(label, `${i + 1} / ${stories.length}`),
            text(s.title, { size: 'lg', weight: 'bold', margin: 'md' }),
            ...s.points.map((p, j) => ({
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              margin: j === 0 ? 'lg' : 'xxl',
              contents: [text(p.zh, { size: 'md' }), text(p.en, { size: 'sm', color: C.brownLight })],
            })),
            { type: 'separator', margin: 'xl', color: C.border },
            vocabList(s.vocab),
            text(`${s.source}・${s.date}`, { size: 'xxs', color: C.brownLight, margin: 'lg' }),
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: C.cream,
          paddingAll: '20px',
          paddingTop: 'none',
          contents: [
            { type: 'button', style: 'primary', color: C.orange, height: 'sm', action: { type: 'uri', label: '閱讀原文', uri: s.url } },
          ],
        },
      })),
    },
  }
}

/** 今日單字卡片上「看今天的新聞」按鈕送出的 postback data */
export const NEWS_POSTBACK: Record<NewsKind, string> = { health: 'news=health', ai: 'news=ai' }

export interface TodayWord {
  kind: NewsKind
  word: string
  meaning: string
  /** 單字出現的那一句英文，與對應的中文 */
  sentence: { en: string; zh: string }
}

/**
 * 今日單字：跟在 11:00 早安提醒後面的小卡。
 *
 * 按鈕用 postback 而不是「送出文字 新聞」：群組裡使用者送出的文字沒有 @ 到 bot，
 * bot 會照規則不回應；postback 不受這個限制，按了就直接回覆新聞卡片。
 */
export function wordCard(digestDate: string, w: TodayWord) {
  const button = w.kind === 'ai' ? '看今天的 AI 新聞' : '看今天的健康新知'
  return {
    type: 'flex',
    altText: `今日單字：${w.word} ${w.meaning}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: C.cream,
        paddingAll: '18px',
        contents: [
          header(`今日單字 ${monthDayOf(digestDate)}`),
          text(w.word, { size: 'xl', weight: 'bold', margin: 'md' }),
          text(w.meaning, { size: 'md', color: C.brownLight, margin: 'xs' }),
          { type: 'separator', margin: 'lg', color: C.border },
          text(w.sentence.en, { size: 'sm', margin: 'lg' }),
          text(w.sentence.zh, { size: 'sm', color: C.brownLight, margin: 'sm' }),
          text(`出自 ${LABEL[w.kind]}`, { size: 'xxs', color: C.brownLight, margin: 'lg' }),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: C.cream,
        paddingAll: '18px',
        paddingTop: 'none',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: C.orange,
            height: 'sm',
            action: { type: 'postback', label: button, data: NEWS_POSTBACK[w.kind], displayText: button },
          },
        ],
      },
    },
  }
}

/** YYYY-MM-DD → M/D */
function monthDayOf(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}
