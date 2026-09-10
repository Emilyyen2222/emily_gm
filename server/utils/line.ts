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

/** 組出開啟本 LIFF 應用的連結 */
export function liffUrl(): string {
  const config = useRuntimeConfig()
  return `https://liff.line.me/${config.public.liffId}`
}
