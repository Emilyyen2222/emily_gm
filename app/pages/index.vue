<script setup lang="ts">
import {
  ALLERGY_NONE,
  ALLERGY_OPTIONS,
  MOOD_OPTIONS,
  computeSleepHours,
  countFilled,
  emptyRecordInput,
  EXPENSE_LABEL_MAX,
  type RecordsResponse,
  type SubmitRecordResponse,
} from '#shared/types/record'
import { buildDailyFlexMessage } from '#shared/utils/flexMessage'
import { buildExpenseFlexMessage, expenseCardTitle } from '#shared/utils/expenseCard'

const { ready, initError, displayName, canShareToChat, isOneToOne, inClient, contextType, chatId, init, getIdToken, sendToChat, close } = useLiff()

/** 不能分享時要說明原因 —— 勾選框默默消失，使用者無從得知為什麼 */
const noShareReason = computed(() => {
  if (canShareToChat.value) return null
  if (!inClient.value) return '在電腦或一般瀏覽器開啟時無法發送卡片，資料還是會存起來。想分享的話用手機的 LINE 開。'
  return '這次不是從聊天室開啟的，只會儲存資料。想分享的話，從群組或聊天室裡的連結進來。'
})

// useState 而非 ref：使用者點「查看我的紀錄」再返回時，元件會重新掛載。
// 用 ref 的話未儲存的修改會被重新讀取的伺服器資料蓋掉——而那個連結就在
// 表單裡面，等於隨手一點就把剛填的東西弄丟。
const form = useState('record-form', () => emptyRecordInput())
/** 已經從伺服器載入過哪一天的資料。同一天再回到這頁就不重新覆蓋 */
const loadedDate = useState<string | null>('record-loaded-date', () => null)
const loading = ref(true)
const pending = ref<'save' | 'share' | 'expense' | null>(null)
const submitError = ref<string | null>(null)
const justShared = ref(false)
const prefillFailed = ref(false)
const isUpdate = ref(false)
const savedAt = ref<string | null>(null)
/** 花費卡片剛發出去的提示。與主要按鈕分開，兩者送出的是不同的東西 */
const expenseShared = ref(false)
const expenseError = ref<string | null>(null)
const sharedExpenseCount = computed(() => form.value.expenses.filter((e) => e.shared && e.item.trim()).length)

/**
 * 記帳卡片的標題。整句由每個人自己填 —— 這個 app 不只一個人在用，
 * 寫死在程式裡的話，別人記帳時會在卡片上看到不屬於他的字。
 */
const expenseLabel = useState<string | null>('expense-label', () => null)
const labelEditing = ref(false)
const labelDraft = ref('')
const labelSaving = ref(false)

function startEditLabel() {
  labelDraft.value = expenseLabel.value ?? ''
  labelEditing.value = true
}

async function saveLabel() {
  if (labelSaving.value) return
  labelSaving.value = true
  try {
    const idToken = await getIdToken()
    const { label } = await $fetch<{ label: string | null }>('/api/expenses/label', {
      method: 'PUT',
      body: { idToken, label: labelDraft.value },
    })
    expenseLabel.value = label
    labelEditing.value = false
  } catch {
    // 存不起來就維持在編輯狀態，不要假裝成功
  } finally {
    labelSaving.value = false
  }
}

/** 這個人自己選的自我照顧項目。還沒設定過的人會先被帶去設定頁 */
const habits = useState<string[]>('record-habits', () => [])
const liverPercent = computed(() => {
  if (!habits.value.length) return 0
  // 只算目前清單裡的項目。防呆用的第二道保險——真正的修正在載入時就過濾掉
  // 舊項目，但這裡夾住上限，任何殘留都不會再變成 133% 那種數字
  const done = form.value.liverCare.filter((h) => habits.value.includes(h)).length
  return Math.min(100, Math.round((done / habits.value.length) * 100))
})
const progress = computed(() => countFilled(form.value))

/** 睡眠時數由入睡與起床時間即時算出，讓使用者填完馬上看到 */
const sleepHours = computed(() => computeSleepHours(form.value.bedTime, form.value.wakeTime))

