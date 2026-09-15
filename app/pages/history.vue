<script setup lang="ts">
import { MOOD_SCORE, careRate, formatAmount, type DailyRecord, type RecordsResponse } from '#shared/types/record'
import type { MonthlyExpensesResponse } from '~~/server/api/expenses/me.get'
import { INSIGHT_MIN_RECORDS, buildInsights } from '#shared/utils/insights'
import { buildWeeklyShareCard, lastWeekRange } from '#shared/utils/weeklyCard'

const { ready, initError, displayName, canShareToChat, isOneToOne, canPickTarget, init, getIdToken, sendToChat, shareToPicked } = useLiff()

const records = ref<DailyRecord[]>([])
const today = ref<string | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const tab = ref<'trend' | 'insight' | 'daily' | 'expense'>('trend')

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
    today.value = data.today
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage ?? '讀取失敗'
  } finally {
    loading.value = false
  }
})

/**
 * 記帳：切到那個分頁才載入。
 *
 * 不跟著頁面一起載是因為多數人根本沒在記帳，沒必要每次進來都多打一次 API。
 * 與健康紀錄分開查是因為「本月」和「近 30 天」不是同一段區間。
 */
const expenseMonth = ref<MonthlyExpensesResponse | null>(null)
const expenseLoading = ref(false)
const expenseError = ref<string | null>(null)

async function loadExpenses() {
  if (expenseMonth.value || expenseLoading.value) return
  expenseLoading.value = true
  expenseError.value = null
  try {
    const idToken = await getIdToken()
    expenseMonth.value = await $fetch<MonthlyExpensesResponse>('/api/expenses/me', {
      headers: { 'x-liff-id-token': idToken },
    })
  } catch (err: any) {
    expenseError.value = err?.data?.statusMessage ?? '讀取失敗'
  } finally {
    expenseLoading.value = false
  }
}

watch(tab, (t) => { if (t === 'expense') loadExpenses() })

/** 圖表要舊到新，列表要新到舊 */
const chronological = computed(() => [...records.value].reverse())

