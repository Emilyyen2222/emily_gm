<script setup lang="ts">
import {
  DEFAULT_EXERCISES,
  EXERCISE_GROUPS,
  EXERCISE_NAME_MAX,
  WORKOUT_MAX_EXERCISES,
  WORKOUT_MAX_ROWS,
  convertWeight,
  type WeightUnit,
  type WorkoutExercise,
  type WorkoutMax,
  type WorkoutResponse,
} from '#shared/types/workout'
import { buildWorkoutFlexMessage } from '#shared/utils/workoutCard'

const { ready, initError, displayName, canShareToChat, isOneToOne, init, getIdToken, sendToChat } = useLiff()

const loading = ref(true)
const loadError = ref<string | null>(null)
const today = ref('')
const date = ref('')
const exercises = ref<WorkoutExercise[]>([])
const shared = ref(false)
const customExercises = ref<string[]>([])
const lastUnits = ref<Record<string, WeightUnit>>({})
const history = ref<WorkoutMax[]>([])

const { bottomBar, paddingStyle } = useBottomBarPadding()

const saving = ref(false)
const savedAt = ref<string | null>(null)
const saveError = ref<string | null>(null)

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }
  await load()
})

async function load(target?: string) {
  loading.value = true
  loadError.value = null
  savedAt.value = null
  saveError.value = null
  try {
    const idToken = await getIdToken()
    const data = await $fetch<WorkoutResponse>('/api/workouts', {
      headers: { 'x-liff-id-token': idToken },
      query: target ? { date: target } : {},
    })
    today.value = data.today
    date.value = data.date
    // 複製一份，避免直接改到回傳物件
    exercises.value = data.exercises.map((e) => ({ ...e, rows: e.rows.map((r) => ({ ...r })) }))
    shared.value = data.shared
    customExercises.value = data.customExercises
    lastUnits.value = data.lastUnits
    history.value = data.history
  } catch (err: any) {
    // 讀不到就要明講：否則使用者以為是空的，存下去會把那天原本的紀錄蓋掉
    loadError.value = err?.data?.statusMessage ?? err?.message ?? '讀取失敗，請重新開啟頁面'
  } finally {
    loading.value = false
  }
}

function onDateChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (value && value !== date.value) load(value)
}

// ── 加動作 ─────────────────────────────────────────

const picking = ref(false)
const draft = ref('')

/** 清單：預設動作分兩組（下肢、上肢），自己新增過的另外一區，都扣掉今天已經加了的 */
const added = computed(() => new Set(exercises.value.map((e) => e.exercise)))
const groupChoices = computed(() =>
  EXERCISE_GROUPS.map((g) => g.filter((e) => !added.value.has(e))).filter((g) => g.length),
)
const customChoices = computed(() => customExercises.value.filter((e) => !added.value.has(e)))

function addExercise(name: string) {
  const exercise = name.trim().slice(0, EXERCISE_NAME_MAX)
  if (!exercise || exercises.value.length >= WORKOUT_MAX_EXERCISES) return
  if (exercises.value.some((e) => e.exercise === exercise)) return
  // 單位預設用這個動作上次用的，沒練過就用 kg
  // 預設一行、組數帶 1，大部分動作填重量和次數就記完了
  exercises.value.push({ exercise, unit: lastUnits.value[exercise] ?? 'kg', rows: [{ weight: null, reps: null, sets: 1 }] })
  if (!DEFAULT_EXERCISES.includes(exercise) && !customExercises.value.includes(exercise)) {
    customExercises.value.push(exercise)
  }
  draft.value = ''
  picking.value = false
}

/** 中途換重量時多記一行。次數與組數先帶上一行的，通常只需要改重量 */
function addRow(ex: WorkoutExercise) {
  if (ex.rows.length >= WORKOUT_MAX_ROWS) return
  const last = ex.rows[ex.rows.length - 1]
  ex.rows.push({ weight: last?.weight ?? null, reps: last?.reps ?? null, sets: last?.sets ?? 1 })
}

function removeRow(ex: WorkoutExercise, i: number) {
  ex.rows.splice(i, 1)
  if (!ex.rows.length) exercises.value = exercises.value.filter((e) => e !== ex)
}

function removeExercise(ex: WorkoutExercise) {
  exercises.value = exercises.value.filter((e) => e !== ex)
}

// ── 儲存與分享 ─────────────────────────────────────

