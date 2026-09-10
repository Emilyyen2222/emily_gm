import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * LINE Webhook。這個端點唯一的實質工作，是把 bot 所在的群組 ID 記下來
 * —— groupId 只能從 webhook 事件取得，沒有它就無法定時推播。
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // 必須用「原始字串」驗簽章。先 JSON.parse 再重新序列化會因為
  // 空白與鍵序改變導致簽章永遠對不上。
  const raw = await readRawBody(event, 'utf8')
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: '空的請求內容' })
  }

  if (!verifySignature(raw, getHeader(event, 'x-line-signature'), config.lineChannelSecret)) {
    throw createError({ statusCode: 401, statusMessage: '簽章驗證失敗' })
  }

  const body = JSON.parse(raw) as { events?: any[] }
  const supabase = useSupabase()

  for (const ev of body.events ?? []) {
    const source = ev?.source ?? {}
    const chatId: string | undefined = source.groupId ?? source.roomId
    if (!chatId) continue // 一對一聊天不是推播目標

    const chatType = source.groupId ? 'group' : 'room'

    if (ev.type === 'leave') {
      await supabase.from('chats').update({ active: false }).eq('chat_id', chatId)
      continue
    }

    if (ev.type === 'join' || ev.type === 'message') {
      await supabase
        .from('chats')
        .upsert({ chat_id: chatId, chat_type: chatType, active: true }, { onConflict: 'chat_id' })
    }
  }

  // LINE 要求快速回應，逾時會重送
  return { ok: true }
})

function verifySignature(raw: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = createHmac('sha256', secret).update(raw).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