const avgSleep = computed(() => {
  const scores = records.value.map((r) => r.sleepScore).filter((s): s is number => s !== null)
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

const avgCare = computed(() => {
  if (!records.value.length) return null
  const total = records.value.reduce((sum, r) => sum + careRate(r), 0)
  return Math.round(total / records.value.length)
})

const avgMood = computed(() => {
  const scores = records.value.map((r) => (r.mood ? MOOD_SCORE[r.mood] : null)).filter((s): s is number => s != null)
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

const insights = computed(() => buildInsights(records.value))
const needMore = computed(() => Math.max(0, INSIGHT_MIN_RECORDS - records.value.length))

/**
 * 每日紀錄。過去只列出「有寫備註的日子」，導致排便、過敏、上下班時間、
 * 睡眠時間、以及自我照顧做了哪幾項全部只進不出 —— 填完當天之後就再也
 * 看不到。這裡改成列出所有日子的完整內容。
 */
function timeRange(from: string | null, to: string | null, hours: number | null) {
  if (!from || !to) return null
  return `${from} → ${to}` + (hours ? `（${hours} 小時）` : '')
}

function dailyLines(r: DailyRecord) {
  const lines: { label: string; value: string }[] = []
  const sleep = [
    r.sleepScore === null ? null : `${r.sleepScore}%`,
    timeRange(r.bedTime, r.wakeTime, r.sleepHours),
  ].filter(Boolean).join('・')
  if (sleep) lines.push({ label: '睡眠', value: sleep })

  if (r.bowelMovement !== null) {
    lines.push({ label: '💩', value: r.bowelMovement ? (r.bowelTime ?? '有') : '還沒' })
  }
  if (r.allergy.length) lines.push({ label: '過敏', value: r.allergy.join('、') })

  const work = timeRange(r.leaveHomeTime, r.leaveOfficeTime, null)
  if (work) lines.push({ label: '上班', value: work })
  else if (r.leaveHomeTime) lines.push({ label: '出門', value: r.leaveHomeTime })

  if (r.liverCare.length) lines.push({ label: '自我照顧', value: r.liverCare.join('、') })
  return lines
}

function dailyNotes(r: DailyRecord) {
  return [
    { label: '夢', value: r.sleepNote },
    { label: '心情', value: r.moodNote },
    { label: '💩', value: r.bowelNote },
    { label: '過敏', value: r.allergyNote },
    { label: '只給自己的', value: r.privateNote },
  ].filter((n): n is { label: string; value: string } => Boolean(n.value))
}

/**
 * 分享上週回顧到群組。
 *
 * 卡片只含本人的資料：records 來自 /api/records/me，那個端點以 ID Token
 * 驗證身分、只回傳本人紀錄。發送對象由使用者決定——按鈕只在從群組開啟時
 * 出現，卡片發到他開啟 LIFF 的那個聊天室，沒有任何自動推播。
 */
const weekRange = computed(() => (today.value ? lastWeekRange(today.value) : null))
const weekRecords = computed(() => {
  const range = weekRange.value
  if (!range) return []
  return records.value.filter((r) => r.recordDate >= range.from && r.recordDate <= range.to)
})
const sharing = ref(false)
const previewing = ref(false)
const shareState = ref<'idle' | 'done'>('idle')
const shareError = ref<string | null>(null)

/**
 * 只有在群組／多人聊天室才直接發送。
 *
 * 不能沿用 canShareToChat —— 那個為了「每日卡片在一對一也能留一份」把
 * utou 也算進去了。週回顧的目的是給別人看，發到只有自己和機器人的
 * 一對一聊天室等於沒分享，所以那裡要走選擇器。
 */
const canDirectShare = computed(() => canShareToChat.value && !isOneToOne.value)
const canShareWeek = computed(() => canDirectShare.value || canPickTarget.value)

const weekSummary = computed(() => {
  const rs = weekRecords.value
  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)
  return {
    sleep: avg(rs.map((r) => r.sleepScore).filter((n): n is number => n !== null)),
    hours: avg(rs.map((r) => r.sleepHours).filter((n): n is number => n !== null)),
    care: rs.length ? avg(rs.map(careRate)) : null,
  }
})

async function confirmShare() {
  const range = weekRange.value
  if (!range || sharing.value) return
  sharing.value = true
  shareError.value = null

  const card = buildWeeklyShareCard({
    displayName: displayName.value,
    from: range.from,
    to: range.to,
    records: weekRecords.value,
  })

  try {
    if (canDirectShare.value) {
      // 從群組開啟的，直接發到那裡 —— 對象很明確，再問一次反而多餘
      await sendToChat(card)
      shareState.value = 'done'
      previewing.value = false
    } else {
      const shared = await shareToPicked(card)
      if (shared) {
        shareState.value = 'done'
        previewing.value = false
      }
      // 使用者在選擇面板按取消時什麼都不做，維持在預覽狀態
    }
  } catch (err: any) {
    shareError.value = `${err?.code ? err.code + '：' : ''}${err?.message ?? '分享失敗，請再試一次'}`
  } finally {
    sharing.value = false
  }
}

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
        <!-- 分享上週回顧 -->
        <section v-if="weekRange" class="rounded-2xl border border-brand-border bg-white p-4">
          <p class="text-body font-bold text-brand-brown">上週回顧</p>
          <p class="mt-0.5 text-caption text-brand-brown-light">
            {{ weekRange.from.slice(5).replace('-', '/') }} – {{ weekRange.to.slice(5).replace('-', '/') }}・記錄 {{ weekRecords.length }} 天
          </p>

          <!-- 預覽：讓使用者看到「實際會發出去的那張卡片」本身。
               用文字清單說明分享範圍會過期（加了新欄位就變成謊言），預覽不會。 -->
          <div v-if="previewing" class="mt-3 rounded-xl border-2 border-brand-gold bg-brand-cream p-4">
            <div class="flex items-center gap-2">
              <span class="h-4 w-1 rounded-full bg-brand-orange" />
              <span class="text-caption font-bold text-brand-orange">上週回顧</span>
            </div>
            <p class="mt-2 text-h3 font-bold text-brand-brown">{{ displayName ?? '你' }}</p>
            <p class="text-caption text-brand-brown-light">
              {{ weekRange.from.slice(5).replace('-', '/') }} – {{ weekRange.to.slice(5).replace('-', '/') }}
            </p>
            <div class="mt-3 space-y-2 border-t border-brand-border pt-3">
              <div class="flex justify-between text-body">
                <span class="text-brand-brown-light">記錄天數</span>
                <span class="font-bold text-brand-brown">{{ weekRecords.length }} / 7 天</span>
              </div>
              <div v-if="weekSummary.sleep !== null" class="flex justify-between text-body">
                <span class="text-brand-brown-light">平均睡眠</span>
                <span class="font-bold text-brand-brown">{{ Math.round(weekSummary.sleep) }}%</span>
              </div>
              <div v-if="weekSummary.hours !== null" class="flex justify-between text-body">
                <span class="text-brand-brown-light">平均睡了</span>
                <span class="font-bold text-brand-brown">{{ weekSummary.hours.toFixed(1) }} 小時</span>
              </div>
              <div v-if="weekSummary.care !== null" class="flex justify-between text-body">
                <span class="text-brand-brown-light">自我照顧</span>
                <span class="font-bold text-brand-brown">{{ Math.round(weekSummary.care) }}%</span>
              </div>
            </div>
          </div>

          <p v-if="previewing" class="mt-2 text-caption text-brand-brown-light">
            發出去的就是這張，備註和洞察不會跟著出去
          </p>

          <div v-if="previewing" class="mt-3 flex gap-2">
            <button
              type="button"
              class="h-12 flex-1 rounded-xl border-2 border-brand-border bg-white text-body font-medium text-brand-brown-light"
              @click="previewing = false"
            >
              取消
            </button>
            <button
              type="button"
              :disabled="sharing"
              class="h-12 flex-[2] rounded-xl bg-brand-orange text-body font-bold text-white transition active:bg-brand-orange-dark disabled:opacity-50"
              @click="confirmShare"
            >
              {{ sharing ? '分享中…' : canDirectShare ? '確認分享' : '選擇分享對象' }}
            </button>
          </div>

          <button
            v-else-if="canShareWeek"
            type="button"
            :disabled="!weekRecords.length"
            class="mt-3 h-12 w-full rounded-xl bg-brand-orange text-body font-bold text-white transition active:bg-brand-orange-dark disabled:opacity-50"
            @click="previewing = true; shareState = 'idle'; shareError = null"
          >
            {{ shareState === 'done' ? '已分享，再分享一次' : canDirectShare ? '分享到這個群組' : '分享' }}
          </button>

          <p v-else class="mt-3 text-caption text-brand-brown-light">
            想分享到群組的話，從群組裡開啟這一頁
          </p>

          <p v-if="!weekRecords.length" class="mt-2 text-caption text-brand-brown-light">上週沒有紀錄</p>
          <p v-if="shareError" class="mt-2 break-all text-caption text-red-600">{{ shareError }}</p>
        </section>

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
            v-for="t in [{ k: 'trend', label: '趨勢' }, { k: 'insight', label: '洞察' }, { k: 'daily', label: '每日' }, { k: 'expense', label: '記帳' }]"
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
            <div class="mb-4 flex items-baseline justify-between">
              <h2 class="text-h3 font-bold text-brand-brown">睡眠品質</h2>
              <span class="text-body text-brand-brown-light">平均 {{ avgSleep ?? '－' }}%</span>
            </div>
            <TrendChart :points="chronological.map((r) => ({ date: r.recordDate, value: r.sleepScore }))" />
          </section>

          <section class="rounded-2xl border border-brand-border bg-white p-4">
            <div class="mb-4 flex items-baseline justify-between">
              <h2 class="text-h3 font-bold text-brand-brown">自我照顧</h2>
              <span class="text-body text-brand-brown-light">平均 {{ avgCare ?? '－' }}%</span>
            </div>
            <TrendChart
              :points="chronological.map((r) => ({
                date: r.recordDate,
                value: careRate(r),
              }))"
            />
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

        <!-- 每日 -->
        <template v-else-if="tab === 'daily'">
          <div v-if="!records.length" class="rounded-2xl border border-brand-border bg-white p-6 text-center text-body text-brand-brown-light">
            還沒有任何紀錄
          </div>
          <section
            v-for="r in records"
            :key="r.recordDate"
            class="rounded-2xl border border-brand-border bg-white p-4"
          >
            <div class="flex items-baseline gap-2">
              <h3 class="text-body font-bold text-brand-brown">{{ r.recordDate.slice(5).replace('-', '/') }}</h3>
              <span v-if="r.mood" class="text-body-lg">{{ r.mood }}</span>
            </div>

            <dl class="mt-3 space-y-1.5">
              <div v-for="line in dailyLines(r)" :key="line.label" class="flex gap-3 text-body">
                <dt class="w-20 shrink-0 text-brand-brown-light">{{ line.label }}</dt>
                <dd class="flex-1 text-brand-brown">{{ line.value }}</dd>
              </div>
            </dl>

            <div v-if="dailyNotes(r).length" class="mt-3 space-y-2 border-t border-brand-border pt-3">
              <div v-for="note in dailyNotes(r)" :key="note.label">
                <dt class="text-caption text-brand-orange">{{ note.label }}</dt>
                <dd class="text-body text-brand-brown">{{ note.value }}</dd>
              </div>
            </div>
          </section>
        </template>

        <!-- 記帳。只有自己的資料，這一頁不做任何跨使用者比較 -->
        <template v-else>
          <div v-if="expenseLoading" class="h-28 animate-pulse rounded-2xl bg-brand-panel/60" />

          <div v-else-if="expenseError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
            {{ expenseError }}
          </div>

          <template v-else-if="expenseMonth">
            <section class="rounded-2xl border border-brand-border bg-white p-4">
              <p class="text-caption text-brand-brown-light">{{ expenseMonth.month.replace('-', ' / ') }} 合計</p>
              <p class="mt-1 text-h2 font-bold text-brand-orange">{{ formatAmount(expenseMonth.total) }}</p>
              <p class="mt-1 text-caption text-brand-brown-light">
                記了 {{ expenseMonth.days.length }} 天・只有你看得到
              </p>
            </section>

            <div v-if="!expenseMonth.days.length" class="rounded-2xl border border-brand-border bg-white p-6 text-center text-body text-brand-brown-light">
              這個月還沒有記帳
            </div>

            <section
              v-for="day in expenseMonth.days"
              :key="day.date"
              class="rounded-2xl border border-brand-border bg-white p-4"
            >
              <div class="flex items-baseline justify-between">
                <h3 class="text-body font-bold text-brand-brown">{{ day.date.slice(5).replace('-', '/') }}</h3>
                <span class="text-body font-bold text-brand-brown">{{ formatAmount(day.total) }}</span>
              </div>
              <dl class="mt-3 space-y-1.5">
                <div v-for="(item, i) in day.items" :key="i" class="flex items-baseline gap-3 text-body">
                  <dt class="flex-1 text-brand-brown-light">
                    {{ item.item }}
                    <span v-if="item.shared" class="ml-1 text-caption text-brand-orange">已分享</span>
                  </dt>
                  <dd class="shrink-0 text-brand-brown">{{ formatAmount(item.amount) }}</dd>
                </div>
              </dl>
            </section>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