/** 出門到離開公司之間的時數。跨夜（例如 09:00 出門、隔日 01:00 離開）也算得出來 */
const workHours = computed(() => {
  const { leaveHomeTime: from, leaveOfficeTime: to } = form.value
  if (!from || !to) return null
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  let diff = toMin(to) - toMin(from)
  if (diff < 0) diff += 24 * 60
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`
})

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }

  form.value.sourceChatId = chatId.value

  try {
    const idToken = await getIdToken()

    // 先確認項目設定。沒設定過的人直接帶去設定頁 ——
    // 讓人先看到一份不屬於自己的清單再去改，比一開始就選還難懂。
    const habitData = await $fetch<{ habits: string[] | null }>('/api/habits', {
      headers: { 'x-liff-id-token': idToken },
    })
    if (!habitData.habits) {
      await navigateTo('/habits?first=1')
      return
    }
    habits.value = habitData.habits

    // 記帳稱呼。讀不到就當作沒設定，卡片會用中性標題，不影響其他功能
    try {
      const labelData = await $fetch<{ label: string | null }>('/api/expenses/label', {
        headers: { 'x-liff-id-token': idToken },
      })
      expenseLabel.value = labelData.label
    } catch {
      expenseLabel.value = null
    }

    const data = await $fetch<RecordsResponse>('/api/records/me', {
      query: { days: 1 },
      headers: { 'x-liff-id-token': idToken },
    })
    // 同一天已經載入過就保留畫面上的內容，不要用伺服器資料蓋掉未儲存的修改
    if (loadedDate.value === data.today) {
      loading.value = false
      return
    }
    loadedDate.value = data.today

    const today = data.records.find((r) => r.recordDate === data.today)
    if (today) {
      isUpdate.value = true
      const { shared, sourceChatId, ...rest } = today
      Object.assign(form.value, rest)
      form.value.allergy = [...today.allergy]
      // 複製一份，避免表單直接改到伺服器回傳物件裡的同一個陣列
      form.value.expenses = today.expenses.map((e) => ({ ...e }))
      // 過濾掉已經不在清單裡的項目。使用者換過項目之後，舊紀錄裡的項目
      // 在畫面上不會顯示、也就無法取消，卻還被算進達成數 ——
      // 那正是「兩項變三項卻顯示 133%」的來源。
      form.value.liverCare = today.liverCare.filter((h) => habits.value.includes(h))
    }
  } catch {
    // 讀不到舊資料時要明講。靜默失敗的話，使用者以為自己在補填，
    // 送出後卻把早上填過的內容整個覆蓋成空的。
    prefillFailed.value = true
  } finally {
    loading.value = false
  }
})

/**
 * 分享花費。
 *
 * 與「儲存並分享」是兩條不同的路：這張卡片只含標成分享的花費、沒有任何
 * 健康資料，而每日狀態卡片則完全不含金額。兩者的收件對象本來就不同，
 * 混在一起就會把金額送進朋友群組。
 *
 * 一樣先存再送 —— 沒存就發卡片的話，卡片上的內容在紀錄裡查不到。
 */
async function shareExpenses() {
  if (pending.value || !sharedExpenseCount.value) return
  pending.value = 'expense'
  expenseError.value = null
  expenseShared.value = false

  try {
    const idToken = await getIdToken()
    const { record } = await $fetch<SubmitRecordResponse>('/api/records', {
      method: 'POST',
      body: { ...form.value, shared: false, idToken },
    })
    isUpdate.value = true
    savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })

    const card = buildExpenseFlexMessage({
      displayName: record.displayName ?? displayName.value,
      date: record.recordDate,
      expenses: record.expenses,
      label: expenseLabel.value,
    })
    if (!card) return
    await sendToChat(card)
    expenseShared.value = true
  } catch (err: any) {
    expenseError.value = err?.data?.statusMessage ?? err?.message ?? '花費沒發出去，請稍後再試'
  } finally {
    pending.value = null
  }
}

async function submit(share: boolean) {
  if (pending.value) return
  pending.value = share ? 'share' : 'save'
  submitError.value = null

  try {
    const idToken = await getIdToken()
    const { record } = await $fetch<SubmitRecordResponse>('/api/records', {
      method: 'POST',
      body: { ...form.value, shared: share, idToken },
    })

    if (share && canShareToChat.value) {
      try {
        await sendToChat(buildDailyFlexMessage({ ...record, displayName: record.displayName ?? displayName.value }))
        // 先顯示成功狀態再關閉。原本是送出後立刻關窗，畫面一閃就結束，
        // 使用者會覺得「按了沒反應」——尤其資料沒變動時更沒有任何變化可看。
        justShared.value = true
        setTimeout(close, 900)
        return
      } catch (err: any) {
        // 資料已經寫進去了，只有卡片沒發出去。分開講清楚，
        // 否則使用者會以為整筆都失敗而重填一次。
        isUpdate.value = true
        savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
        submitError.value = `資料已儲存，但卡片沒發出去：${err?.message ?? err?.code ?? '未知錯誤'}`
        return
      }
    }

    // 沒有要分享時不關閉視窗，讓使用者知道存好了、還能繼續補其他欄位
    isUpdate.value = true
    savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  } catch (err: any) {
    submitError.value = err?.data?.statusMessage ?? err?.message ?? '送出失敗，請稍後再試'
  } finally {
    pending.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream pb-48">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-5">
        <div class="flex items-center gap-2">
          <span class="h-5 w-1 rounded-full bg-brand-orange" />
          <span class="text-caption font-bold uppercase tracking-wide text-brand-orange">Good Morning</span>
        </div>
        <h1 class="mt-2 text-h1 font-bold text-brand-brown">今日狀態</h1>
        <p class="mt-1 text-body text-brand-brown-light">
          <span v-if="displayName">{{ displayName }}，</span>
          <span v-if="isUpdate">今天已經記過了，可以隨時回來補</span>
          <span v-else>想到什麼填什麼，不用一次填完</span>
        </p>
      </header>

      <div v-if="initError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
        {{ initError }}
      </div>

      <div v-else-if="loading" class="space-y-4">
        <div v-for="i in 4" :key="i" class="h-28 animate-pulse rounded-2xl bg-brand-panel/60" />
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit(false)">
        <p
          v-if="prefillFailed"
          class="rounded-2xl border-2 border-brand-gold bg-brand-hover p-3 text-body text-brand-brown"
        >
          讀不到今天已填的內容。如果你稍早填過，建議重新整理再填，避免蓋掉原本的紀錄。
        </p>

        <!-- 完成度：鼓勵回來補完，不是強迫一次填滿 -->
        <div class="rounded-2xl border border-brand-border bg-white px-4 py-3">
          <div class="flex items-center justify-between text-caption text-brand-brown-light">
            <span>今日完成度</span>
            <span class="font-bold text-brand-brown">{{ progress.filled }} / {{ progress.total }}</span>
          </div>
          <div class="mt-2 flex gap-1">
            <div
              v-for="i in progress.total"
              :key="i"
              class="h-1.5 flex-1 rounded-full transition"
              :class="i <= progress.filled ? 'bg-brand-orange' : 'bg-brand-panel'"
            />
          </div>
        </div>

        <FormSection title="睡眠" hint="滿意度、時數，想補充的都可以寫">
          <PercentSlider v-model="form.sleepScore" :labels="['很差', '普通', '很好']" />
          <div class="mt-4 space-y-3">
            <TimeField v-model="form.bedTime" label="幾點睡" />
            <TimeField v-model="form.wakeTime" label="幾點醒" />
          </div>
          <p v-if="sleepHours !== null" class="mt-2 text-body text-brand-brown-light">
            睡了 <span class="font-bold text-brand-brown">{{ sleepHours }}</span> 小時
          </p>
          <div class="mt-3">
            <NoteField v-model="form.sleepNote" label="記個夢" placeholder="做了什麼夢？想記下的都可以寫（選填）" />
          </div>
        </FormSection>

        <FormSection title="💩💩💩💩💩">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="opt in [{ label: '有', value: true }, { label: '沒有', value: false }]"
              :key="String(opt.value)"
              type="button"
              class="h-12 rounded-xl border-2 text-body font-medium transition"
              :class="form.bowelMovement === opt.value
                ? 'border-brand-orange bg-brand-orange text-white'
                : 'border-brand-border bg-white text-brand-brown-light'"
              @click="form.bowelMovement = opt.value; if (!opt.value) form.bowelTime = null"
            >
              {{ opt.label }}
            </button>
          </div>

          <div v-if="form.bowelMovement === true" class="mt-3">
            <TimeField v-model="form.bowelTime" label="時間" />
          </div>

        </FormSection>

        <FormSection title="上班時間" :hint="workHours ? `在外 ${workHours}` : undefined">
          <div class="space-y-3">
            <TimeField v-model="form.leaveHomeTime" label="出門" />
            <TimeField v-model="form.leaveOfficeTime" label="離開公司" />
          </div>
        </FormSection>

        <FormSection title="今天有過敏嗎">
          <ChipMultiSelect v-model="form.allergy" :options="ALLERGY_OPTIONS" :exclusive="ALLERGY_NONE" />
        </FormSection>

        <FormSection title="起床心情">
          <MoodPicker v-model="form.mood" :options="MOOD_OPTIONS" />
          <div class="mt-3">
            <NoteField v-model="form.moodNote" placeholder="今天發生了什麼？（選填）" />
          </div>
        </FormSection>

        <FormSection title="自我照顧" :badge="`${liverPercent}%`">
          <ChipMultiSelect v-model="form.liverCare" :options="habits" />
          <NuxtLink to="/habits" class="mt-3 block text-caption text-brand-orange underline">
            這些是你選的項目，可以修改
          </NuxtLink>
        </FormSection>

        <!-- 這道分隔線以下都不會進今日狀態卡片。區塊底色也跟著換成米色，
             不必逐條讀小字說明才知道自己填的東西會跑去哪裡 -->
        <div class="flex items-center gap-3 pt-2">
          <span class="h-px flex-1 bg-brand-border" />
          <span class="text-caption text-brand-brown-light">以下不會出現在今日狀態卡片</span>
          <span class="h-px flex-1 bg-brand-border" />
        </div>

        <FormSection variant="aside" title="體溫" hint="想量再量，兩個都可以空著">
          <div class="space-y-3">
            <TempField
              v-model="form.morningTemp"
              label="早晨基礎體溫"
              hint="剛醒、還沒下床時量最準，一般落在 36.1–36.8°C"
            />
            <div class="border-t border-brand-panel" />
            <TempField
              v-model="form.nightTemp"
              label="睡前體溫"
              hint="昨晚睡前量的，一般落在 36.5–37.3°C"
              placeholder="36.8"
            />
          </div>
        </FormSection>

        <FormSection variant="aside" title="只給自己的" hint="這一格不會出現在卡片上，也不會有人看到">
          <NoteField v-model="form.privateNote" label="寫點什麼" placeholder="想寫給自己的話（選填）" />
        </FormSection>

        <FormSection variant="aside" title="記帳" hint="記完打勾，用下面的按鈕傳出去">
          <!-- 稱呼是每人一份的設定，不是每天填的內容，所以不進 form -->
          <div class="mb-3 flex flex-wrap items-center gap-2 text-caption text-brand-brown-light">
            <template v-if="!labelEditing">
              <span>卡片標題：<span class="font-bold text-brand-brown">{{ expenseCardTitle(expenseLabel) }}</span></span>
              <button type="button" class="font-medium text-brand-orange underline" @click="startEditLabel">
                {{ expenseLabel ? '改標題' : '設定標題' }}
              </button>
            </template>
            <template v-else>
              <input
                v-model="labelDraft"
                type="text"
                placeholder="想寫什麼都可以"
                :maxlength="EXPENSE_LABEL_MAX"
                class="w-32 rounded-xl border-2 border-brand-border bg-white px-3 py-2 text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
                @keyup.enter="saveLabel"
              />
              <button
                type="button"
                :disabled="labelSaving"
                class="font-medium text-brand-orange underline disabled:opacity-50"
                @click="saveLabel"
              >{{ labelSaving ? '存檔中…' : '存起來' }}</button>
              <button type="button" class="underline" @click="labelEditing = false">取消</button>
              <span class="w-full">會直接印在卡片最上面。留空就只顯示「花費」</span>
            </template>
          </div>

          <ExpenseList v-model="form.expenses" />

          <!-- 花費走自己的按鈕：這張卡片只有金額，不含任何健康資料，
               而下面那顆「分享」發出的每日狀態卡片則完全不含金額。
               按鈕一律顯示、沒勾時變成灰的 —— 原本沒勾就整個藏起來，
               等於使用者永遠看不到記帳要怎麼傳出去。 -->
          <div v-if="form.expenses.length" class="mt-4 border-t border-brand-border pt-4">
            <button
              v-if="canShareToChat"
              type="button"
              :disabled="pending !== null || !sharedExpenseCount"
              class="h-12 w-full rounded-xl border-2 text-body font-bold transition active:scale-[0.99]"
              :class="sharedExpenseCount
                ? 'border-brand-gold bg-brand-gold text-brand-brown disabled:opacity-50'
                : 'border-brand-border bg-white text-brand-brown-light'"
              @click="shareExpenses"
            >
              <template v-if="pending === 'expense'">傳送中…</template>
              <template v-else-if="sharedExpenseCount">
                分享 {{ sharedExpenseCount }} 筆花費{{ isOneToOne ? '' : '到群組' }}
              </template>
              <template v-else>
                先打勾要分享的花費
              </template>
            </button>
            <p v-else class="text-caption text-brand-brown-light">
              這次不是從聊天室開啟的，沒辦法傳花費。想傳給誰，就從跟他的對話裡點連結進來。
            </p>
            <p v-if="expenseShared" class="mt-2 text-center text-caption text-brand-green">
              傳出去了，只有這個聊天室看得到
            </p>
            <p v-else-if="expenseError" class="mt-2 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-body text-red-700">
              {{ expenseError }}
            </p>
          </div>
        </FormSection>


        <p v-if="noShareReason" class="rounded-2xl border border-brand-border bg-white p-4 text-caption text-brand-brown-light">
          {{ noShareReason }}
        </p>

        <NuxtLink to="/history" class="block py-2 text-center text-body font-medium text-brand-orange underline">
          查看我的紀錄
        </NuxtLink>

      </form>
    </div>

    <div
      v-if="ready && !loading"
      class="fixed inset-x-0 bottom-0 border-t border-brand-border bg-brand-cream/95 p-4 backdrop-blur"
      style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))"
    >
      <div class="mx-auto w-full max-w-lg">
        <p v-if="savedAt" class="mb-2 text-center text-caption text-brand-green">
          {{ savedAt }} 存好了，晚點還能回來補
        </p>

        <!-- 兩顆按鈕而不是「勾選框 + 一顆會變文字的按鈕」：勾選框唯一的作用
             就是控制按鈕，兩顆各自寫清楚自己做什麼之後，那個隱藏狀態就是
             多餘的，使用者也不必先理解勾選框才能理解按鈕。 -->
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="pending !== null"
            class="h-14 flex-1 rounded-2xl border-2 border-brand-border bg-white text-body font-bold text-brand-brown-light transition active:scale-[0.99] disabled:opacity-50"
            @click="submit(false)"
          >
            {{ pending === 'save' ? '儲存中…' : '只儲存' }}
          </button>
          <button
            v-if="canShareToChat"
            type="button"
            :disabled="pending !== null"
            class="h-14 flex-[2] rounded-2xl bg-brand-orange text-body font-bold text-white transition active:scale-[0.99] active:bg-brand-orange-dark disabled:opacity-50"
            @click="submit(true)"
          >
            {{ pending === 'share' ? '分享中…' : isOneToOne ? '儲存並留下卡片' : '儲存並分享到群組' }}
          </button>
        </div>

        <!-- 錯誤放在固定列裡：先前顯示在表單末尾，長表單下會被推到畫面外，
             分享失敗時看起來就像「按了沒反應」 -->
        <p v-if="submitError" class="mt-2 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-body text-red-700">
          {{ submitError }}
        </p>

        <p v-else-if="canShareToChat" class="mt-2 text-center text-caption text-brand-brown-light">
          除了「只給自己的」和花費，其他都會出現在卡片上
        </p>
        <p v-else-if="noShareReason" class="mt-2 text-center text-caption text-brand-brown-light">
          {{ noShareReason }}
        </p>
      </div>
    </div>
  </div>
</template>
