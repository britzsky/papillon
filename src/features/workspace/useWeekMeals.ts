import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'
import { DEFAULT_SLOT_NAMES } from '../../api/mealSlots'

/** 홈 '이번 주 식단표'(현장 계정, 2026-10-22 사용자 요청: 크게). 서버 /v2/meal-plans/details 기간 조회 */
/** special: 특식 메뉴(메뉴 단위, 2026-10-27) */
export type WeekMealMenu = { menu_id: string; menu_name: string; calories_per_serving?: number | null; special?: boolean }
export type WeekMealSlot = { code: number; name: string }
export type WeekMealDay = { date: string; label: string; weekday: string; today: boolean; slots: Record<number, WeekMealMenu[]> }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** offset 주만큼 옮긴 주의 월요일 */
function mondayOf(offset: number) {
  const [y, m, d] = kstToday().split('-').map(Number)
  const base = new Date(y, m - 1, d)
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + offset * 7)
  return base
}

export function useWeekMeals(accountId: string) {
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<{ key: string; list: Array<Record<string, unknown>> } | null>(null)
  const [error, setError] = useState('')
  const monday = mondayOf(offset)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const from = iso(monday), to = iso(sunday)
  const key = `${accountId}:${from}`

  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    fetch(buildApiUrl(`/v2/meal-plans/details?${new URLSearchParams({ account_id: accountId, date_from: from, date_to: to })}`), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<unknown> })
      .then(body => { if (!controller.signal.aborted) { setRows({ key: `${accountId}:${from}`, list: Array.isArray(body) ? body as Array<Record<string, unknown>> : [] }); setError('') } })
      .catch(() => { if (!controller.signal.aborted) { setRows({ key: `${accountId}:${from}`, list: [] }); setError('식단표를 불러오지 못했어요.') } })
    return () => controller.abort()
  }, [accountId, from, to])

  const list = rows?.key === key ? rows.list : []
  const loading = Boolean(accountId) && rows?.key !== key
  // 끼니 이름·순서는 서버(본사 끼니 종류)가 준다. 예전 서버 응답이면 기본 이름표·코드 순
  const slotInfo = new Map<number, { name: string; order: number }>()
  const days: WeekMealDay[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday); day.setDate(monday.getDate() + i)
    const date = iso(day)
    days.push({ date, label: `${day.getMonth() + 1}/${day.getDate()}`, weekday: WEEKDAYS[day.getDay()], today: date === kstToday(), slots: {} })
  }
  for (const row of list) {
    const date = String(row.meal_date ?? '').slice(0, 10)
    const day = days.find(d => d.date === date)
    if (!day) continue
    const code = Number(row.meal_slot_code ?? row.meal_slot)
    if (!slotInfo.has(code)) slotInfo.set(code, { name: String(row.meal_slot_name || DEFAULT_SLOT_NAMES[code] || `식사 ${code}`), order: row.slot_display_order == null ? code : Number(row.slot_display_order) })
    ;(day.slots[code] ??= []).push({ menu_id: String(row.menu_id ?? ''), menu_name: String(row.menu_name ?? ''), calories_per_serving: row.calories_per_serving == null ? null : Number(row.calories_per_serving), special: row.special_yn === 'Y' })
  }
  // 주말은 식단이 있을 때만 보여준다
  const visibleDays = days.filter((day, index) => index < 5 || Object.keys(day.slots).length > 0)
  const slots: WeekMealSlot[] = [...slotInfo].sort((a, b) => a[1].order - b[1].order || a[0] - b[0]).map(([code, info]) => ({ code, name: info.name }))
  return {
    days: visibleDays, slots, loading, error, empty: !loading && list.length === 0,
    title: offset === 0 ? '이번 주 식단표' : offset === 1 ? '다음 주 식단표' : offset === -1 ? '지난 주 식단표' : `${days[0].label} 주 식단표`,
    range: `${days[0].label} ~ ${days[6].label}`, move: (delta: number) => setOffset(value => value + delta), reset: () => setOffset(0), offset,
  }
}
