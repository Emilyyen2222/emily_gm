import { normalizeRows } from '../../shared/types/workout'
import {
  SQUAT_EXERCISE,
  SQUAT_GOAL_DEFAULT,
  SQUAT_STREAK_LOOKBACK,
  squatBoardText,
  squatStreak,
  type SquatBoardMember,
} from '../../shared/types/squat'

/** 每個人每天的深蹲次數：聊天打卡加上訓練頁的「深蹲」。回傳 userId → 日期 → 次數 */
export async function getSquatDaily(
  userIds: string[],
  from: string,
  to: string,
): Promise<Record<string, Record<string, number>>> {
  const result: Record<string, Record<string, number>> = Object.fromEntries(userIds.map((id) => [id, {}]))
  if (!userIds.length) return result

  const supabase = useSupabase()
  const [{ data: checkins, error: checkinError }, { data: workouts, error: workoutError }] = await Promise.all([
    supabase
      .from('squat_checkins')
      .select('user_id, squat_date, reps')
      .in('user_id', userIds)
      .gte('squat_date', from)
      .lte('squat_date', to),
    supabase
      .from('workouts')
      .select('user_id, workout_date, sets')
      .in('user_id', userIds)
      .eq('exercise', SQUAT_EXERCISE)
      .gte('workout_date', from)
      .lte('workout_date', to),
  ])
  if (checkinError || workoutError) throw new Error(`讀取深蹲紀錄失敗：${(checkinError ?? workoutError)!.message}`)

  const add = (userId: string, date: string, reps: number) => {
    const days = (result[userId] ??= {})
    days[date] = (days[date] ?? 0) + reps
  }
  for (const c of checkins ?? []) add(c.user_id, c.squat_date, c.reps)
  for (const w of workouts ?? []) {
    for (const row of normalizeRows(w.sets)) add(w.user_id, w.workout_date, (row.reps ?? 0) * (row.sets ?? 1))
  }
  return result
}

/** userId → 每天目標。沒設過的用預設值 */
export async function getSquatGoals(userIds: string[]): Promise<Record<string, number>> {
  const goals: Record<string, number> = Object.fromEntries(userIds.map((id) => [id, SQUAT_GOAL_DEFAULT]))
  if (!userIds.length) return goals
  const { data } = await useSupabase().from('users').select('user_id, squat_goal').in('user_id', userIds)
  for (const u of data ?? []) if (u.squat_goal) goals[u.user_id] = u.squat_goal
  return goals
}

export async function setSquatGoal(userId: string, goal: number): Promise<void> {
  const { error } = await useSupabase().from('users').upsert({ user_id: userId, squat_goal: goal }, { onConflict: 'user_id' })
  if (error) throw new Error(`設定目標失敗：${error.message}`)
}

/** 本人今天的進度。連續天數含今天：今天還沒達標就是 0，回覆時也不會顯示 */
export async function getSquatProgress(userId: string, today: string): Promise<{ total: number; goal: number; streak: number }> {
  const [daily, goals] = await Promise.all([
    getSquatDaily([userId], addDays(today, -SQUAT_STREAK_LOOKBACK), today),
    getSquatGoals([userId]),
  ])
  const days = daily[userId] ?? {}
  const goal = goals[userId]!
  return { total: days[today] ?? 0, goal, streak: squatStreak(days, goal, today) }
}

/**
 * 記一次打卡。chatId 是打卡的聊天室，一對一傳 null。
 * 回傳這是不是此人第一次在這個聊天室打卡（第一次要說明隔天會上看板）
 */
export async function addSquatCheckin(userId: string, reps: number, today: string, chatId: string | null): Promise<boolean> {
  const supabase = useSupabase()
  let first = false
  if (chatId) {
    const { count } = await supabase
      .from('squat_checkins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('chat_id', chatId)
    first = !count
  }
  const { error } = await supabase.from('squat_checkins').insert({ user_id: userId, squat_date: today, reps, chat_id: chatId })
  if (error) throw new Error(`記錄深蹲失敗：${error.message}`)
  return first
}

/** 刪掉今天最後一次聊天打卡，回傳刪掉的次數；今天沒有就回 null */
export async function undoSquatCheckin(userId: string, today: string): Promise<number | null> {
  const supabase = useSupabase()
  const { data } = await supabase
    .from('squat_checkins')
    .select('id, reps')
    .eq('user_id', userId)
    .eq('squat_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const { error } = await supabase.from('squat_checkins').delete().eq('id', data.id)
  if (error) throw new Error(`刪除失敗：${error.message}`)
  return data.reps
}

/** 今天從聊天記了幾下（不含訓練頁） */
export async function getSquatChatTotal(userId: string, today: string): Promise<number> {
  const { data } = await useSupabase().from('squat_checkins').select('reps').eq('user_id', userId).eq('squat_date', today)
  return (data ?? []).reduce((sum, c) => sum + c.reps, 0)
}

/** 最近 7 天（含今天）有沒有蹲過。只用來決定每日表單要不要顯示進度 */
export async function hasRecentSquat(userId: string, today: string): Promise<boolean> {
  const daily = await getSquatDaily([userId], addDays(today, -6), today)
  return Object.values(daily[userId] ?? {}).some((n) => n > 0)
}

/**
 * 某個群組早上的看板。
 *
 * 只看「在這個群組」打過卡的人：近 7 天在這裡打過卡的算進合計，昨天在這裡打過卡的才列名字。
 * 在一對一或其他群組打卡，不會讓人出現在這個群組。
 * 再逐一向 LINE 確認他現在還在這個群組 —— 查不到或查詢出錯都直接排除，
 * 寧可少列一個人，也不能把資料送到他已經不在的群組。名字也取自這個群組的成員資料。
 */
export async function buildSquatBoard(chatId: string, yesterday: string): Promise<unknown | null> {
  const { data: rows, error } = await useSupabase()
    .from('squat_checkins')
    .select('user_id, squat_date')
    .eq('chat_id', chatId)
    .gte('squat_date', addDays(yesterday, -6))
    .lte('squat_date', yesterday)
  if (error) throw new Error(`讀取深蹲打卡失敗：${error.message}`)
  if (!rows?.some((r) => r.squat_date === yesterday)) return null

  const checkedInYesterday = new Set(rows.filter((r) => r.squat_date === yesterday).map((r) => r.user_id as string))
  const userIds = [...new Set(rows.map((r) => r.user_id as string))]

  const verified = (
    await Promise.all(
      userIds.map(async (userId) => {
        const profile = await getProfile(userId, chatId)
        return profile ? { userId, name: profile.displayName } : null
      }),
    )
  ).filter((m) => m !== null)
  if (!verified.length) return null

  const ids = verified.map((m) => m.userId)
  const [daily, goals] = await Promise.all([
    getSquatDaily(ids, addDays(yesterday, -SQUAT_STREAK_LOOKBACK), yesterday),
    getSquatGoals(ids),
  ])
  const members: SquatBoardMember[] = verified.map((m) => ({
    name: m.name,
    checkedInHere: checkedInYesterday.has(m.userId),
    goal: goals[m.userId]!,
    daily: daily[m.userId] ?? {},
  }))

  const text = squatBoardText(members, yesterday)
  return text ? textMessage(text) : null
}
