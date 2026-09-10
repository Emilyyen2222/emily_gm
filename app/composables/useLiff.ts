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

  /** 只有在群組／多人聊天室開啟時，liff.sendMessages() 才能把卡片發回群組 */
  const canShareToChat = computed(() => contextType.value === 'group' || contextType.value === 'room')

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

  return { ready, initError, displayName, contextType, chatId, canShareToChat, init, getIdToken, sendToChat, close }
}
