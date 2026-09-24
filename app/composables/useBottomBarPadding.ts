/**
 * 頁面底部有固定的按鈕列時，讓頁面內容底部留出跟那一列一樣高的空間。
 *
 * 那一列會因為「存好了」或錯誤訊息而變高，寫死的留白一定會有某種情況不夠，
 * 內容最底下就被蓋住。量出來多少就留多少。
 *
 * 用法：固定列加上 ref="bottomBar"，頁面最外層加上 :style="paddingStyle"。
 */
export function useBottomBarPadding(extra = 24) {
  const bottomBar = ref<HTMLElement | null>(null)
  const height = ref(160)
  let observer: ResizeObserver | null = null

  watch(bottomBar, (el) => {
    observer?.disconnect()
    if (!el) return
    observer = new ResizeObserver(() => (height.value = el.offsetHeight))
    observer.observe(el)
  })
  onBeforeUnmount(() => observer?.disconnect())

  const paddingStyle = computed(() => ({ paddingBottom: `${height.value + extra}px` }))
  return { bottomBar, paddingStyle }
}
