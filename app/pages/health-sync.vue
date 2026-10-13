<script setup lang="ts">
import type { PeriodStatusResponse } from '#shared/types/period'

/**
 * 健康 App 同步設定。選單上沒有入口，網址直接給要用的人 ——
 * 目前只有一個人需要，放進選單反而讓其他人看到一個用不到的功能。
 */
const { ready, initError, init, getIdToken } = useLiff()

const loading = ref(true)
const connected = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
/** 剛產生的同步碼。只在這一次顯示，離開頁面就看不到了 */
const token = ref<string | null>(null)
const copied = ref(false)

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }
  try {
    const idToken = await getIdToken()
    const data = await $fetch<PeriodStatusResponse>('/api/period/me', { headers: { 'x-liff-id-token': idToken } })
    connected.value = data.connected
  } catch {
    // 讀不到就當作還沒設定過，產生新的一組也不會壞事
  } finally {
    loading.value = false
  }
})

async function generate() {
  pending.value = true
  error.value = null
  copied.value = false
  try {
    const idToken = await getIdToken()
    const data = await $fetch<{ token: string }>('/api/health/token', { method: 'POST', body: { idToken } })
    token.value = data.token
    connected.value = true
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? err?.message ?? '產生失敗，請再試一次'
  } finally {
    pending.value = false
  }
}

async function copy() {
  if (!token.value) return
  try {
    await navigator.clipboard.writeText(token.value)
    copied.value = true
  } catch {
    // LINE 內建瀏覽器有時不給寫剪貼簿，同步碼本身可以長按選取
    copied.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream pb-12">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-5">
        <h1 class="text-h1 font-bold text-brand-brown">健康 App 同步</h1>
        <p class="mt-1 text-body text-brand-brown-light">
          用 iPhone 的「捷徑」把健康 App 的月經紀錄同步過來。只有你看得到，不會出現在卡片上，AI 也讀不到。
        </p>
      </header>

      <div v-if="initError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
        {{ initError }}
      </div>

      <div v-else-if="loading" class="h-32 animate-pulse rounded-2xl bg-brand-panel/60" />

      <div v-else class="space-y-4">
        <div v-if="token" class="rounded-2xl border border-brand-border bg-white p-4">
          <p class="text-body text-brand-brown">同步碼只會顯示這一次，複製後貼到捷徑裡</p>
          <p class="mt-3 select-all break-all rounded-xl bg-brand-hover p-3 font-mono text-body text-brand-brown">{{ token }}</p>
          <button
            type="button"
            class="mt-3 h-12 w-full rounded-xl border-2 border-brand-orange text-body font-bold text-brand-orange"
            @click="copy"
          >
            {{ copied ? '已複製' : '複製' }}
          </button>
        </div>

        <p v-if="error" class="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-body text-red-700">{{ error }}</p>

        <button
          type="button"
          :disabled="pending"
          class="flex h-14 w-full items-center justify-center rounded-2xl bg-brand-orange text-body-lg font-bold text-white transition active:bg-brand-orange-dark disabled:opacity-50"
          @click="generate"
        >
          {{ connected ? '重新產生（舊的會失效）' : '產生同步碼' }}
        </button>
      </div>
    </div>
  </div>
</template>