async function save() {
  if (saving.value) return
  saving.value = true
  saveError.value = null
  savedAt.value = null

  try {
    const idToken = await getIdToken()
    const res = await $fetch<{ date: string; exercises: WorkoutExercise[] }>('/api/workouts', {
      method: 'PUT',
      body: { idToken, date: date.value, exercises: exercises.value, shared: shared.value && canShareToChat.value },
    })
    const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })

    if (shared.value && canShareToChat.value) {
      const card = buildWorkoutFlexMessage({ displayName: displayName.value, date: res.date, exercises: res.exercises })
      if (card) {
        try {
          await sendToChat(card)
        } catch (err: any) {
          // 資料已經存了，只有卡片沒發出去。分開講清楚，否則使用者會以為整筆都失敗
          saveError.value = `資料已儲存，但卡片沒發出去：${err?.message ?? '未知錯誤'}`
        }
      }
    }

    // 重新讀一次：拿到後端清洗後的內容，進步曲線也會更新
    await load(res.date)
    if (!saveError.value) savedAt.value = time
  } catch (err: any) {
    saveError.value = err?.data?.statusMessage ?? err?.message ?? '儲存失敗，請稍後再試'
  } finally {
    saving.value = false
  }
}

// ── 進步曲線 ───────────────────────────────────────

/**
 * 每個動作一張圖，畫每次訓練的最大重量。
 * 同一個動作混用 kg 與 lb 時，一律換算成最近一次用的單位，不然曲線會亂跳。
 */
const curves = computed(() => {
  const byExercise = new Map<string, WorkoutMax[]>()
  for (const h of history.value) {
    const list = byExercise.get(h.exercise) ?? []
    list.push(h)
    byExercise.set(h.exercise, list)
  }
  return [...byExercise.entries()].map(([exercise, list]) => {
    const unit = list[list.length - 1]!.unit
    const points = list.map((h) => ({ date: h.date, value: convertWeight(h.maxWeight, h.unit, unit) }))
    const values = points.map((p) => p.value)
    // Y 軸留一點上下空間，並對齊到 5 的倍數，刻度才好讀
    const min = Math.max(0, Math.floor((Math.min(...values) * 0.8) / 5) * 5)
    const max = Math.ceil((Math.max(...values) * 1.1) / 5) * 5 || 5
    return { exercise, unit, points, min, max: max > min ? max : min + 5 }
  })
})
</script>

