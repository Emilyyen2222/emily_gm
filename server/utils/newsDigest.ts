import type Anthropic from '@anthropic-ai/sdk'
import type { NewsItem, NewsKind } from './newsSources'
import type { TodayWord } from './newsCard'

/**
 * 每日新聞的產生與存取。
 *
 * 新聞分兩階段：先看標題與簡介挑 3 則，再抓這 3 則的原文來寫摘要。
 * 只看簡介寫的話，AI 會用空泛的評論（「這代表…」）填滿第二句，
 * 甚至把沒寫的事情寫錯；讀過原文，第二句才能是具體的事實。
 */

/** 挑新聞：候選多、任務簡單，用最便宜的 Haiku */
const PICK_MODEL = 'claude-haiku-4-5'
/**
 * 寫摘要：Haiku 不太遵守字數與「單字不要專有名詞」的規則，改用 Sonnet 5。
 * 這一步的輸入只有 3 篇原文節錄，換成 Sonnet 多出來的費用有限
 */
const WRITE_MODEL = 'claude-sonnet-5'
const STORIES = 3

export interface NewsStory {
  title: string
  points: { zh: string; en: string }[]
  /** example 是用到這個字、講這則新聞的一句話，今日單字卡用它當例句。舊資料沒有這欄 */
  vocab: { en: string; zh: string; example?: { en: string; zh: string } }[]
  source: string
  /** 文章發布日期，M/D */
  date: string
  url: string
}

const PICK_RULES: Record<NewsKind, string> = {
  health: `從下面的候選挑最多 ${STORIES} 則健康新聞（盡量不同主題）。只挑新聞或研究報導；名言、心靈小語、心情小品、節日祝福、廣告、活動宣傳一律不要。`,
  ai: `從下面的候選挑最多 ${STORIES} 則最值得軟體工程師知道的 AI 科技新聞。範圍：AI 模型與產品發布；科技公司與產業動態（Nvidia、馬斯克/xAI、OpenAI、Anthropic、Google、微軟等的投資、融資、人事、政策）；晶片與硬體；開發者工具。
AI 應用在其他領域（生物、醫療、法律等）的新聞只有重大突破才選。跟 AI 與科技產業無關的不要；Reddit 的閒聊、迷因、求助文不要；企業客戶案例、行銷文不要。盡量涵蓋不同類別。`,
}

/** 同一件事常被好幾個來源報導，挑的時候只能算一則 */
const SAME_EVENT_RULE = '同一件事被不同來源報導的，只能選其中一則。'

const KIND_NAME: Record<NewsKind, string> = { health: '健康新知', ai: 'AI 科技新聞' }

/**
 * 產生某一類今天的新聞。excludeUrls 是前一天已經介紹過的：
 * 48 小時的範圍會跨兩天，不排除的話同一則可能連續出現兩天。
 */
