interface LineIdTokenPayload {
  sub?: string
  name?: string
  aud?: string
  exp?: number
}

export interface VerifiedUser {
  userId: string
  displayName: string | null
}

/**
 * 驗證前端送來的 LIFF ID Token，取得可信的 LINE userId。
 *
 * 這是整個系統的身分基礎：前端傳來的 userId 一律不採信，
 * 因為 API 端點是公開的，任何人都能偽造 request body。
 */
export async function verifyIdToken(idToken: string | undefined | null): Promise<VerifiedUser> {
  if (!idToken) {
    throw createError({ statusCode: 401, statusMessage: '缺少 idToken' })
  }

  const config = useRuntimeConfig()
  if (!config.lineLoginChannelId) {
    throw createError({ statusCode: 500, statusMessage: 'LINE_LOGIN_CHANNEL_ID 未設定' })
  }

  let payload: LineIdTokenPayload
  try {
    payload = await $fetch<LineIdTokenPayload>('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: idToken,
        // 注意：這裡是 LINE Login Channel 的 ID，不是 Messaging API Channel 的
        client_id: config.lineLoginChannelId,
      }).toString(),
    })
  } catch {
    // LINE 會對過期或簽章不符的 token 回 400，一律視為驗證失敗
    throw createError({ statusCode: 401, statusMessage: 'ID Token 驗證失敗' })
  }

  if (!payload?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'ID Token 不含使用者識別碼' })
  }

  return { userId: payload.sub, displayName: payload.name ?? null }
}

/** 從請求中取出 idToken：GET 走 header，POST 走 body */
export function getIdTokenFromHeader(event: Parameters<typeof getHeader>[0]): string | undefined {
  return getHeader(event, 'x-liff-id-token')
}
