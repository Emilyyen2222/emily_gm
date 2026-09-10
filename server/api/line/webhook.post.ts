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

  for (const ev of body.events ?? []) {
    const source = ev?.source ?? {}
    const chatId: string | undefined = source.groupId ?? source.roomId
    if (!chatId) continue // 一對一聊天不是推播目標

    const chatType = source.groupId ? 'group' : 'room'

    if (ev.type === 'leave') {
      await supabase.from('chats').update({ active: false }).eq('chat_id', chatId)
      continue
    }

    if (ev.type === 'join' || ev.type === 'message') {
      await supabase
        .from('chats')
        .upsert({ chat_id: chatId, chat_type: chatType, active: true }, { onConflict: 'chat_id' })
    }

    // 剛被邀進群組時主動打招呼並附上連結。
    // 少了這一步，群組成員看到的只是「某某已加入群組」，
    // 完全不知道這個機器人要幹嘛、也沒有任何入口可以點。
    if (ev.type === 'join' && ev.replyToken) {
      try {
        await replyMessage(ev.replyToken, [welcomeMessage()])
      } catch {
        // 打招呼失敗不該影響 groupId 的登記，那才是這個端點的主要任務
      }
    }
  }

  // LINE 要求快速回應，逾時會重送
  return { ok: true }
})

/** 進群組時的自我介紹，同時就是每天的記錄入口 */
function welcomeMessage() {
  const url = liffUrl()
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
            text: '睡得如何、心情怎樣、有沒有做到想做的事。填完可以選擇要不要分享摘要到這個群組，互相看看彼此的狀態。',
            size: 'sm',
            color: '#6F5B49',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'text',
            text: '每天早上 8 點我會在這裡提醒大家。',
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

function verifySignature(raw: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = createHmac('sha256', secret).update(raw).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
