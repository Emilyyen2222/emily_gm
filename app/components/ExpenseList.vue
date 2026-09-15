<script setup lang="ts">
import {
  EXPENSE_AMOUNT_MAX,
  EXPENSE_ITEM_MAX,
  EXPENSE_MAX_ITEMS,
  formatAmount,
  type ExpenseItem,
} from '#shared/types/record'

const model = defineModel<ExpenseItem[]>({ default: () => [] })

const total = computed(() => model.value.reduce((sum, e) => sum + (e.amount || 0), 0))
const sharedCount = computed(() => model.value.filter((e) => e.shared && e.item.trim()).length)

const rows = ref<HTMLInputElement[]>([])

async function add() {
  if (model.value.length >= EXPENSE_MAX_ITEMS) return
  // 新的一筆一律 shared: false。分享要是主動的動作，不能靠預設值幫人決定
  model.value = [...model.value, { item: '', amount: 0, shared: false }]
  await nextTick()
  rows.value[model.value.length - 1]?.focus()
}

function remove(index: number) {
  model.value = model.value.filter((_, i) => i !== index)
}

function setItem(index: number, value: string) {
  model.value = model.value.map((e, i) => (i === index ? { ...e, item: value.slice(0, EXPENSE_ITEM_MAX) } : e))
}

/** 金額輸入：空字串與非數字都當 0，不要讓畫面上出現 NaN */
function setAmount(index: number, value: string) {
  const n = Math.min(EXPENSE_AMOUNT_MAX, Math.max(0, Math.round(Number(value))))
  model.value = model.value.map((e, i) => (i === index ? { ...e, amount: Number.isFinite(n) ? n : 0 } : e))
}

function toggleShare(index: number) {
  model.value = model.value.map((e, i) => (i === index ? { ...e, shared: !e.shared } : e))
}
</script>

<template>
  <div>
    <div v-if="model.length" class="space-y-2">
      <div v-for="(expense, index) in model" :key="index" class="flex items-center gap-2">
        <input
          :ref="(el) => { if (el) rows[index] = el as HTMLInputElement }"
          :value="expense.item"
          type="text"
          placeholder="品項"
          :maxlength="EXPENSE_ITEM_MAX"
          class="min-w-0 flex-1 rounded-xl border-2 border-brand-border bg-white px-3 py-2.5 text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
          @input="setItem(index, ($event.target as HTMLInputElement).value)"
        />
        <input
          :value="expense.amount || ''"
          type="number"
          inputmode="numeric"
          min="0"
          :max="EXPENSE_AMOUNT_MAX"
          placeholder="金額"
          class="w-24 shrink-0 rounded-xl border-2 border-brand-border bg-white px-3 py-2.5 text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
          @input="setAmount(index, ($event.target as HTMLInputElement).value)"
        />
        <!-- 每一筆自己的分享開關。亮橘色＝會被別人看到，關著的樣子要明顯是「關」 -->
        <button
          type="button"
          class="h-11 shrink-0 rounded-xl border-2 px-2.5 text-caption font-medium transition"
          :class="expense.shared
            ? 'border-brand-orange bg-brand-orange text-white'
            : 'border-brand-border bg-white text-brand-brown-light'"
          :aria-pressed="expense.shared"
          @click="toggleShare(index)"
        >
          {{ expense.shared ? '分享' : '不分享' }}
        </button>
        <button
          type="button"
          class="h-11 w-8 shrink-0 text-body-lg text-brand-brown-light"
          aria-label="刪除這一筆"
          @click="remove(index)"
        >
          ×
        </button>
      </div>
    </div>

    <button
      v-if="model.length < EXPENSE_MAX_ITEMS"
      type="button"
      class="flex h-10 items-center gap-1.5 text-body font-medium text-brand-orange"
      :class="model.length ? 'mt-2' : ''"
      @click="add"
    >
      <span class="text-body-lg leading-none">＋</span>
      <span>{{ model.length ? '再記一筆' : '記一筆' }}</span>
    </button>

    <div v-if="model.length" class="mt-3 border-t border-brand-border pt-3">
      <div class="flex items-center justify-between text-body">
        <span class="text-brand-brown-light">今天小計</span>
        <span class="font-bold text-brand-brown">{{ formatAmount(total) }}</span>
      </div>
      <p class="mt-1 text-caption text-brand-brown-light">
        <span v-if="sharedCount">卡片上只會出現你設成「分享」的那 {{ sharedCount }} 筆，小計不會出現</span>
        <span v-else>目前都不分享，這些只有你看得到</span>
      </p>
    </div>
  </div>
</template>