<template>
  <div class="min-h-screen bg-brand-cream" :style="paddingStyle">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-5 flex items-center justify-between">
        <h1 class="text-h1 font-bold text-brand-brown">訓練紀錄</h1>
        <NuxtLink to="/" class="text-body font-medium text-brand-orange underline">回到記錄</NuxtLink>
      </header>

      <div v-if="initError || loadError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
        {{ initError ?? loadError }}
      </div>

      <div v-else-if="loading" class="space-y-4">
        <div v-for="i in 2" :key="i" class="h-32 animate-pulse rounded-2xl bg-brand-panel/60" />
      </div>

      <div v-else class="space-y-4">
        <label class="flex items-center justify-between rounded-2xl border border-brand-border bg-white p-4">
          <span class="text-body font-bold text-brand-brown">日期</span>
          <input
            type="date"
            :value="date"
            :max="today"
            class="rounded-xl border-2 border-brand-border bg-white px-3 py-2 text-body text-brand-brown focus:border-brand-orange focus:outline-none"
            @change="onDateChange"
          />
        </label>

        <section
          v-for="ex in exercises"
          :key="ex.exercise"
          class="rounded-2xl border border-brand-border bg-white p-4 shadow-sm"
        >
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="text-h3 font-bold text-brand-brown">{{ ex.exercise }}</h2>
            <div class="flex items-center gap-2">
              <div class="flex overflow-hidden rounded-lg border-2 border-brand-border text-caption font-bold">
                <button
                  v-for="u in (['kg', 'lb'] as const)"
                  :key="u"
                  type="button"
                  class="px-3 py-1"
                  :class="ex.unit === u ? 'bg-brand-orange text-white' : 'bg-white text-brand-brown-light'"
                  @click="ex.unit = u"
                >
                  {{ u }}
                </button>
              </div>
              <button
                type="button"
                class="h-9 w-9 rounded-full text-body-lg text-brand-brown-light"
                :aria-label="`刪掉${ex.exercise}`"
                @click="removeExercise(ex)"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div v-for="(row, i) in ex.rows" :key="i" class="flex items-center gap-1.5 text-body text-brand-brown">
              <input
                v-model.number="row.weight"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.5"
                class="h-10 w-16 min-w-0 rounded-xl border-2 border-brand-border bg-white px-1 text-center focus:border-brand-orange focus:outline-none"
              />
              <span class="shrink-0 text-caption text-brand-brown-light">{{ ex.unit }} ×</span>
              <input
                v-model.number="row.reps"
                type="number"
                inputmode="numeric"
                min="1"
                class="h-10 w-12 min-w-0 rounded-xl border-2 border-brand-border bg-white px-1 text-center focus:border-brand-orange focus:outline-none"
              />
              <span class="shrink-0 text-caption text-brand-brown-light">下 ×</span>
              <input
                v-model.number="row.sets"
                type="number"
                inputmode="numeric"
                min="1"
                class="h-10 w-12 min-w-0 rounded-xl border-2 border-brand-border bg-white px-1 text-center focus:border-brand-orange focus:outline-none"
              />
              <span class="shrink-0 text-caption text-brand-brown-light">組</span>
              <button
                type="button"
                class="ml-auto h-9 w-9 shrink-0 rounded-full text-body text-brand-brown-light"
                :aria-label="`刪掉第 ${i + 1} 行`"
                @click="removeRow(ex, i)"
              >
                ✕
              </button>
            </div>
          </div>

          <button
            v-if="ex.rows.length < WORKOUT_MAX_ROWS"
            type="button"
            class="mt-3 h-10 w-full rounded-xl border-2 border-dashed border-brand-border text-body text-brand-brown-light"
            @click="addRow(ex)"
          >
            ＋ 換個重量再記一行
          </button>
        </section>

        <section v-if="picking" class="rounded-2xl border border-brand-border bg-white p-4">
          <p class="mb-2 text-caption text-brand-brown-light">常用動作</p>
          <!-- 兩組之間只用間距分開，不寫分類標題 -->
          <div v-for="(g, i) in groupChoices" :key="i" class="mb-4">
            <div class="flex flex-wrap gap-2">
              <button
                v-for="name in g"
                :key="name"
                type="button"
                class="rounded-full border-2 border-brand-border bg-white px-3 py-1.5 text-body text-brand-brown"
                @click="addExercise(name)"
              >
                {{ name }}
              </button>
            </div>
          </div>
          <p class="mb-2 mt-4 text-caption text-brand-brown-light">自己新增</p>
          <div v-if="customChoices.length" class="mb-3 flex flex-wrap gap-2">
            <button
              v-for="name in customChoices"
              :key="name"
              type="button"
              class="rounded-full border-2 border-brand-border bg-white px-3 py-1.5 text-body text-brand-brown"
              @click="addExercise(name)"
            >
              {{ name }}
            </button>
          </div>
          <div class="flex gap-2">
            <input
              v-model="draft"
              type="text"
              placeholder="動作名稱"
              :maxlength="EXERCISE_NAME_MAX"
              class="h-11 min-w-0 flex-1 rounded-xl border-2 border-brand-border bg-white px-3 text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
              @keyup.enter="addExercise(draft)"
            />
            <button
              type="button"
              class="h-11 shrink-0 rounded-xl bg-brand-orange px-4 text-body font-bold text-white disabled:opacity-50"
              :disabled="!draft.trim()"
              @click="addExercise(draft)"
            >
              加入
            </button>
          </div>
        </section>

        <button
          v-if="!picking && exercises.length < WORKOUT_MAX_EXERCISES"
          type="button"
          class="h-12 w-full rounded-2xl border-2 border-dashed border-brand-orange text-body font-bold text-brand-orange"
          @click="picking = true"
        >
          ＋ 加動作
        </button>

        <section class="rounded-2xl border border-brand-border bg-white p-4">
          <h2 class="mb-4 text-h3 font-bold text-brand-brown">進步曲線</h2>
          <p v-if="!curves.length" class="text-body text-brand-brown-light">還沒有訓練紀錄</p>
          <div v-else class="space-y-6">
            <div v-for="c in curves" :key="c.exercise">
              <div class="mb-2 flex items-baseline justify-between">
                <span class="text-body font-bold text-brand-brown">{{ c.exercise }}</span>
                <span class="text-caption text-brand-brown-light">最大重量（{{ c.unit }}）</span>
              </div>
              <TrendChart :points="c.points" :min="c.min" :max="c.max" :unit="` ${c.unit}`" />
            </div>
          </div>
        </section>
      </div>
    </div>

    <div
      v-if="ready && !loading && !loadError"
      ref="bottomBar"
      class="fixed inset-x-0 bottom-0 border-t border-brand-border bg-brand-cream/95 p-4 backdrop-blur"
      style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))"
    >
      <div class="mx-auto w-full max-w-lg">
        <label v-if="canShareToChat" class="mb-3 flex items-center gap-2 text-body text-brand-brown">
          <input v-model="shared" type="checkbox" class="h-5 w-5 accent-brand-orange" />
          {{ isOneToOne ? '分享' : '分享到群組' }}
        </label>
        <p v-else class="mb-3 text-caption text-brand-brown-light">從群組打開才能分享到那個群組</p>

        <p v-if="savedAt" class="mb-2 text-center text-caption text-brand-green">{{ savedAt }} 存好了</p>
        <p v-if="saveError" class="mb-2 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-body text-red-700">
          {{ saveError }}
        </p>

        <button
          type="button"
          :disabled="saving"
          class="h-14 w-full rounded-2xl bg-brand-orange text-body font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
          @click="save"
        >
          {{ saving ? '儲存中…' : '儲存' }}
        </button>
      </div>
    </div>
  </div>
</template>