export async function generateNews(kind: NewsKind, candidates: NewsItem[], excludeUrls: string[]): Promise<NewsStory[]> {
  const client = useAnthropic()
  if (!client) throw new Error('NUXT_ANTHROPIC_API_KEY 未設定')

  const pool = candidates.filter((c) => !excludeUrls.includes(c.url))
  if (!pool.length) return []

  // 第一階段：只挑
  const list = pool.map((c, i) => `[${i}] (${c.source}) ${c.title}\n${c.summary || '（沒有簡介）'}`).join('\n\n')
  const picked = await askJson<{ picks: number[] }>(client, PICK_MODEL, '你幫忙挑選新聞。', `${PICK_RULES[kind]}\n${SAME_EVENT_RULE}\n符合的不夠就少給，一則都沒有就給空陣列。\n\n${list}`, {
    type: 'object',
    properties: { picks: { type: 'array', items: { type: 'integer' }, description: '候選編號' } },
    required: ['picks'],
    additionalProperties: false,
  })
  const chosen = [...new Set(picked.picks)]
    .map((i) => pool[i])
    .filter((c): c is NewsItem => Boolean(c))
    .slice(0, STORIES)
  if (!chosen.length) return []

  // 第二階段：讀原文再寫
  const bodies = await Promise.all(chosen.map((c) => fetchArticleText(c.url)))
  const docs = chosen
    .map((c, i) => `[${i}] 標題：${c.title}\n簡介：${c.summary}\n原文節錄：\n${bodies[i] || '（抓不到原文，只能用標題與簡介）'}`)
    .join('\n\n=====\n\n')

  const written = await askJson<{ stories: { title_zh: string; points: { zh: string; en: string }[]; vocab: NewsStory['vocab'] }[] }>(
    client,
    WRITE_MODEL,
    `你幫一群軟體工程師朋友整理每日${KIND_NAME[kind]}，同時讓他們練英文。`,
    `為下面每一則新聞各寫一份摘要，stories 的順序與輸入相同。

- title_zh：中文標題，18 字內。
- points 剛好 2 個，每個是中文一句（zh，30 字內）加上同一句的英文（en，18 個字以內）：
  ・第 1 個：用一句話講清楚「誰做了什麼」，不要空泛（不要寫「強化了效能」這種沒有內容的話）。
  ・第 2 個：原文裡對讀者最有感的一個具體事實，用白話講。數字最多一個，而且要講清楚單位與比較對象（例如「API 價格砍半」，不要列一串價格）。不能是你自己的評論或推論（不要寫「這代表…」「這展示了…」）。
- 非本行的專有名詞（醫學、生物、法律等）要用白話帶過；一般技術名詞不用解釋。
- vocab 剛好 2 個，程度是 CEFR B2～C1（約多益 750 分以上）：新聞與職場常見、但不是基礎字，例如 mitigate、scrutiny、unprecedented、incentive、surge、plummet。
  ・不要 A1～B1 的基礎字（例如 warn、mix、report、launch、use、new），也不要專有名詞、產品名、技術術語。
  ・單字不必出現在 points 裡；可以從原文挑，或挑描述這則新聞很貼切的字。
  ・en 用原形（動詞原形、名詞單數）；zh 是中文意思，6 字內。
  ・example：一句講這則新聞、而且用到這個字的英文（en，20 個字以內，可以用變化形，例如 surged），加上中文翻譯（zh）。內容要符合原文事實。
- 只能根據提供的內容寫，不要補充、不要誇大（「可能」不能寫成「確定」，細胞或動物實驗不能寫成對人有效）。

${docs}`,
    {
      type: 'object',
      properties: {
        stories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title_zh: { type: 'string' },
              points: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { zh: { type: 'string' }, en: { type: 'string' } },
                  required: ['zh', 'en'],
                  additionalProperties: false,
                },
              },
              vocab: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    en: { type: 'string' },
                    zh: { type: 'string' },
                    example: {
                      type: 'object',
                      properties: { en: { type: 'string' }, zh: { type: 'string' } },
                      required: ['en', 'zh'],
                      additionalProperties: false,
                    },
                  },
                  required: ['en', 'zh', 'example'],
                  additionalProperties: false,
                },
              },
            },
            required: ['title_zh', 'points', 'vocab'],
            additionalProperties: false,
          },
        },
      },
      required: ['stories'],
      additionalProperties: false,
    },
  )

  return chosen
    .map((c, i) => {
      const s = written.stories[i]
      if (!s?.title_zh || !s.points?.length) return null
      return {
        title: s.title_zh,
        points: s.points.slice(0, 2),
        vocab: (s.vocab ?? []).slice(0, 2),
        source: c.source,
        date: monthDay(c.publishedAt),
        url: c.url,
      }
    })
    .filter((s): s is NewsStory => s !== null)
}

