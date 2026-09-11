import type { H3Event } from 'h3'

/**
 * 推播提醒的共用流程：認證、執行紀錄、讀取推播目標、逐一發送。
 * 早晚兩個提醒只有卡片內容不同，其餘完全一樣，抽出來避免兩邊各改一次。
 */
export async function runReminder(
  event: H3Event,
  job: string,
  buildMessages: (url: string) => Promise<unknown[]>,
) {
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
    const { data } = await supabase.from('cron_runs').insert({ job, triggered_by: triggeredBy }).select('id').single()
    runId = data?.id ?? null
  }

  const finish = async (fields: Record<string, unknown>) => {
    if (!runId) return
    await supabase.from('cron_runs').update({ finished_at: new Date().toISOString(), ...fields }).eq('id', runId)
  }

  // Vercel 觸發 Cron 時會自動帶上 Authorization: Bearer <CRON_SECRET>，
  // 但只有在環境變數「剛好叫 CRON_SECRET」的時候才會這麼做。
  // NUXT_CRON_SECRET（Nuxt runtimeConfig 的命名規則）不會觸發這個行為，
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
    return { sent: 0, failed: [], note }
  }

  const messages = await buildMessages(liffUrl())

  let sent = 0
  const failed: string[] = []
  for (const chat of chats) {
    try {
      await pushMessage(chat.chat_id, messages)
      sent++
    } catch {
      // 單一聊天室失敗（例如 bot 已被踢除）不應中斷其他聊天室的推播
      failed.push(chat.chat_id)
    }
  }

  await finish({
    status: failed.length ? 'partial' : 'done',
    sent,
    failed: failed.length,
    note: failed.length ? `推播失敗的聊天室：${failed.join(', ')}` : null,
  })

  return { sent, failed }
}

/** 早晚提醒共用的卡片外觀，只有文字不同 */
export function reminderCard(opts: {
  label: string
  title: string
  body: string
  button: string
  url: string
}) {
  return {
    type: 'flex',
    altText: `${opts.title} ${opts.url}`,
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
              { type: 'text', text: opts.label, size: 'sm', weight: 'bold', color: '#F9A726', gravity: 'center' },
            ],
          },
          { type: 'text', text: opts.title, size: 'xl', weight: 'bold', color: '#3A2513', margin: 'md', wrap: true },
          { type: 'text', text: opts.body, size: 'sm', color: '#6F5B49', margin: 'sm', wrap: true },
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
            action: { type: 'uri', label: opts.button, uri: opts.url },
          },
        ],
      },
    },
  }
}
