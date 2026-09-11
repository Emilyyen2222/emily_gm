import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * LINE Webhook。這個端點唯一的實質工作，是把 bot 所在的群組 ID 記下來
 * —— groupId 只能從 webhook 事件取得，沒有它就無法定時推播。
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // 必須用「原始字串」驗簽章。先 JSON.parse 再重新序列化會因為
  // 空白與鍵序改變導致簽章永遠對不上。
  const raw = await readRawBody(event, 'utf8')
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: '空的請求內容' })
  }

  if (!verifySignature(raw, getHeader(event, 'x-line-signature'), config.lineChannelSecret)) {
    throw createError({ statusCode: 401, statusMessage: '簽章驗證失敗' })
  }

  const body = JSON.parse(raw) as { events?: any[] }
  const supabase = useSupabase()

  // 逐一記錄每個事件的處理結果。LINE 不看回應內容，但我們可以用
  // 帶正確簽章的請求打這個端點，直接讀出哪一步失敗了。
  const handled: string[] = []

  for (const ev of body.events ?? []) {
    const source = ev?.source ?? {}

    // 使用者把官方帳號加為好友。這是一對一情境，沒有 groupId，
    // 所以要在取 chatId 之前處理，否則會被下面的 continue 跳掉。
    if (ev.type === 'follow' || ev.type === 'unfollow') {
      const userId: string | undefined = source.userId
      if (!userId) {
        handled.push(`${ev.type}: 沒有 userId`)
        continue
      }

      if (ev.type === 'unfollow') {
        // 封鎖或刪除好友。不能再推播給這個人，但紀錄保留
        await supabase.from('chats').update({ active: false }).eq('chat_id', userId)
        handled.push('unfollow: 已停止對此使用者推播')
        continue
      }

      // 加好友時登記成推播目標。群組被退掉之後，一對一是唯一還能主動提醒的管道
      const { error } = await supabase
        .from('chats')
        .upsert({ chat_id: userId, chat_type: 'user', active: true }, { onConflict: 'chat_id' })
      handled.push(error ? `follow: 登記失敗 ${error.message}` : 'follow: 已登記為推播對象')

      if (!ev.replyToken) {
        handled.push('follow: 沒有 replyToken，無法打招呼')
        continue
      }
      try {
        await replyMessage(ev.replyToken, [welcomeMessage('follow')])
        handled.push('follow: 已回覆歡迎卡片')
      } catch (err: any) {
        handled.push(`follow: 回覆失敗 ${describe(err)}`)
      }
      continue
    }

    // 文字訊息：一對一一律回應，群組只在「訊息剛好是關鍵字」或「被 @ 到」時回應。
    // 群組裡大家整天在聊天，bot 每句都插嘴會很快被踢出去。
    if (ev.type === 'message' && ev.message?.type === 'text' && ev.replyToken) {
      const isDirect = source.type === 'user'
      const mentionees: any[] = ev.message.mention?.mentionees ?? []
      const botId = mentionees.length ? await getBotUserId() : null
      const mentioned = mentionees.some((m) => m.isSelf === true || (botId && m.userId === botId))

      const text = stripMentions(String(ev.message.text ?? ''), mentionees)
      const reply = await buildTextReply(text, source.userId, source.groupId ?? source.roomId, {
        respondToUnknown: isDirect || mentioned,
      })

      if (reply) {
        try {
          await replyMessage(ev.replyToken, [reply])
          handled.push('message: 已回覆')
        } catch (err: any) {
          handled.push(`message: 回覆失敗 ${describe(err)}`)
        }
      }
    }

    // 「拍拍」按鈕
    if (ev.type === 'postback' && ev.replyToken) {
      const data = new URLSearchParams(ev.postback?.data ?? '')
      if (data.get('action') === 'pat') {
        const target = data.get('name') ?? '對方'
        let patter = '有人'
        try {
          if (source.userId) {
            const profile = await getProfile(source.userId, source.groupId)
            if (profile?.displayName) patter = profile.displayName
          }
        } catch {
          // 取不到暱稱不影響功能，用「有人」代替
        }
        try {
          await replyMessage(ev.replyToken, [{ type: 'text', text: `${patter} 拍拍了 ${target} 👏` }])
          handled.push('postback: 已回覆拍拍')
        } catch (err: any) {
          handled.push(`postback: 回覆失敗 ${describe(err)}`)
        }
      }
      continue
    }

    const chatId: string | undefined = source.groupId ?? source.roomId
    if (!chatId) {
      handled.push(`${ev.type}: 沒有 groupId／roomId，略過`)
      continue
    }

    const chatType = source.groupId ? 'group' : 'room'

    if (ev.type === 'leave') {
      await supabase.from('chats').update({ active: false }).eq('chat_id', chatId)
      handled.push('leave: 已標記為非活躍')
      continue
    }

    if (ev.type === 'join' || ev.type === 'message') {
      const { error } = await supabase
        .from('chats')
        .upsert({ chat_id: chatId, chat_type: chatType, active: true }, { onConflict: 'chat_id' })
      handled.push(error ? `${ev.type}: 登記失敗 ${error.message}` : `${ev.type}: 已登記聊天室`)
    }

    // 剛被邀進群組時主動打招呼並附上連結。
    // 少了這一步，群組成員看到的只是「某某已加入群組」，
    // 完全不知道這個機器人要幹嘛、也沒有任何入口可以點。
    if (ev.type === 'join') {
      if (!ev.replyToken) {
        handled.push('join: 沒有 replyToken，無法打招呼')
      } else {
        try {
          await replyMessage(ev.replyToken, [welcomeMessage('join')])
          handled.push('join: 已回覆歡迎卡片')
        } catch (err: any) {
          // 打招呼失敗不該影響 groupId 的登記，那才是這個端點的主要任務
          handled.push(`join: 回覆失敗 ${describe(err)}`)
        }
      }
    }
  }

  // LINE 要求快速回應，逾時會重送
  return { ok: true, handled }
})

