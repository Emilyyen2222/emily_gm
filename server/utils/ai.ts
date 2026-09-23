import Anthropic from '@anthropic-ai/sdk'

/** Haiku 4.5：最便宜，簡單問答夠用。US$5 的預算要撐久一點 */
const MODEL = 'claude-haiku-4-5'

/** 每人每天可以問幾題。一般使用碰不到，是擋在「有人狂問把額度一次燒光」前面的防線 */
export const AI_DAILY_LIMIT = 30

/** 給 AI 看幾天的紀錄 */
const CONTEXT_DAYS = 14

let cached: Anthropic | null = null

function useAnthropic(): Anthropic | null {
  if (cached) return cached
  const config = useRuntimeConfig()
  if (!config.anthropicApiKey) return null
  cached = new Anthropic({ apiKey: config.anthropicApiKey })
  return cached
}

/**
 * 系統提示詞。
 *
 * 要點是回答會出現在 LINE 聊天室裡：LINE 不會渲染 Markdown，
 * 寫了 ** 或 # 會原封不動顯示出來，所以明確要求純文字。
 */
const SYSTEM_PROMPT = `你是一個 LINE 官方帳號裡的 AI 助理。這個官方帳號是一群朋友用來每天記錄睡眠、心情、自我照顧等狀態的小工具，使用者大多是軟體工程師。

回答規則：
- 使用者用什麼語言問，就用什麼語言回答；中文一律用繁體中文。
- 回答會顯示在 LINE 聊天室，只能用純文字。不要用 Markdown（不要 **、#、表格），需要條列時用「・」或數字。
- 盡量簡短，通常三到八行以內。對方想知道更多會再問。
- 技術問題可以直接使用專業術語，不用刻意解釋基礎概念。
- 談到健康時語氣要好奇、不評判。紀錄裡的低分或空白只是資訊，不是失敗，不要說教。
- 不做醫療診斷。症狀聽起來嚴重或持續很久時，建議對方去看醫生。

關於使用者的紀錄：
- 如果訊息裡附上了「使用者的紀錄」，只能根據裡面的內容回答，沒有記錄的就說沒有記錄，不要推測或編造。
- 「這週」「本週」指紀錄裡【這週】那一段，不是從星期一算起。問這週時只看【這週】，【前一週】只在對方問到比較或更早的日子時才用。
- 紀錄裡已經算好的數字（例如記錄天數）直接照用，不要自己重新數。
- 如果沒有附上紀錄，而對方問的是自己的狀況（例如「我這週睡得怎樣」），就說明你看不到他的紀錄，不要編造。並依照訊息開頭寫的場合提醒他：
  ・在一對一聊天：打「本週」可以看這週的摘要；打「AI 設定」並選擇同意，之後問你時就會參考他的紀錄。
  ・在群組：你在群組裡永遠不會讀任何人的紀錄，就算對方同意過也一樣（同意只對一對一聊天有效）。只提醒他私訊這個官方帳號：在一對一聊天裡打「本週」可以看摘要，或直接問你；不要說在群組裡同意或設定後就能讀到紀錄。
  用自己的話說，不用逐字照抄。`

export type AskResult = { ok: true; text: string } | { ok: false }

/**
 * 問 Claude 一個問題。每題獨立，不帶對話歷史。
 *
 * recordContext 為 null 代表「不給 AI 看任何紀錄」——群組、或本人選了不要。
 * 任何錯誤（沒設 key、額度用完、網路問題）都回 { ok: false }，
 * 由呼叫端回一句說明，而不是讓 bot 沒有反應。
 */
export async function askClaude(
  question: string,
  recordContext: string | null,
  today: string,
  inGroup: boolean,
): Promise<AskResult> {
  const client = useAnthropic()
  if (!client) return { ok: false }

  // 日期範圍由程式算好再告訴 AI：讓它自己數「最近 7 天」會數錯
  const parts = [
    `今天是 ${today}（台北時間）。「這週」指 ${addDays(today, -6)} 到 ${today} 這 7 天。`,
    // 讓 AI 知道場合，提醒時才講得對：一對一不必叫人「去一對一聊天」
    `場合：${inGroup ? '群組' : '一對一聊天'}`,
  ]
  if (recordContext) parts.push(`使用者的紀錄：\n${recordContext}`)
  parts.push(`使用者的訊息：\n${question}`)

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: parts.join('\n\n') }],
    })
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    return text ? { ok: true, text } : { ok: false }
  } catch (err) {
    // 額度用完是 400（credit balance too low），key 錯是 401，都一樣回說明。
    // 記下類型與狀態碼，方便從 Vercel log 看出是哪一種
    if (err instanceof Anthropic.APIError) {
      console.error(`[ai] Claude API 錯誤 ${err.status}: ${err.message}`)
    } else {
      console.error('[ai] 呼叫 Claude 失敗', err)
    }
    return { ok: false }
  }
}

