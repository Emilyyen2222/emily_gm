import type { SubmitRecordPayload, SubmitRecordResponse } from '../../../shared/types/record'

/**
 * 送出（或更新）今日紀錄。
 *
 * 同一天重複送出會走 upsert 更新同一列，靠的是 records 表上
 * unique (record_date, user_id) 這個約束 —— 併發由資料庫保證，
 * 應用層不需要任何鎖。
 */
export default defineEventHandler(async (event): Promise<SubmitRecordResponse> => {
  const body = await readBody<Partial<SubmitRecordPayload>>(event)

  const { userId, displayName } = await verifyIdToken(body?.idToken)
  const input = sanitizeRecordInput(body ?? {})

  // 日期一律由後端以台北時區決定，不接受前端傳入
  const recordDate = taipeiToday()
  const now = new Date().toISOString()

  const supabase = useSupabase()

  const { data, error } = await supabase
    .from('records')
    .upsert(
      {
        record_date: recordDate,
        user_id: userId,
        display_name: displayName,
        sleep_score: input.sleepScore,
        sleep_hours: input.sleepHours,
        sleep_note: input.sleepNote,
        bowel_movement: input.bowelMovement,
        bowel_time: input.bowelTime,
        bowel_note: input.bowelNote,
        leave_home_time: input.leaveHomeTime,
        allergy: input.allergy,
        mood: input.mood,
        mood_note: input.moodNote,
        liver_care: input.liverCare,
        liver_score: input.liverScore,
        shared: input.shared,
        source_chat_id: input.sourceChatId,
        // updated_at 的 default 只在 insert 時生效，更新時要自己帶
        updated_at: now,
      },
      { onConflict: 'record_date,user_id' },
    )
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: `寫入失敗：${error.message}` })
  }

  // 暱稱可能會變，順手更新；失敗不影響主要流程
  await supabase
    .from('users')
    .upsert(
      { user_id: userId, display_name: displayName, ...(input.shared ? { consent_shared_at: now } : {}) },
      { onConflict: 'user_id', ignoreDuplicates: false },
    )

  return { record: rowToRecord(data) }
})
