import type { NewsKind } from '../../utils/newsSources'
import type { NewsStory } from '../../utils/newsDigest'

/**
 * 每天產生新聞。由 Vercel Cron 於 00:00 UTC（= 台北 08:00～08:59）觸發。
 *
 * 這裡不推播任何東西：新聞存起來，等有人打「新聞」「AI新聞」時回覆；
 * 09:00 的早安提醒會從今天的新聞裡挑一個單字帶出去。
 * 刻意比提醒早一個小時：Hobby 方案只保證「在那一個小時內」執行，
 * 兩個排程放在同一個小時的話，提醒可能比新聞先跑，那天就沒有今日單字。
 * 兩類各自獨立，一類失敗不影響另一類。
 */
export default defineEventHandler(async (event) => {
  const { finish } = await beginCronRun(event, 'news')
  const today = taipeiToday()
  const notes: string[] = []
  let failed = 0

  for (const kind of ['health', 'ai'] as NewsKind[]) {
    try {
      const { items, failed: down } = await collectNews(kind)
      if (down.length) notes.push(`${kind} 抓不到：${down.join('、')}`)

      const yesterday = await loadRecentDigests<NewsStory[]>(kind, today, 1)
      const used = yesterday.flat().map((s) => s.url)

      const stories = await generateNews(kind, items, used)
      if (stories.length) await saveDigest(kind, today, stories)
      notes.push(`${kind}：候選 ${items.length}，產生 ${stories.length} 則`)
    } catch (err: any) {
      failed++
      notes.push(`${kind} 失敗：${String(err?.message ?? err).slice(0, 200)}`)
    }
  }

  const note = notes.join('｜')
  await finish({ status: failed ? 'partial' : 'done', failed, note })
  return { failed, note }
})
