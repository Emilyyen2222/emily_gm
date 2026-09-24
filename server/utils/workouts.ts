/** 可以記錄的最早日期：一年內。再早的補記多半是打錯日期 */
const WORKOUT_BACKFILL_DAYS = 365

/**
 * 驗證訓練日期：YYYY-MM-DD、不能是未來、不能早於一年前。不合格回 null。
 * 「今天」一律用後端的台北日期，不信任前端的時鐘。
 */
export function validWorkoutDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return null
  if (value > today || value < addDays(today, -WORKOUT_BACKFILL_DAYS)) return null
  return value
}