/**
 * 用結構化輸出（structured outputs）呼叫 Claude，回傳解析好的 JSON。
 * 不用它的話，Haiku 偶爾會在 JSON 後面多寫一段說明，整個解析就失敗了。
 */
async function askJson<T>(
  client: Anthropic,
  model: string,
  system: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const res = await client.messages.create({
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: prompt }],
    // 摘要不需要推理；Sonnet 5 不關的話預設會思考，多花輸出 token
    ...(model === WRITE_MODEL ? { thinking: { type: 'disabled' as const } } : {}),
    output_config: { format: { type: 'json_schema', schema } },
  })
  console.log(`[news] ${model} token ${res.usage.input_tokens}/${res.usage.output_tokens}`)
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return JSON.parse(text) as T
}

function monthDay(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' }).format(new Date(ms))
}

/**
 * 從今天的新聞挑今日單字：健康、AI 一天輪一類，取第一個有合格例句的單字，
 * 例句是 AI 寫摘要時一起寫的、講這則新聞並用到這個字的句子。當天那一類沒產生就換另一類，兩類都沒有就回 null。
 * 不另外呼叫 AI：單字與例句在寫新聞摘要時就一起產生了，講的是真的新聞，不是編的名言。
 */
export async function pickTodayWord(today: string): Promise<TodayWord | null> {
  const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000)
  const order: NewsKind[] = dayNumber % 2 === 0 ? ['health', 'ai'] : ['ai', 'health']

  for (const kind of order) {
    const latest = await loadLatestDigest<NewsStory[]>(kind, today)
    // 只用今天的，不拿前一天的湊數
    if (!latest || latest.date !== today) continue
    // 例句一定要含這個字才有意義：優先用單字自帶的例句，舊資料沒有就找摘要裡含這個字的句子
    for (const story of latest.content) {
      for (const vocab of story.vocab) {
        const sentence = [vocab.example, ...story.points].find((p) => p && appearsIn(vocab.en, p.en))
        if (sentence) return { kind, word: vocab.en, meaning: vocab.zh, sentence }
      }
    }
  }
  return null
}

/** 單字（或片語）有沒有出現在句子裡，允許常見的變化形：retain → retains、retained、retaining */
function appearsIn(word: string, sentence: string): boolean {
  const w = word.toLowerCase().trim()
  const text = sentence.toLowerCase()
  if (w.includes(' ')) return text.includes(w)

  const base = w.replace(/e$/, '')
  const forms = new Set([w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`, `${base}ing`, `${base}ed`, `${w.replace(/y$/, 'i')}es`, `${w.replace(/y$/, 'i')}ed`])
  return text.split(/[^a-z'-]+/).some((token) => forms.has(token))
}

// ── 存取 ─────────────────────────────────────────────

export async function saveDigest(kind: NewsKind, date: string, content: unknown): Promise<void> {
  const { error } = await useSupabase()
    .from('news_digests')
    .upsert({ kind, digest_date: date, content }, { onConflict: 'kind,digest_date' })
  if (error) throw new Error(`儲存 ${kind} 失敗：${error.message}`)
}

/** 某一類最新的一份（今天或更早）。當天還沒產生或產生失敗時，就拿到前一天的 */
export async function loadLatestDigest<T>(kind: NewsKind, today: string): Promise<{ date: string; content: T } | null> {
  const { data } = await useSupabase()
    .from('news_digests')
    .select('digest_date, content')
    .eq('kind', kind)
    .lte('digest_date', today)
    .order('digest_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { date: data.digest_date, content: data.content as T } : null
}

/** 最近幾天的內容，用來排除重複 */
export async function loadRecentDigests<T>(kind: NewsKind, today: string, days: number): Promise<T[]> {
  const { data } = await useSupabase()
    .from('news_digests')
    .select('content')
    .eq('kind', kind)
    .gte('digest_date', addDays(today, -days))
    .lt('digest_date', today)
  return (data ?? []).map((r) => r.content as T)
}
