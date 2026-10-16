import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'
import { DEADLINE_WINDOW_HOURS, getDeadlineAlertsCached } from '../../api/deadlineAlerts'

/** 서버 /v2/workspace/calendar: 날짜별 발주서(납품일 기준)와 식단 끼니 수 */
export type CalendarDay = { date: string; received: number; open_orders: number; meals: number }
/** 칸 색 점: 발주 필요(마감 알림) > 발주 진행 중 > 입고 완료 > 식단만 */
export type CalendarState = 'need' | 'ordered' | 'received' | 'meal' | 'none'

const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

export function useWorkspaceCalendar(accountId: string) {
  const [month, setMonth] = useState(() => kstToday().slice(0, 7))
  const [result, setResult] = useState<{ key: string; days: CalendarDay[] } | null>(null)
  const [needDates, setNeedDates] = useState<Set<string>>(new Set())
  const key = `${accountId}:${month}`

  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    fetch(buildApiUrl(`/v2/workspace/calendar?${new URLSearchParams({ account_id: accountId, month })}`), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ days: CalendarDay[] }> })
      .then(body => { if (!controller.signal.aborted) setResult({ key: `${accountId}:${month}`, days: Array.isArray(body.days) ? body.days : [] }) })
      .catch(() => { if (!controller.signal.aborted) setResult({ key: `${accountId}:${month}`, days: [] }) })
    return () => controller.abort()
  }, [accountId, month])

  useEffect(() => {
    if (!accountId) return
    let active = true
    getDeadlineAlertsCached(accountId, DEADLINE_WINDOW_HOURS)
      .then(r => { if (active) setNeedDates(new Set(r.alerts.map(alert => alert.delivery_date))) })
      .catch(() => { if (active) setNeedDates(new Set()) })
    return () => { active = false }
  }, [accountId])

  const byDate = new Map((result?.key === key ? result.days : []).map(day => [day.date, day]))
  const [year, monthNo] = month.split('-').map(Number)
  const first = new Date(year, monthNo - 1, 1)
  const last = new Date(year, monthNo, 0).getDate()
  const today = kstToday()
  const cells: { label: string; date: string; state: CalendarState; today: boolean; blank: boolean; title: string }[] = []
  for (let i = 0; i < first.getDay(); i++) cells.push({ label: '', date: '', state: 'none', today: false, blank: true, title: '' })
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    const day = byDate.get(date)
    const open = Number(day?.open_orders) || 0, received = Number(day?.received) || 0, meals = Number(day?.meals) || 0
    const state: CalendarState = needDates.has(date) ? 'need' : open ? 'ordered' : received ? 'received' : meals ? 'meal' : 'none'
    const title = [needDates.has(date) && '발주 필요', open && `발주 진행 ${open}건`, received && `입고 완료 ${received}건`, meals && `식단 ${meals}끼`].filter(Boolean).join(' · ')
    cells.push({ label: String(d), date, state, today: date === today, blank: false, title })
  }
  const move = (delta: number) => {
    const next = new Date(year, monthNo - 1 + delta, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }
  return { month, title: `${year}년 ${monthNo}월`, cells, move }
}

/**
 * 오늘부터 7일 안에 식단(끼니)이 있는 날 수. 홈의 '식단표 만들기' 안내용(업무 순서 ①). 조회 중이면 null.
 * 월이 넘어가면 두 달을 조회한다.
 */
export function useUpcomingMealDays(accountId: string) {
  const [state, setState] = useState<{ key: string; count: number } | null>(null)
  const today = kstToday()
  const end = new Date(Date.parse(today + 'T00:00:00Z') + 6 * 864e5).toISOString().slice(0, 10)
  const months = Array.from(new Set([today.slice(0, 7), end.slice(0, 7)]))
  const key = `${accountId}:${today}`
  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    Promise.all(months.map(month => fetch(buildApiUrl(`/v2/workspace/calendar?${new URLSearchParams({ account_id: accountId, month })}`), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return (await response.json() as { days?: CalendarDay[] }).days ?? [] })))
      .then(all => { if (!controller.signal.aborted) setState({ key, count: all.flat().filter(day => day.date >= today && day.date <= end && Number(day.meals) > 0).length }) })
      .catch(() => { if (!controller.signal.aborted) setState({ key, count: -1 }) })
    return () => controller.abort()
    // months·today·end는 key(거래처·오늘)로 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state?.key === key ? state.count : null
}
