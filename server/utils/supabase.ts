import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * 以 service role key 建立的 Supabase client（單例）。
 *
 * 這把 key 具備繞過 RLS 的完整權限，因此：
 * 只能在 server/ 底下使用，絕不可出現在任何會被打包進瀏覽器的程式碼中。
 */
export function useSupabase(): SupabaseClient {
  if (cached) return cached

  const config = useRuntimeConfig()
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase 環境變數未設定（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）',
    })
  }

  cached = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
