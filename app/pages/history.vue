<script setup lang="ts">
import { LIVER_CARE_TOTAL, type DailyRecord, type RecordsResponse } from '#shared/types/record'

const { ready, initError, init, getIdToken } = useLiff()

const records = ref<DailyRecord[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }
  try {
    const idToken = await getIdToken()
    const data = await $fetch<RecordsResponse>('/api/records/me', {
      query: { days: 14 },
      headers: { 'x-liff-id-token': idToken },
    })
    // 後端是新到舊，圖表要舊到新
    records.value = [...data.records].reverse()
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage ?? '讀取失敗'
  } finally {
    loading.value = false
  }
})

const avgSleep = computed(() => {
  const scores = records.value.map((r) => r.sleepScore).filter((s): s is number => s !== null)
  if (!scores.length) return null
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
})

const avgLiver = computed(() => {
  if (!records.value.length) return null
  const total = records.value.reduce((sum, r) => sum + r.liverScore, 0)
  return Math.round((total / (records.value.length * LIVER_CARE_TOTAL)) * 100)
})

function shortDate(date: string) {
  return date.slice(5).replace('-', '/')
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream pb-10">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-6 flex items-center justify-between">
        <h1 class="text-h2 font-bold text-brand-brown">我的紀錄</h1>
        <NuxtLink to="/" class="text-body text-brand-orange underline">回到記錄</NuxtLink>
      </header>

      <div v-if="initError || loadError" class="rounded-xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
        {{ initError ?? loadError }}
      </div>

      <div v-else-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="h-32 animate-pulse rounded-2xl bg-brand-panel/60" />
      </div>

      <div v-else-if="!records.length" class="rounded-2xl bg-white p-8 text-center text-body text-brand-brown-light border border-brand-border shadow-sm">
        還沒有任何紀錄，先去填一筆吧
      </div>

      <div v-else class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-2xl bg-white p-4 border border-brand-border shadow-sm">
            <p class="text-caption text-brand-brown-light">平均睡眠分數</p>
            <p class="mt-1 text-h2 font-bold text-brand-brown">{{ avgSleep ?? '-' }}<span class="text-sm font-normal text-brand-brown-light/70"> / 5</span></p>
          </div>
          <div class="rounded-2xl bg-white p-4 border border-brand-border shadow-sm">
            <p class="text-caption text-brand-brown-light">自我照顧達標率</p>
            <p class="mt-1 text-h2 font-bold text-brand-orange">{{ avgLiver ?? '-' }}<span class="text-sm font-normal text-brand-brown-light/70">%</span></p>
          </div>
        </div>

        <!-- 資料點少，用 CSS 長條即可，不需引入圖表庫 -->
        <section class="rounded-2xl bg-white p-4 border border-brand-border shadow-sm">
          <h2 class="mb-4 font-semibold text-brand-brown">睡眠分數</h2>
          <div class="flex h-32 items-end gap-1">
            <div v-for="r in records" :key="r.recordDate" class="flex flex-1 flex-col items-center gap-1">
              <div
                class="w-full rounded-t bg-brand-orange"
                :style="{ height: `${((r.sleepScore ?? 0) / 5) * 100}%` }"
                :title="`${r.recordDate}：${r.sleepScore ?? '-'} 分`"
              />
              <span class="text-[10px] text-brand-brown-light/70">{{ shortDate(r.recordDate) }}</span>
            </div>
          </div>
        </section>

        <section class="rounded-2xl bg-white p-4 border border-brand-border shadow-sm">
          <h2 class="mb-4 font-semibold text-brand-brown">自我照顧</h2>
          <div class="flex h-32 items-end gap-1">
            <div v-for="r in records" :key="r.recordDate" class="flex flex-1 flex-col items-center gap-1">
              <div
                class="w-full rounded-t bg-brand-gold"
                :style="{ height: `${(r.liverScore / LIVER_CARE_TOTAL) * 100}%` }"
                :title="`${r.recordDate}：${r.liverScore} / ${LIVER_CARE_TOTAL}`"
              />
              <span class="text-[10px] text-brand-brown-light/70">{{ shortDate(r.recordDate) }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
