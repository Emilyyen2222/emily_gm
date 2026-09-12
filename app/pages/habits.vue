<script setup lang="ts">
import { HABIT_MAX, HABIT_MIN, HABIT_POOL } from '#shared/types/record'

const { ready, initError, init, getIdToken } = useLiff()
const route = useRoute()
const router = useRouter()

const selected = ref<string[]>([])
const loading = ref(true)
const pending = ref(false)
const error = ref<string | null>(null)

/** 第一次設定時進來的，存完直接回表單；從紀錄頁點進來的則留在原地 */
const isFirstTime = computed(() => route.query.first === '1')
const count = computed(() => selected.value.length)
const valid = computed(() => count.value >= HABIT_MIN && count.value <= HABIT_MAX)

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }
  try {
    const idToken = await getIdToken()
    const data = await $fetch<{ habits: string[] | null }>('/api/habits', {
      headers: { 'x-liff-id-token': idToken },
    })
    if (data.habits) selected.value = [...data.habits]
  } catch {
    // 讀不到就當作還沒設定過，讓使用者重新選
  } finally {
    loading.value = false
  }
})

function toggle(habit: string) {
  if (selected.value.includes(habit)) {
    selected.value = selected.value.filter((h) => h !== habit)
  } else if (count.value < HABIT_MAX) {
    selected.value = [...selected.value, habit]
  }
}

async function save() {
  if (!valid.value || pending.value) return
  pending.value = true
  error.value = null
  try {
    const idToken = await getIdToken()
    await $fetch('/api/habits', { method: 'PUT', body: { idToken, habits: selected.value } })
    router.push('/')
  } catch (err: any) {
    error.value = err?.data?.statusMessage ?? '儲存失敗，請再試一次'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream pb-28">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-5">
        <h1 class="text-h1 font-bold text-brand-brown">我的自我照顧項目</h1>
        <p class="mt-1 text-body text-brand-brown-light">
          選 {{ HABIT_MIN }}–{{ HABIT_MAX }} 項你在乎的事，之後每天只會看到這幾項
        </p>
      </header>

      <div v-if="initError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
        {{ initError }}
      </div>

      <div v-else-if="loading" class="h-48 animate-pulse rounded-2xl bg-brand-panel/60" />

      <div v-else class="rounded-2xl border border-brand-border bg-white p-4">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="habit in HABIT_POOL"
            :key="habit"
            type="button"
            class="min-h-12 rounded-xl border-2 px-4 text-body font-medium transition"
            :class="selected.includes(habit)
              ? 'border-brand-orange bg-brand-orange text-white'
              : count >= HABIT_MAX
                ? 'border-brand-border bg-white text-brand-brown-light/40'
                : 'border-brand-border bg-white text-brand-brown-light'"
            @click="toggle(habit)"
          >
            {{ habit }}
          </button>
        </div>

        <p class="mt-4 text-body text-brand-brown-light">
          已選 <span class="font-bold text-brand-brown">{{ count }}</span> 項
          <span v-if="count >= HABIT_MAX" class="text-caption">（最多 {{ HABIT_MAX }} 項，想換要先取消一項）</span>
        </p>
      </div>

      <p class="mt-4 px-1 text-caption text-brand-brown-light">
        之後隨時可以從記錄頁的「自我照顧」下方修改。換項目不會影響已經記錄過的日子。
      </p>

      <NuxtLink v-if="!isFirstTime" to="/" class="mt-2 block py-2 text-center text-body text-brand-orange underline">
        回到記錄
      </NuxtLink>
    </div>

    <div class="fixed inset-x-0 bottom-0 border-t border-brand-border bg-brand-cream/95 p-4 backdrop-blur">
      <p v-if="error" class="mb-2 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-body text-red-700">{{ error }}</p>
      <button
        type="button"
        :disabled="!valid || pending"
        class="mx-auto flex h-14 w-full max-w-lg items-center justify-center rounded-2xl bg-brand-orange text-body-lg font-bold text-white transition active:bg-brand-orange-dark disabled:opacity-50"
        @click="save"
      >
        {{ pending ? '儲存中…' : valid ? '儲存' : `請選 ${HABIT_MIN}–${HABIT_MAX} 項` }}
      </button>
    </div>
  </div>
</template>
