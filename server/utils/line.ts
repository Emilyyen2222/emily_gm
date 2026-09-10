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