/** 把 $fetch 的錯誤壓成一行，方便從回應裡直接看出原因 */
function describe(err: any): string {
  const status = err?.response?.status ?? err?.statusCode ?? '?'
  const detail = err?.data ? JSON.stringify(err.data) : (err?.message ?? '')
  return `[${status}] ${detail}`.slice(0, 300)
}

/**
 * 自我介紹卡片，同時就是記錄入口。
 * 群組與一對一的說明不同：只有在群組裡開啟才能分享摘要給其他人，
 * 從一對一開啟時分享功能不會出現，講清楚才不會讓人以為壞掉了。
 */
function welcomeMessage(context: 'join' | 'follow') {
  const url = liffUrl()
  const isGroup = context === 'join'
  return {
    type: 'flex',
    altText: `早安！每天記錄一下狀態吧 ${url}`,
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
              { type: 'text', text: 'Good Morning', size: 'sm', weight: 'bold', color: '#F9A726', gravity: 'center' },
            ],
          },
          {
            type: 'text',
            text: '每天花 10 秒，記錄一下自己的狀態',
            size: 'lg',
            weight: 'bold',
            color: '#3A2513',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'text',
            text: isGroup
              ? '睡得如何、心情怎樣、有沒有做到想做的事。填完可以選擇要不要分享摘要到這個群組，互相看看彼此的狀態。'
              : '睡得如何、心情怎樣、有沒有做到想做的事。想到什麼填什麼，不用一次填完，晚點還能回來補。',
            size: 'sm',
            color: '#6F5B49',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'text',
            text: isGroup
              ? '每天早上 10 點我會在這裡提醒大家。'
              : '想跟朋友互相監督的話，把我邀進你們的群組，我每天早上 10 點會在那裡提醒。',
            size: 'xs',
            color: '#6F5B49',
            wrap: true,
            margin: 'md',
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

/**
 * 移除訊息裡的 @提及文字，只留下真正的指令。
 * 使用者打「@Emily Good Morning 今天」時，我們要比對的是「今天」。
 * 從後往前刪，才不會讓前面的刪除動作影響後面片段的索引。
 */
function stripMentions(text: string, mentionees: any[]): string {
  if (!mentionees.length) return text.trim()
  const ranges = mentionees
    .filter((m) => typeof m.index === 'number' && typeof m.length === 'number')
    .sort((a, b) => b.index - a.index)
  let result = text
  for (const m of ranges) result = result.slice(0, m.index) + result.slice(m.index + m.length)
  return result.trim()
}

function verifySignature(raw: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = createHmac('sha256', secret).update(raw).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
