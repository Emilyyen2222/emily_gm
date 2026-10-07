import { XMLParser } from 'fast-xml-parser'

/**
 * 新聞來源。全部免費、不需要金鑰。
 *
 * 只收 48 小時內的文章（新聞就應該是新的），每個來源最多取 8 則、簡介截到 100 字：
 * 候選越多，交給 AI 挑的 token 就越多，這是每天費用的大頭。
 */

export type NewsKind = 'health' | 'ai' | 'stock'

export interface NewsItem {
  source: string
  title: string
  summary: string
  url: string
  publishedAt: number
}

const WINDOW_MS = 48 * 60 * 60 * 1000
const PER_SOURCE = 8
const SUMMARY_MAX = 100
const ARTICLE_MAX = 2500

// Reddit 會擋沒有 User-Agent 的請求
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (emily-liff news digest)' }

const FEEDS: Record<NewsKind, { name: string; url: string }[]> = {
  health: [
    { name: 'Heho', url: 'https://heho.com.tw/feed' },
    { name: 'NYT Well', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Well.xml' },
    { name: 'NPR Health', url: 'https://feeds.npr.org/1128/rss.xml' },
    { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/health_medicine.xml' },
    { name: 'Medical Xpress', url: 'https://medicalxpress.com/rss-feed/sleep-news/' },
  ],
  ai: [
    { name: 'r/ClaudeAI', url: 'https://www.reddit.com/r/ClaudeAI/top/.rss?t=day' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
    { name: 'iThome', url: 'https://www.ithome.com.tw/rss' },
    { name: 'CNBC', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },
    { name: '科技新報', url: 'https://technews.tw/feed/' },
    { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  ],
  // 英文的美股來源合格的不多，鉅亨網的美股分類補中文的；鉅亨網沒有 RSS，另外用它的 API（見 fetchCnyes）
  stock: [
    { name: 'Yahoo 股市', url: 'https://tw.stock.yahoo.com/rss?category=tw-market' },
    { name: '經濟日報', url: 'https://money.udn.com/rssfeed/news/1001/5590?ch=money' },
    { name: 'CNBC Markets', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
    { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  ],
}

/** 抓某一類的所有候選。單一來源失敗（被擋、逾時、改版）不影響其他來源 */
export async function collectNews(kind: NewsKind): Promise<{ items: NewsItem[]; failed: string[] }> {
  const jobs = FEEDS[kind].map((f) => ({ name: f.name, run: () => fetchFeed(f.name, f.url) }))
  if (kind === 'ai') jobs.push({ name: 'Hacker News', run: fetchHackerNewsAi })
  if (kind === 'stock') {
    jobs.push({ name: '鉅亨網台股', run: () => fetchCnyes('tw_stock') })
    jobs.push({ name: '鉅亨網美股', run: () => fetchCnyes('us_stock') })
  }

  const results = await Promise.allSettled(jobs.map((j) => j.run()))
  const failed: string[] = []
  const items: NewsItem[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const it of r.value) {
        const url = normalizeUrl(it.url)
        if (url) items.push({ ...it, url })
      }
    } else failed.push(`${jobs[i]!.name}（${failReason(r.reason)}）`)
  })

  // 同一篇可能同時出現在兩個來源
  const unique = [...new Map(items.map((it) => [it.url, it])).values()]
  return { items: unique, failed }
}

const parser = new XMLParser({ ignoreAttributes: false })

async function fetchFeed(source: string, url: string): Promise<NewsItem[]> {
  const xml = await $fetch<string>(url, { headers: HEADERS, responseType: 'text', timeout: 15000 })
  const doc = parser.parse(xml)
  // RSS 是 rss.channel.item，Atom（Reddit）是 feed.entry
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? []
  const entries: any[] = Array.isArray(raw) ? raw : [raw]
  const since = Date.now() - WINDOW_MS

  return entries
    .map((e) => ({
      source,
      title: clean(e.title?.['#text'] ?? e.title, 200),
      summary: clean(e.description ?? e.summary?.['#text'] ?? e.summary ?? e.content?.['#text'], SUMMARY_MAX),
      url: linkOf(e.link),
      publishedAt: Date.parse(e.pubDate ?? e.updated ?? e.published ?? ''),
    }))
    .filter((it) => it.title && it.url && it.publishedAt >= since)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, PER_SOURCE)
}

/** HN 首頁什麼都有，只留標題跟 AI／科技產業有關的，不然會混進生物、政治等新聞 */
const AI_KEYWORDS =
  /\b(ai|llm|gpt|openai|anthropic|claude|gemini|nvidia|gpu|model|agent|xai|grok|musk|deepmind|copilot|cursor|mistral|llama|chip|tsmc|inference)\b/i

async function fetchHackerNewsAi(): Promise<NewsItem[]> {
  const res = await $fetch<{ hits: any[] }>('https://hn.algolia.com/api/v1/search', {
    query: { tags: 'front_page', hitsPerPage: 40 },
    timeout: 15000,
  })
  const since = Date.now() - WINDOW_MS
  return res.hits
    .filter((h) => h.url && h.created_at_i * 1000 >= since && AI_KEYWORDS.test(h.title))
    .slice(0, PER_SOURCE)
    // HN 只有標題，沒有簡介。挑中之後會再去抓原文，這裡先留空
    .map((h) => ({ source: 'Hacker News', title: h.title, summary: '', url: h.url, publishedAt: h.created_at_i * 1000 }))
}

/** 鉅亨網某一分類的新聞。內文是跳脫過的 HTML（&lt;p&gt;），clean 兩次：第一次還原成標籤，第二次拿掉標籤 */
async function fetchCnyes(category: 'tw_stock' | 'us_stock'): Promise<NewsItem[]> {
  const res = await $fetch<{ items: { data: any[] } }>(`https://api.cnyes.com/media/api/v1/newslist/category/${category}`, {
    headers: HEADERS,
    query: { limit: 30 },
    timeout: 15000,
  })
  const since = Date.now() - WINDOW_MS
  return res.items.data
    .map((n) => ({
      source: '鉅亨網',
      title: clean(n.title, 200),
      summary: clean(clean(n.content, 5000), SUMMARY_MAX),
      url: `https://news.cnyes.com/news/id/${n.newsId}`,
      publishedAt: Number(n.publishAt) * 1000,
    }))
    .filter((it) => it.title && it.publishedAt >= since)
    .slice(0, PER_SOURCE)
}

/**
 * 抓原文的內文段落（前 2500 字），給第二階段寫摘要用。
 * 付費牆或擋爬蟲的網站會拿到很少的字，這時 AI 只能根據標題與簡介寫。
 */
export async function fetchArticleText(url: string): Promise<string> {
  try {
    const html = await $fetch<string>(url, { headers: HEADERS, responseType: 'text', timeout: 10000 })
    const body = html.replace(/<(script|style|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    return [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => clean(m[1], 2000))
      .filter((p) => p.length > 40)
      .join('\n')
      .slice(0, ARTICLE_MAX)
  } catch {
    return ''
  }
}

/** 失敗原因記進排程紀錄：有 HTTP 狀態碼就用狀態碼（403 是被擋、404 是網址換了），沒有就用錯誤訊息 */
function failReason(err: any): string {
  return String(err?.statusCode ?? err?.message ?? err).slice(0, 60)
}

/**
 * 網址會放進卡片的「閱讀原文」按鈕，LINE 只要一個網址不合格就整則卡片拒收。
 * 來源偶爾有怪網址（例如 HN 投稿者貼的網址結尾多一個反斜線），
 * 這裡解析過一次轉成標準格式，不是 http/https 的直接丟掉
 */
function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim().replace(/\\+$/, ''))
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

function linkOf(link: unknown): string {
  if (typeof link === 'string') return link
  if (Array.isArray(link)) return (link[0] as any)?.['@_href'] ?? ''
  return (link as any)?.['@_href'] ?? ''
}

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&#8217;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
