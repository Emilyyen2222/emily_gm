import { MOOD_SCORE, STEPS_GOAL, type DailyRecord } from '../types/record'

/**
 * 關聯洞察：把紀錄依某個條件分成兩群，比較兩群的平均值。
 *
 * 刻意保守：這只是描述性的對照，不是統計推論。資料量小的時候
 * 任何差異都可能只是巧合，所以低於門檻就直接不顯示，
 * 而不是show 一個看起來很有道理但其實沒意義的數字。
 */

/** 每一群至少要有這麼多天，才願意拿出來比較 */
const MIN_GROUP_SIZE = 3
/** 差距小於這個幅度就當作沒有差別，不值得講 */
const MIN_DIFFERENCE = 5

export interface Insight {
  title: string
  withLabel: string
  withoutLabel: string
  withValue: number
  withoutValue: number
  withDays: number
  withoutDays: number
  /** with 比 without 高多少（可為負） */
  delta: number
  unit: string
}

type Metric = 'sleepScore' | 'mood'

function metricValue(record: DailyRecord, metric: Metric): number | null {
  if (metric === 'sleepScore') return record.sleepScore
  return record.mood ? (MOOD_SCORE[record.mood] ?? null) : null
}

function average(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

function compare(
  records: DailyRecord[],
  metric: Metric,
  predicate: (r: DailyRecord) => boolean,
  labels: { title: string; with: string; without: string },
): Insight | null {
  const withValues: number[] = []
  const withoutValues: number[] = []

  for (const record of records) {
    const value = metricValue(record, metric)
    if (value === null) continue
    ;(predicate(record) ? withValues : withoutValues).push(value)
  }

  if (withValues.length < MIN_GROUP_SIZE || withoutValues.length < MIN_GROUP_SIZE) return null

  const withValue = average(withValues)
  const withoutValue = average(withoutValues)
  const delta = withValue - withoutValue
  if (Math.abs(delta) < MIN_DIFFERENCE) return null

  return {
    title: labels.title,
    withLabel: labels.with,
    withoutLabel: labels.without,
    withValue,
    withoutValue,
    withDays: withValues.length,
    withoutDays: withoutValues.length,
    delta,
    unit: '%',
  }
}

export function buildInsights(records: DailyRecord[]): Insight[] {
  const insights: Insight[] = []

  // 每個自我照顧習慣各比一次，看它跟睡眠品質的關係。
  // 項目取自這個人實際記錄過的內容，而不是全域清單 ——
  // 每個人選的項目不同，拿別人的項目來比只會得到一堆空結果。
  const habits = [...new Set(records.flatMap((r) => r.liverCare))]
  for (const habit of habits) {
    const result = compare(records, 'sleepScore', (r) => r.liverCare.includes(habit), {
      title: `${habit}的日子，睡眠品質`,
      with: `有${habit}`,
      without: '沒有',
    })
    if (result) insights.push(result)
  }

  // 睡得久是否真的睡得好 —— 用中位數切開，避免被極端值影響
  const hours = records.map((r) => r.sleepHours).filter((h): h is number => h !== null).sort((a, b) => a - b)
  if (hours.length >= MIN_GROUP_SIZE * 2) {
    const median = hours[Math.floor(hours.length / 2)]!
    const result = compare(records, 'sleepScore', (r) => (r.sleepHours ?? 0) >= median, {
      title: `睡滿 ${median} 小時以上，睡眠品質`,
      with: '睡比較久',
      without: '睡比較少',
    })
    if (result) insights.push(result)
  }

  // 走路達標與睡眠、心情的關係
  const stepsSleep = compare(records, 'sleepScore', (r) => (r.steps ?? 0) >= STEPS_GOAL, {
    title: `走超過 ${STEPS_GOAL.toLocaleString()} 步的日子，睡眠品質`,
    with: '走得多',
    without: '走得少',
  })
  if (stepsSleep) insights.push(stepsSleep)

  const stepsMood = compare(records, 'mood', (r) => (r.steps ?? 0) >= STEPS_GOAL, {
    title: `走超過 ${STEPS_GOAL.toLocaleString()} 步的日子，心情`,
    with: '走得多',
    without: '走得少',
  })
  if (stepsMood) insights.push(stepsMood)

  // 過敏與心情
  const allergyMood = compare(records, 'mood', (r) => r.allergy.length > 0 && !r.allergy.includes('無'), {
    title: '有過敏症狀的日子，心情',
    with: '有過敏',
    without: '沒過敏',
  })
  if (allergyMood) insights.push(allergyMood)

  // 差距大的排前面
  return insights.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

/** 還需要幾天資料才值得看洞察 */
export const INSIGHT_MIN_RECORDS = MIN_GROUP_SIZE * 2
