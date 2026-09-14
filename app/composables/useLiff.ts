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
   * 目前這個 LIFF 應用沒有這個權限，實測會拋出
   * 「FORBIDDEN: shareTargetPicker is not allowed in this LIFF app」。
   * 那是應用層級的授權，不是執行環境或 LINE 版本的問題 —— 但 Console
   * 的 LIFF 設定頁沒有對應開關，LIFF 管理 API 也沒有這個欄位
   * （送 features.shareTargetPicker 會回 200 但完全不生效）。
   *
   * 所以呼叫端一律先用 canPickTarget 判斷，不可用時退回「從群組開啟」的
   * 提示。這段程式保留著：哪天 LINE 開放了，把判斷放行就能直接用。
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
