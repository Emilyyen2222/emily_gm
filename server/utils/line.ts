/** 推播訊息到指定的聊天室（群組或個人） */
export async function pushMessage(to: string, messages: unknown[]): Promise<void> {
  const config = useRuntimeConfig()
  if (!config.lineChannelAccessToken) {
    throw createError({ statusCode: 500, statusMessage: 'LINE_CHANNEL_ACCESS_TOKEN 未設定' })
  }

  await $fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.lineChannelAccessToken}` },
    body: { to, messages },
  })
}

/**
 * 回覆訊息。與 push 不同，reply 用的是事件帶來的 replyToken，
 * 不計入每月推播額度，所以能即時回應的場合一律優先用它。
 * replyToken 只能用一次，且有效期很短。
 */
export async function replyMessage(replyToken: string, messages: unknown[]): Promise<void> {
  const config = useRuntimeConfig()
  if (!config.lineChannelAccessToken) return

  await $fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.lineChannelAccessToken}` },
    body: { replyToken, messages },
  })
}

/** 組出開啟本 LIFF 應用的連結 */
export function liffUrl(): string {
  const config = useRuntimeConfig()
  return `https://liff.line.me/${config.public.liffId}`
}

let cachedBotUserId: string | null = null

/** 這個官方帳號自己的 userId，用來判斷群組訊息裡 @ 到的是不是它 */
export async function getBotUserId(): Promise<string | null> {
  if (cachedBotUserId) return cachedBotUserId
  const config = useRuntimeConfig()
  if (!config.lineChannelAccessToken) return null
  try {
    const info = await $fetch<{ userId: string }>('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${config.lineChannelAccessToken}` },
    })
    cachedBotUserId = info.userId
    return cachedBotUserId
  } catch {
    return null
  }
}

/**
 * 取得使用者暱稱。
 * 在群組裡要走 group member 端點 —— 一般的 profile 端點只對「好友」有效，
 * 群組成員不一定加過這個官方帳號。
 */
export async function getProfile(userId: string, chatId?: string): Promise<{ displayName: string } | null> {
  const config = useRuntimeConfig()
  if (!config.lineChannelAccessToken) return null
  const url = chatId
    ? `https://api.line.me/v2/bot/group/${chatId}/member/${userId}`
    : `https://api.line.me/v2/bot/profile/${userId}`
  try {
    return await $fetch<{ displayName: string }>(url, {
      headers: { Authorization: `Bearer ${config.lineChannelAccessToken}` },
    })
  } catch {
    return null
  }
}
