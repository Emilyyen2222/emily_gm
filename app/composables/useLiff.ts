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
  /** 診斷用：LIFF 實際回報的環境，只在網址帶 ?debug=1 時顯示 */
  const debugInfo = useState<Record<string, unknown>>('liff-debug', () => ({}))

  /**
   * 能不能把卡片發回開啟 LIFF 的那個聊天室。
   *
   * 群組與多人聊天室是主要情境。一對一（utou，例如與官方帳號的聊天室）
   * 也開放 —— 那裡的卡片等於是自己的記錄簿，往上滑就能看到過去每一天。
   * 外部瀏覽器與無情境（none）則不支援 sendMessages。
   */
  const canShareToChat = computed(
    () => contextType.value === 'group' || contextType.value === 'room' || contextType.value === 'utou',
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

      const context = liff.getContext()
      contextType.value = (context?.type as ChatContextType) ?? 'none'
      chatId.value = context?.groupId ?? context?.roomId ?? null

      const profile = await liff.getProfile()
      displayName.value = profile.displayName

      debugInfo.value = {
        contextType: context?.type ?? null,
        contextKeys: context ? Object.keys(context) : [],
        groupId: (context as any)?.groupId ?? null,
        roomId: (context as any)?.roomId ?? null,
        utouId: (context as any)?.utouId ?? null,
        isInClient: liff.isInClient(),
        isApiAvailable_sendMessages: liff.isApiAvailable('shareTargetPicker'),
        os: liff.getOS(),
        version: liff.getVersion(),
      }

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

  async function sendToChat(message: unknown) {
    if (!canShareToChat.value) return
    await liff.sendMessages([message as never])
  }

  function close() {
    if (liff.isInClient()) liff.closeWindow()
  }

  return {
    ready, initError, displayName, contextType, chatId,
    canShareToChat, isOneToOne, debugInfo,
    init, getIdToken, sendToChat, close,
  }
}
