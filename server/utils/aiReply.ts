/**
 * AI 問答的流程：同意、次數上限、讀不讀紀錄。
 *
 * 隱私規則（見 docs/AI_Features_Plan.md）：
 * - 群組：絕不讀任何人的紀錄。群組裡的回答所有成員都看得到，
 *   就算只讀發問者自己的紀錄，也等於把它貼給整個群組。
 * - 一對一：本人按過「同意」才讀，而且只讀本人的。
 */

/** 送給 AI 的訊息長度上限。LINE 本身上限 5000 字，這裡再收一點避免貼長文燒額度 */
const QUESTION_MAX = 2000

type Consent = 'granted' | 'declined' | null

/**
 * 回答一則交給 AI 的訊息。
 * userId 由 webhook 事件帶來；inGroup 為 true 時不論如何都不讀紀錄。
 */
export async function aiReply(rawText: string, userId: string, inGroup: boolean): Promise<unknown> {
  const question = rawText.slice(0, QUESTION_MAX)

  if (inGroup) return answer(question, userId, { inGroup: true, withRecords: false })

  const consent = await getConsent(userId)
  if (consent === null) {
    // 第一次問：先存下問題、給同意卡片，按下按鈕後再回答這一題。
    // 還沒按又問了新的，就以最新的一題為準
    await useSupabase()
      .from('users')
      .upsert({ user_id: userId, ai_pending_question: question }, { onConflict: 'user_id' })
    return aiConsentCard()
  }

  return answer(question, userId, { inGroup: false, withRecords: consent === 'granted' })
}

/**
 * 處理同意卡片的按鈕（只會來自一對一）。
 * 有等待中的問題就直接回答它；沒有（從「AI 設定」來的）就回一句確認。
 */
export async function handleConsentPostback(userId: string, choice: 'granted' | 'declined'): Promise<unknown> {
  const supabase = useSupabase()
  const { data } = await supabase.from('users').select('ai_pending_question').eq('user_id', userId).maybeSingle()
  const pending: string | null = data?.ai_pending_question ?? null

  await supabase.from('users').upsert(
    {
      user_id: userId,
      ai_consent: choice,
      ai_consent_at: new Date().toISOString(),
      ai_pending_question: null,
    },
    { onConflict: 'user_id' },
  )

  if (pending) return answer(pending, userId, { inGroup: false, withRecords: choice === 'granted' })
  return textMessage(choice === 'granted' ? AI_TEXT.consentGranted : AI_TEXT.consentDeclined)
}

/** 「AI 設定」：重新給一次同意卡片。清掉等待中的問題，按下後只回確認 */
export async function aiSettings(userId: string): Promise<unknown> {
  await useSupabase()
    .from('users')
    .upsert({ user_id: userId, ai_pending_question: null }, { onConflict: 'user_id' })
  return aiConsentCard()
}

async function getConsent(userId: string): Promise<Consent> {
  const { data } = await useSupabase().from('users').select('ai_consent').eq('user_id', userId).maybeSingle()
  const value = data?.ai_consent
  return value === 'granted' || value === 'declined' ? value : null
}

async function answer(
  question: string,
  userId: string,
  opts: { inGroup: boolean; withRecords: boolean },
): Promise<unknown> {
  // 雙重保險：呼叫端傳錯也不會在群組裡讀紀錄
  const withRecords = opts.withRecords && !opts.inGroup

  const today = taipeiToday()
  if (!(await takeAiQuota(userId, today))) return textMessage(AI_TEXT.limitReached)

  // 「輸入中」動畫只支援一對一；一對一的聊天室 ID 就是 userId
  if (!opts.inGroup) await showLoading(userId)

  const context = withRecords ? await buildRecordContext(userId, today) : null
  const result = await askClaude(question, context, today, opts.inGroup)
  return textMessage(result.ok ? result.text : AI_TEXT.unavailable)
}
