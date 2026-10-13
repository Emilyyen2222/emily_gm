import { createHash, randomBytes } from 'node:crypto'
import { PERIOD_SYNC_DAYS, periodStatus, type PeriodStatusResponse } from '../../shared/types/period'

/**
 * iPhone 健康 App 同步（經由「捷徑」）。
 *
 * 捷徑拿不到 LINE 的 ID Token，只能帶一組固定的同步碼。同步碼只在產生時顯示一次，
 * 資料庫只存雜湊。同步碼只能「寫入自己的月經日期」，不能讀任何東西。
 */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 產生新的同步碼，覆蓋舊的（舊的立刻失效） */
export async function createSyncToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  const { error } = await useSupabase()
    .from('health_sync_tokens')
    .upsert({ user_id: userId, token_hash: hashToken(token), created_at: new Date().toISOString(), last_used_at: null }, { onConflict: 'user_id' })
  if (error) throw createError({ statusCode: 500, statusMessage: `產生同步碼失敗：${error.message}` })
  return token
}

/** 同步碼對應的使用者，對不上就回 null */
export async function userIdFromSyncToken(token: string | undefined): Promise<string | null> {
  if (!token || token.length < 16 || token.length > 100) return null
  const supabase = useSupabase()
  const { data } = await supabase.from('health_sync_tokens').select('user_id').eq('token_hash', hashToken(token)).maybeSingle()
  if (!data) return null
  await supabase.from('health_sync_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', data.user_id)
  return data.user_id
}

/** 用捷徑送來的日期整批取代最近 PERIOD_SYNC_DAYS 天。健康 App 裡刪掉的日子也會跟著消失 */
export async function replacePeriodDays(userId: string, dates: string[], today: string): Promise<void> {
  const supabase = useSupabase()
  const from = addDays(today, -(PERIOD_SYNC_DAYS - 1))
  const { error: deleteError } = await supabase.from('period_days').delete().eq('user_id', userId).gte('day', from).lte('day', today)
  if (deleteError) throw createError({ statusCode: 500, statusMessage: `同步失敗：${deleteError.message}` })
  if (!dates.length) return
  const { error } = await supabase.from('period_days').insert(dates.map((day) => ({ user_id: userId, day })))
  if (error) throw createError({ statusCode: 500, statusMessage: `同步失敗：${error.message}` })
}

/** 表單上顯示的狀態。沒設定過同步碼的人 connected = false，前端整區不顯示 */
export async function getPeriodStatus(userId: string, today: string): Promise<PeriodStatusResponse> {
  const supabase = useSupabase()
  const [{ data: token }, { data: rows }] = await Promise.all([
    supabase.from('health_sync_tokens').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase
      .from('period_days')
      .select('day')
      .eq('user_id', userId)
      .gte('day', addDays(today, -(PERIOD_SYNC_DAYS - 1)))
      .lte('day', today),
  ])
  return { connected: Boolean(token), ...periodStatus((rows ?? []).map((r) => r.day as string), today) }
}
