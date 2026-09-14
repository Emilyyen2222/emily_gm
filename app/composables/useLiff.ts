import liff from '@line/liff'

type ChatContextType = 'group' | 'room' | 'utou' | 'external' | 'none'

/**
 * LIFF 初始化與狀態。
 * 一律在 onMounted 之後才呼叫 —— liff SDK 需要 window，SSR 環境下會直接爆掉。
 */
export function useLiff() {
  const ready = useState('liff-ready', () => false)
  const initError = useState<string | null>('liff-error', () => null)
  const displayName = useState<string | null>('liff-name', () => null)
  const contextType = useState<ChatContextType>('liff-context', () => 'none')
  const chatId = useState<string | null>('liff-chat-id', () => null)
  /** 是否在 LINE 內建瀏覽器中。桌機版與外部瀏覽器都發不了訊息 */
  const inClient = useState('liff-in-client', () => false)
  /**
   * 分享對象選擇器是否可用。由執行環境當下決定，不是可以事先啟用的設定：
   * 需要 LIFF SDK 2.4.0+、LINE App 10.3.0+、chat_message.write 權限，
   * 且不在外部瀏覽器。所以只能在 init 之後實際查詢。
   */
  const canPickTarget = useState('liff-can-pick', () => false)

  /**
   * 能不能把卡片發回開啟 LIFF 的那個聊天室。
   *
   * 群組與多人聊天室是主要情境。一對一（utou，例如與官方帳號的聊天室）
   * 也開放 —— 那裡的卡片等於是自己的記錄簿，往上滑就能看到過去每一天。
   * 外部瀏覽器與無情境（none）則不支援 sendMessages。
   */
  const canShareToChat = computed(
    () =>
      inClient.value &&
      (contextType.value === 'group' || contextType.value === 'room' || contextType.value === 'utou'),
  )

  /** 一對一情境的文案要跟群組不同 —— 那裡沒有「其他人」 */
  const isOneToOne = computed(() => contextType.value === 'utou')

  async function init() {
    if (ready.value) return
    const { public: config } = useRuntimeConfig()

    if (!config.liffId) {
      initError.value = 'LIFF ID 未設定（NUXT_PUBLIC_LIFF_ID）'
      return
    }

    try {
      await liff.init({ liffId: config.liffId })

      if (!liff.isLoggedIn()) {
        // 導向 LINE 登入，回來後會重新執行一次 init
        liff.login({ redirectUri: window.location.href })
        return
      }

      inClient.value = liff.isInClient()
      canPickTarget.value = liff.isApiAvailable('shareTargetPicker')
      const context = liff.getContext()
      contextType.value = (context?.type as ChatContextType) ?? 'none'
      chatId.value = context?.groupId ?? context?.roomId ?? null

      const profile = await liff.getProfile()
      displayName.value = profile.displayName

      ready.value = true
    } catch (err) {
      initError.value = err instanceof Error ? err.message : 'LIFF 初始化失敗'
    }
  }

  async function getIdToken(): Promise<string> {
    const token = liff.getIDToken()
    if (!token) throw new Error('取不到 ID Token，請重新開啟頁面')
    return token
  }

  /**
   * 讓使用者自己挑要分享到哪些聊天室。回傳 false 代表使用者取消。
   *
   * 刻意「不」先看 isApiAvailable 就擋下來：那個判斷可能偏保守，而實際
   * 呼叫拋出的錯誤帶有錯誤碼，能對照 LIFF 文件查出真正的原因。先擋下來
   * 只會得到我自己寫的那句話，等於把診斷資訊丟掉。
   */
  async function shareToPicked(message: unknown): Promise<boolean> {
    const available = liff.isApiAvailable('shareTargetPicker')
    try {
      const result = await liff.shareTargetPicker([message as never])
      // 使用者按了取消時會回傳 null，那不是錯誤
      return result !== null && result !== undefined
    } catch (err: any) {
      const code = err?.code ? `${err.code}` : '無錯誤碼'
      throw new Error(`${code}：${err?.message ?? err}（isApiAvailable=${available}）`)
    }
  }

  async function sendToChat(message: unknown) {
    // 原本這裡靜默 return，讓「沒發出去」看起來跟「發出去了」一模一樣。
    // 改成拋錯，呼叫端才有辦法分辨。
    if (!canShareToChat.value) throw new Error('這個情境不支援分享（context=' + contextType.value + '）')
    if (!liff.isInClient()) throw new Error('不在 LINE 內建瀏覽器中，無法發送訊息')
    await liff.sendMessages([message as never])
  }

  function close() {
    if (liff.isInClient()) liff.closeWindow()
  }

  return {
    ready, initError, displayName, contextType, chatId,
    canShareToChat, isOneToOne, inClient, canPickTarget,
    init, getIdToken, sendToChat, shareToPicked, close,
  }
}
