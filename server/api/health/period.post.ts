import { sanitizePeriodDates } from '../../../shared/types/period'

/**
 * iPhone「捷徑」送月經日期過來。
 *
 * 身分由同步碼決定（Authorization: Bearer <同步碼>），不接受 body 裡的任何 userId。
 * body.dates 可以是陣列，或用逗號、換行分隔的字串（捷徑「合併文字」的結果），
 * 格式 YYYY-MM-DD，只收最近 90 天。用它整批取代那 90 天。
 * 只寫入、不回傳任何紀錄。
 */
export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization') ?? ''
  const userId = await userIdFromSyncToken(auth.replace(/^Bearer\s+/i, '').trim())
  if (!userId) throw createError({ statusCode: 401, statusMessage: '同步碼不對，請到同步設定頁重新產生' })

  const body = await readBody<{ dates?: unknown }>(event)
  const today = taipeiToday()
  const dates = sanitizePeriodDates(body?.dates, today)
  await replacePeriodDays(userId, dates, today)
  return { ok: true, count: dates.length }
})
