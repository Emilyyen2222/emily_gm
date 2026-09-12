import { DEFAULT_HABITS } from '../../shared/types/record'

/** 取得這個人選的自我照顧項目；沒設定過就用預設三項 */
export async function getHabits(userId: string): Promise<string[]> {
  const supabase = useSupabase()
  const { data } = await supabase.from('users').select('habits').eq('user_id', userId).maybeSingle()
  const habits = data?.habits
  return Array.isArray(habits) && habits.length ? habits : DEFAULT_HABITS
}