/** 今天還能不能問。可以的話同時記上一筆（資料庫裡是原子操作） */
export async function takeAiQuota(userId: string, today: string): Promise<boolean> {
  const supabase = useSupabase()
  const { data, error } = await supabase.rpc('ai_usage_take', {
    p_user_id: userId,
    p_date: today,
    p_limit: AI_DAILY_LIMIT,
  })
  if (error) {
    // 計數壞掉時寧可擋下，也不要變成沒有上限
    console.error('[ai] 讀取使用次數失敗', error.message)
    return false
  }
  return data === true
}

/**
 * 整理出要給 AI 看的紀錄。只給本人、只給最近 14 天。
 *
 * 刻意只 select 允許的欄位，而不是讀整列再挑：
 * 備註（sleep_note、mood_note、private_note…）與花費從資料庫就不會被讀出來，
 * 日後有人改這個函式，也不會不小心把它們拼進字串裡。
 */
export async function buildRecordContext(userId: string, today: string): Promise<string> {
  const supabase = useSupabase()
  const [{ data: rows }, habits] = await Promise.all([
    supabase
      .from('records')
      .select(
        'record_date, sleep_score, sleep_hours, bed_time, wake_time, morning_temp, night_temp, mood, bowel_movement, bowel_time, leave_home_time, leave_office_time, allergy, liver_care, liver_score, liver_total',
      )
      .eq('user_id', userId)
      .gte('record_date', addDays(today, -(CONTEXT_DAYS - 1)))
      .lte('record_date', today)
      .order('record_date', { ascending: true }),
    getHabits(userId),
  ])

  const lines = [`目前選的自我照顧項目：${habits.join('、')}`]
  if (!rows?.length) {
    lines.push(`最近 ${CONTEXT_DAYS} 天沒有任何紀錄。`)
    return lines.join('\n')
  }

  // 能算的數字由程式算好：讓 Haiku 自己數天數會數錯
  const weekFrom = addDays(today, -6)
  // 分成兩段給：混在同一份清單裡，Haiku 會把上週的日子也算進「這週」
  const thisWeek = rows.filter((r) => r.record_date >= weekFrom)
  const lastWeek = rows.filter((r) => r.record_date < weekFrom)

  lines.push(`【這週】${weekFrom} 到 ${today}，有記錄 ${thisWeek.length} / 7 天（沒出現的日期代表那天沒記錄）：`)
  for (const r of thisWeek) lines.push(describeDay(r))
  if (!thisWeek.length) lines.push('（這週沒有紀錄）')

  lines.push('')
  lines.push(`【前一週】${addDays(today, -(CONTEXT_DAYS - 1))} 到 ${addDays(weekFrom, -1)}，有記錄 ${lastWeek.length} / 7 天：`)
  for (const r of lastWeek) lines.push(describeDay(r))
  if (!lastWeek.length) lines.push('（前一週沒有紀錄）')
  return lines.join('\n')
}

const hhmm = (t: unknown) => (t ? String(t).slice(0, 5) : null)

function describeDay(r: Record<string, any>): string {
  const parts: string[] = []

  const sleep: string[] = []
  if (r.sleep_score !== null) sleep.push(`滿意度 ${r.sleep_score}%`)
  if (r.sleep_hours !== null) sleep.push(`${Number(r.sleep_hours)} 小時`)
  if (r.bed_time || r.wake_time) sleep.push(`${hhmm(r.bed_time) ?? '?'} 睡、${hhmm(r.wake_time) ?? '?'} 起`)
  if (sleep.length) parts.push(`睡眠 ${sleep.join('，')}`)

  if (r.morning_temp !== null) parts.push(`早晨體溫 ${Number(r.morning_temp)}°C`)
  if (r.night_temp !== null) parts.push(`睡前體溫 ${Number(r.night_temp)}°C`)
  if (r.mood) parts.push(`心情 ${r.mood}`)
  if (r.bowel_movement !== null) {
    parts.push(r.bowel_movement ? `有排便${r.bowel_time ? `（${hhmm(r.bowel_time)}）` : ''}` : '沒有排便')
  }
  if (r.leave_home_time) parts.push(`出門 ${hhmm(r.leave_home_time)}`)
  if (r.leave_office_time) parts.push(`下班 ${hhmm(r.leave_office_time)}`)
  if (r.allergy?.length) parts.push(`過敏 ${r.allergy.join('、')}`)

  const done: string[] = r.liver_care ?? []
  const total = r.liver_total ?? done.length
  parts.push(`自我照顧 ${r.liver_score ?? done.length}/${total}${done.length ? `（做了：${done.join('、')}）` : ''}`)

  return `${r.record_date}｜${parts.join('｜')}`
}
