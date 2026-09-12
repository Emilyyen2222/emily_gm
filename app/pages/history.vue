<script setup lang="ts">
import { LIVER_CARE_TOTAL, MOOD_SCORE, type DailyRecord, type RecordsResponse } from '#shared/types/record'
import { INSIGHT_MIN_RECORDS, buildInsights } from '#shared/utils/insights'

const { ready, initError, init, getIdToken } = useLiff()

const records = ref<DailyRecord[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const tab = ref<'trend' | 'insight' | 'notes'>('trend')

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }
  try {
    const idToken = await getIdToken()
    const data = await $fetch<RecordsResponse>('/api/records/me', {
      query: { days: 30 },
      headers: { 'x-liff-id-token': idToken },
    })
    records.value = data.records
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage ?? '讀取失敗'
  } finally {
    loading.value = false
  }
})

/** 圖表要舊到新，列表要新到舊 */
const chronological = computed(() => [...records.value].reverse())

const avgSleep = computed(() => {
  const scores = records.value.map((r) => r.sleepScore).filter((s): s is number => s !== null)
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

const avgCare = computed(() => {
  if (!records.value.length) return null
  const total = records.value.reduce((sum, r) => sum + r.liverScore, 0)
  return Math.round((total / (records.value.length * LIVER_CARE_TOTAL)) * 100)
})

const avgMood = computed(() => {
  const scores = records.value.map((r) => (r.mood ? MOOD_SCORE[r.mood] : null)).filter((s): s is number => s != null)
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

const insights = computed(() => buildInsights(records.value))
const needMore = computed(() => Math.max(0, INSIGHT_MIN_RECORDS - records.value.length))

/** 有寫任何備註的日子，當成日記回顧 */
const noteDays = computed(() =>
  records.value.filter((r) => r.sleepNote || r.moodNote || r.bowelNote || r.allergyNote || r.privateNote),
)

function shortDate(date: string) {
  return date.slice(5).replace('-', '/')
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream pb-10">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-5 flex items-center justify-between">
        <h1 class="text-h1 font-bold text-brand-brown">我的紀錄</h1>
        <NuxtLink to="/" class="text-body font-medium text-brand-orange underline">回到記錄</NuxtLink>
      </header>

      <div v-if="initError || loadError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
        {{ initError ?? loadError }}
      </div>

      <div v-else-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="h-32 animate-pulse rounded-2xl bg-brand-panel/60" />
      </div>

      <div v-else-if="!records.length" class="rounded-2xl border border-brand-border bg-white p-8 text-center text-body text-brand-brown-light">
        還沒有任何紀錄，先去填一筆吧
      </div>

      <div v-else class="space-y-4">
        <!-- 三個平均值 -->
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-2xl border border-brand-border bg-white p-3">
            <p class="text-caption text-brand-brown-light">睡眠</p>
            <p class="mt-1 text-h3 font-bold text-brand-brown">{{ avgSleep ?? '-' }}<span class="text-caption font-normal text-brand-brown-light">%</span></p>
          </div>
          <div class="rounded-2xl border border-brand-border bg-white p-3">
            <p class="text-caption text-brand-brown-light">心情</p>
            <p class="mt-1 text-h3 font-bold text-brand-brown">{{ avgMood ?? '-' }}<span class="text-caption font-normal text-brand-brown-light">%</span></p>
          </div>
          <div class="rounded-2xl border border-brand-border bg-white p-3">
            <p class="text-caption text-brand-brown-light">自我照顧</p>
            <p class="mt-1 text-h3 font-bold text-brand-orange">{{ avgCare ?? '-' }}<span class="text-caption font-normal text-brand-brown-light">%</span></p>
          </div>
        </div>

        <!-- 分頁切換 -->
        <div class="flex gap-1 rounded-2xl border border-brand-border bg-white p-1">
          <button
            v-for="t in [{ k: 'trend', label: '趨勢' }, { k: 'insight', label: '洞察' }, { k: 'notes', label: '備註' }]"
            :key="t.k"
            type="button"
            class="flex-1 rounded-xl py-2.5 text-body font-medium transition"
            :class="tab === t.k ? 'bg-brand-orange text-white' : 'text-brand-brown-light'"
            @click="tab = t.k as any"
          >{{ t.label }}</button>
        </div>

        <!-- 趨勢 -->
        <template v-if="tab === 'trend'">
          <section class="rounded-2xl border border-brand-border bg-white p-4">
            <h2 class="mb-4 text-h3 font-bold text-brand-brown">睡眠品質</h2>
            <!-- 長條與日期分成兩層：百分比高度需要父層有明確高度，
                 把標籤放進同一個 flex 欄會讓父層變成 auto，長條就撐不出來 -->
            <div class="flex h-32 items-end gap-1.5">
              <div
                v-for="r in chronological"
                :key="r.recordDate"
                class="flex h-full flex-1 items-end overflow-hidden rounded-md bg-brand-panel/40"
                :title="`${r.recordDate}：${r.sleepScore ?? '未填'}%`"
              >
                <div class="w-full rounded-md bg-brand-orange transition-all" :style="{ height: `${r.sleepScore ?? 0}%` }" />
              </div>
            </div>
            <div class="mt-1.5 flex gap-1.5">
              <span
                v-for="r in chronological"
                :key="r.recordDate"
                class="flex-1 text-center text-caption text-brand-brown-light/70"
              >{{ shortDate(r.recordDate) }}</span>
            </div>
          </section>

          <section class="rounded-2xl border border-brand-border bg-white p-4">
            <h2 class="mb-4 text-h3 font-bold text-brand-brown">自我照顧</h2>
            <div class="flex h-32 items-end gap-1.5">
              <div
                v-for="r in chronological"
                :key="r.recordDate"
                class="flex h-full flex-1 items-end overflow-hidden rounded-md bg-brand-panel/40"
                :title="`${r.recordDate}：${r.liverScore} / ${LIVER_CARE_TOTAL}`"
              >
                <div
                  class="w-full rounded-md bg-brand-orange/70 transition-all"
                  :style="{ height: `${(r.liverScore / LIVER_CARE_TOTAL) * 100}%` }"
                />
              </div>
            </div>
            <div class="mt-1.5 flex gap-1.5">
              <span
                v-for="r in chronological"
                :key="r.recordDate"
                class="flex-1 text-center text-caption text-brand-brown-light/70"
              >{{ shortDate(r.recordDate) }}</span>
            </div>
          </section>
        </template>

        <!-- 洞察 -->
        <template v-else-if="tab === 'insight'">
          <div v-if="needMore > 0" class="rounded-2xl border border-brand-border bg-white p-6 text-center">
            <p class="text-body text-brand-brown">再記錄 {{ needMore }} 天就能開始看關聯</p>
            <p class="mt-2 text-caption text-brand-brown-light">
              資料太少的時候，任何差異都可能只是巧合，所以先不顯示
            </p>
          </div>

          <div v-else-if="!insights.length" class="rounded-2xl border border-brand-border bg-white p-6 text-center">
            <p class="text-body text-brand-brown">目前看不出明顯的關聯</p>
            <p class="mt-2 text-caption text-brand-brown-light">
              這也是一種結果 —— 表示這些習慣之間的差異還不夠大
            </p>
          </div>

          <section
            v-for="insight in insights"
            v-else
            :key="insight.title"
            class="rounded-2xl border border-brand-border bg-white p-4"
          >
            <h3 class="text-body font-bold text-brand-brown">{{ insight.title }}</h3>
            <p class="mt-1 text-h3 font-bold" :class="insight.delta > 0 ? 'text-brand-green' : 'text-brand-orange'">
              {{ insight.delta > 0 ? '高' : '低' }} {{ Math.abs(insight.delta) }}{{ insight.unit }}
            </p>
            <div class="mt-3 space-y-2">
              <div v-for="side in [
                { label: insight.withLabel, value: insight.withValue, days: insight.withDays },
                { label: insight.withoutLabel, value: insight.withoutValue, days: insight.withoutDays },
              ]" :key="side.label" class="flex items-center gap-2">
                <span class="w-20 shrink-0 text-caption text-brand-brown-light">{{ side.label }}</span>
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-brand-panel">
                  <div class="h-full rounded-full bg-brand-orange" :style="{ width: `${side.value}%` }" />
                </div>
                <span class="w-20 shrink-0 text-right text-caption text-brand-brown-light">
                  {{ side.value }}{{ insight.unit }}・{{ side.days }}天
                </span>
              </div>
            </div>
          </section>

          <p v-if="insights.length" class="px-2 text-caption text-brand-brown-light">
            這些是單純的平均值對照，不代表因果關係。天數越多、參考價值越高。
          </p>
        </template>

        <!-- 備註 -->
        <template v-else>
          <div v-if="!noteDays.length" class="rounded-2xl border border-brand-border bg-white p-6 text-center text-body text-brand-brown-light">
            還沒有寫過任何備註
          </div>
          <section
            v-for="r in noteDays"
            :key="r.recordDate"
            class="rounded-2xl border border-brand-border bg-white p-4"
          >
            <div class="flex items-baseline gap-2">
              <h3 class="text-body font-bold text-brand-brown">{{ r.recordDate }}</h3>
              <span v-if="r.mood" class="text-body-lg">{{ r.mood }}</span>
              <span v-if="r.sleepScore !== null" class="text-caption text-brand-brown-light">睡眠 {{ r.sleepScore }}%</span>
            </div>
            <dl class="mt-3 space-y-2">
              <div v-for="note in [
                { label: '夢', value: r.sleepNote },
                { label: '心情', value: r.moodNote },
                { label: '排便', value: r.bowelNote },
                { label: '過敏', value: r.allergyNote },
                { label: '只給自己的', value: r.privateNote },
              ].filter((n) => n.value)" :key="note.label">
                <dt class="text-caption text-brand-brown-light">{{ note.label }}</dt>
                <dd class="text-body text-brand-brown">{{ note.value }}</dd>
              </div>
            </dl>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>
