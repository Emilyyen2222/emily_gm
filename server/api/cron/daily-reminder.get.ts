import { LIVER_CARE_TOTAL } from '../../../shared/types/record'

/**
 * 每日提醒推播。由 Vercel Cron 於 00:00 UTC（= 台北 08:00）觸發。
 *
 * Vercel Hobby 方案的 Cron 一天只能觸發一次，所以週報沒有另設排程，
 * 而是在這裡判斷「今天是不是星期一」再決定要不要一併發出。
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabase = useSupabase()

  const auth = getHeader(event, 'authorization')
  const userAgent = getHeader(event, 'user-agent') ?? ''
  const isVercelCron = userAgent.includes('vercel-cron')
  const triggeredBy = isVercelCron ? 'vercel-cron' : '手動'

  // 一進來就先記一筆。Vercel 免費方案的 log 只留一小時，
  // 沒有這筆紀錄的話，隔天完全無法判斷「有跑但失敗」與「根本沒被觸發」的差別。
  //
  // 刻意記在認證檢查「之前」：被自己的認證擋掉也是一種失敗，而且是最難察覺的
  // 那一種——從外面看，它跟「完全沒被觸發」長得一模一樣。
  // 但只記錄看起來像是 cron 嘗試的請求，避免路人亂打就灌爆這張表。
  let runId: string | null = null
  if (isVercelCron || auth) {
    const { data } = await supabase
      .from('cron_runs')
      .insert({ job: 'daily-reminder', triggered_by: triggeredBy })
      .select('id')
      .single()
    runId = data?.id ?? null
  }

  const finish = async (fields: Record<string, unknown>) => {
    if (!runId) return
    await supabase.from('cron_runs').update({ finished_at: new Date().toISOString(), ...fields }).eq('id', runId)
  }

  // Vercel 觸發 Cron 時會自動帶上 Authorization: Bearer <CRON_SECRET>，
  // 但只有在環境變數「剛好叫 CRON_SECRET」的時候才會這麼做。
  // 我們原本只有 NUXT_CRON_SECRET（Nuxt runtimeConfig 的命名規則要求 NUXT_ 前綴），
  // 所以 Vercel 送來的請求根本沒有 header，被自己的認證擋在門外。
  // 兩個名字都接受，手動 curl 與 Vercel 自動觸發就都能通過。
  const accepted = [config.cronSecret, process.env.CRON_SECRET].filter(Boolean) as string[]
  if (!accepted.length || !accepted.some((secret) => auth === `Bearer ${secret}`)) {
    await finish({ status: 'unauthorized', note: `認證失敗（來源：${triggeredBy}，有帶 header：${Boolean(auth)}）` })
    throw createError({ statusCode: 401, statusMessage: '未授權' })
  }

  const { data: chats, error } = await supabase.from('chats').select('chat_id').eq('active', true)
  if (error) {
    await finish({ status: 'failed', note: `讀取推播目標失敗：${error.message}` })
    throw createError({ statusCode: 500, statusMessage: `讀取推播目標失敗：${error.message}` })
  }

  if (!chats?.length) {
    const note = '尚無已登記的群組，請先把 bot 邀請進群組'
    await finish({ status: 'done', note })
    return { sent: 0, weekly: false, note }
  }

  const url = liffUrl()
  const isMonday = taipeiWeekday() === 1
  const weeklyMessage = isMonday ? await buildWeeklyReport() : null

  let sent = 0
  const failed: string[] = []

  for (const chat of chats) {
    const messages: unknown[] = [reminderCard(url)]
    if (weeklyMessage) messages.push(weeklyMessage)

    try {
      await pushMessage(chat.chat_id, messages)
      sent++
    } catch {
      // 單一群組失敗（例如 bot 已被踢除）不應中斷其他群組的推播
      failed.push(chat.chat_id)
    }
  }

  await finish({
    status: failed.length ? 'partial' : 'done',
    sent,
    failed: failed.length,
    weekly: Boolean(weeklyMessage),
    note: failed.length ? `推播失敗的聊天室：${failed.join(', ')}` : null,
  })

  return { sent, failed, weekly: Boolean(weeklyMessage) }
})

/** 早安提醒卡片。用按鈕而不是裸網址，點擊區域大得多，也比較不像廣告訊息 */
function reminderCard(url: string) {
  return {
    type: 'flex',
    altText: `早安！來記錄一下今天的狀態吧 ${url}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFF8EF',
        paddingAll: '18px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', width: '4px', backgroundColor: '#F9A726', cornerRadius: '2px', contents: [] },
              { type: 'text', text: '早安', size: 'sm', weight: 'bold', color: '#F9A726', gravity: 'center' },
            ],
          },
          {
            type: 'text',
            text: '今天睡得如何？',
            size: 'xl',
            weight: 'bold',
            color: '#3A2513',
            margin: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: '花 10 秒記錄一下，想到什麼填什麼就好。',
            size: 'sm',
            color: '#6F5B49',
            margin: 'sm',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFF8EF',
        paddingAll: '18px',
        paddingTop: 'none',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#F9A726',
            height: 'sm',
            action: { type: 'uri', label: '開始記錄', uri: url },
          },
        ],
      },
    },
  }
}

/** 上週（一到日）各成員的護肝達標率排行 */
async function buildWeeklyReport() {
  const today = taipeiToday()
  const start = addDays(today, -7)
  const end = addDays(today, -1)

  const supabase = useSupabase()
  const { data } = await supabase
    .from('records')
    .select('user_id, display_name, liver_score')
    .gte('record_date', start)
    .lte('record_date', end)

  if (!data?.length) return null

  const byUser = new Map<string, { name: string; score: number; days: number }>()
  for (const row of data) {
    const entry = byUser.get(row.user_id) ?? { name: row.display_name ?? '匿名', score: 0, days: 0 }
    entry.name = row.display_name ?? entry.name
    entry.score += row.liver_score ?? 0
    entry.days += 1
    byUser.set(row.user_id, entry)
  }

  const ranking = [...byUser.values()]
    .map((u) => ({ ...u, rate: Math.round((u.score / (u.days * LIVER_CARE_TOTAL)) * 100) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10)

  return {
    type: 'flex',
    altText: `上週誰的肝最乾淨：${ranking[0]!.name} ${ranking[0]!.rate}%`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '上週誰的肝最乾淨', weight: 'bold', size: 'lg' },
          { type: 'text', text: `${start} ~ ${end}`, size: 'xs', color: '#6b7280' },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: ranking.map((u, i) => ({
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: `${i + 1}.`, size: 'sm', color: '#6b7280', flex: 1 },
                { type: 'text', text: u.name, size: 'sm', flex: 5, wrap: true },
                { type: 'text', text: `${u.rate}%`, size: 'sm', weight: 'bold', flex: 2, align: 'end' },
                { type: 'text', text: `${u.days} 天`, size: 'xs', color: '#9ca3af', flex: 2, align: 'end' },
              ],
            })),
          },
        ],
      },
    },
  }
}
