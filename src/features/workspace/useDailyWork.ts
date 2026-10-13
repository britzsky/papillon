import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'
import { clearDeadlineAlertCache, DEADLINE_WINDOW_HOURS, deadlineOrderPath, getDeadlineAlertsCached, minutesUntil, remainingLabel, type DeadlineAlert } from '../../api/deadlineAlerts'
import { getShortages, type ShortageRow } from '../../api/shortageProcurement'

/** 발주하기 '현재 부족 재고 바로 주문' 탭과 같은 조건(납품 내일)으로 부족 품목을 센다. 5분 캐시. */
const stockCache = new Map<string, { at: number; result: Promise<ShortageRow[]> }>()
function stockShortagesCached(accountId: string) {
  const hit = stockCache.get(accountId)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.result
  const day = (offset: number) => { const d = new Date(Date.now() + 9 * 3600e3 + offset * 86400e3); return d.toISOString().slice(0, 10) }
  const result = getShortages({ account_id: accountId, source: 'STOCK', table_id: '', date_from: day(0), date_to: day(6), delivery_date: day(1), sold_to: '', average_days: 30, coverage_days: 1 } as Parameters<typeof getShortages>[0])
    .then(r => Array.isArray(r.ingredients) ? r.ingredients : [])
  stockCache.set(accountId, { at: Date.now(), result })
  result.catch(() => stockCache.delete(accountId))
  return result
}
/** 지금 바로 담을 수 없는 행: 확인 사항이 있거나 발주 가능한 상품이 없음(판매 중단·리드타임 등) */
const needsCheck = (row: ShortageRow) => (row.issues?.length ?? 0) > 0 || !(row.offers || []).some(o => o.orderable && o.orderability_status === 'AVAILABLE')

export type AccountTask = { account_id: string; account_name: string; pending_orders: number; due_receipts: number; pending_meals: number; mapped_suppliers: number }
export type TaskKey = 'pending_orders' | 'due_receipts' | 'pending_meals'
export type TaskTone = 'warn' | 'info' | 'urgent' | 'done'
/** 칸 하나(제목·값·설명·색·이동할 주소) */
export type TaskTile = { key: string; label: string; value: string; hint: string; tone: TaskTone; to?: string }

/** 오늘 할 일 칸. PC 홈(DailyWork)과 터치 홈이 같은 기준을 쓴다. */
export const TASKS: { key: TaskKey; label: string; hint: string; path: string; tone: 'warn' | 'info' }[] = [
  { key: 'pending_orders', label: '주문 결과 확인', hint: '접수 여부가 불명확한 발주서', path: '/order_manager/orders', tone: 'warn' },
  { key: 'due_receipts', label: '입고 확인', hint: '오늘까지 도착 예정인 미입고 주문', path: '/order_manager/orders', tone: 'info' },
  { key: 'pending_meals', label: '사용 확정', hint: '오늘 식사 실제 식수 확인', path: '/operations/table-meals', tone: 'info' },
]

export const taskCount = (row: AccountTask, key: TaskKey) => Number(row[key]) || 0
export const needsSite = (row: AccountTask) => !Number(row.mapped_suppliers)
export const hasWork = (row: AccountTask) => needsSite(row) || TASKS.some(task => taskCount(row, task.key) > 0)
export const accountHref = (path: string, accountId: string) => `${path}?${new URLSearchParams({ account_id: accountId })}`

/**
 * 오늘 할 일 조회(/v2/workspace/tasks) + 거래처 한 곳일 때의 '발주 준비' 칸 계산(마감 임박 → 재고 부족 → 없음).
 * account가 비어 있으면 서버가 볼 수 있는 모든 거래처를 돌려준다.
 */
export function useDailyWork(account: string) {
  const [data, setData] = useState<{ role: string; accounts: AccountTask[]; checked_at?: string } | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  // 거래처 한 곳일 때 '발주 준비' 칸: 24시간 안에 마감되는 부족 식재료(머리글 종 알림·상단 배너와 같은 조회 결과)
  const [deadlineResult, setDeadlineResult] = useState<{ key: string; alerts: DeadlineAlert[] } | null>(null)
  // 같은 칸의 두 번째 기준: 현재고 부족(식단이 없어도 재고가 없으면 발주가 필요하다)
  const [stockResult, setStockResult] = useState<{ key: string; rows: ShortageRow[] } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(buildApiUrl(`/v2/workspace/tasks?${new URLSearchParams({ account_id: account })}`), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('오늘 할 일을 불러오지 못했습니다.'); return response.json() as Promise<{ role: string; accounts: AccountTask[]; checked_at?: string }> })
      .then(value => { if (!controller.signal.aborted) { setData(value); setError('') } })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '조회 실패') })
    return () => controller.abort()
  }, [account, revision])

  const rows = data?.accounts || []
  // 거래처 한 곳(현장 계정 또는 본사가 거래처를 고른 경우)은 칸 자체가 해당 화면 링크, 여러 곳은 합계 + 일이 있는 거래처 목록
  const single = rows.length === 1 ? rows[0] : null
  const busy = rows.filter(hasWork)
  const idle = rows.filter(row => !hasWork(row))
  const siteMissing = rows.filter(needsSite).length
  const singleId = single && !needsSite(single) ? single.account_id : ''
  const deadlineKey = `${singleId}:${revision}`
  useEffect(() => {
    if (!singleId) return
    let active = true
    const key = `${singleId}:${revision}`
    getDeadlineAlertsCached(singleId, DEADLINE_WINDOW_HOURS).then(r => { if (active) setDeadlineResult({ key, alerts: r.alerts }) }).catch(() => { if (active) setDeadlineResult({ key, alerts: [] }) })
    stockShortagesCached(singleId).then(rows => { if (active) setStockResult({ key, rows }) }).catch(() => { if (active) setStockResult({ key, rows: [] }) })
    return () => { active = false }
  }, [singleId, revision])
  // 결과가 지금 거래처·새로고침 차례의 것이 아니면 아직 확인 중
  const deadlines = deadlineResult?.key === deadlineKey ? deadlineResult.alerts : null
  const stockRows = stockResult?.key === deadlineKey ? stockResult.rows : null

  const prepareTile = (row: AccountTask): TaskTile => {
    if (needsSite(row)) return { key: 'prepare', label: '발주 준비', value: '사업장 지정', hint: '공급사 사업장을 먼저 지정하세요', tone: 'warn', to: accountHref('/order_manager/supplier-sites', row.account_id) }
    if (deadlines === null || stockRows === null) return { key: 'prepare', label: '발주 준비', value: '확인 중', hint: '발주 마감·재고 부족을 계산하고 있습니다', tone: 'done', to: accountHref('/order_manager/recommended', row.account_id) }
    const open = deadlines.map(alert => ({ alert, minutes: minutesUntil(alert.deadline, Date.now()) })).filter(x => x.minutes > 0).sort((a, b) => a.minutes - b.minutes)
    const items = open.reduce((sum, x) => sum + x.alert.items.length, 0)
    const checks = stockRows.filter(needsCheck).length
    const stockText = `재고 부족 ${stockRows.length}품목${checks ? ` · 그중 확인 필요 ${checks}` : ''}`
    // ① 식단 기준 24시간 안 마감 ② 현재고 부족 ③ 없음
    if (items) {
      const first = open[0]
      return { key: 'prepare', label: '발주 준비 · 마감 임박', value: `${items}품목`,
        hint: `가장 빠른 마감 ${first.alert.deadline.slice(11, 16)}(${remainingLabel(first.minutes)}) · ${first.alert.supplier_name}${stockRows.length ? ` · ${stockText} 별도` : ''}`,
        tone: first.minutes <= 300 ? 'urgent' : 'warn', to: deadlineOrderPath(row.account_id, first.alert) }
    }
    if (stockRows.length) return { key: 'prepare', label: '발주 준비 · 재고 부족', value: `${stockRows.length}품목`,
      hint: `현재고가 없거나 안전재고 미달${checks ? ` · 그중 확인 필요 ${checks}(판매 중단·기존 주문 확인 등)` : ''}`,
      tone: 'warn', to: `/order_manager/order?${new URLSearchParams({ tab: 'stock', account_id: row.account_id })}` }
    return { key: 'prepare', label: '발주 준비', value: '급한 발주 없음', hint: '마감 임박·재고 부족 품목 없음 · 발주안 보기', tone: 'done', to: accountHref('/order_manager/recommended', row.account_id) }
  }

  /** 첫 칸(발주 준비 또는 사업장 지정 필요) + TASKS 칸. 거래처 한 곳이면 칸이 그 화면 링크. */
  const tiles: TaskTile[] = rows.length === 0 ? [] : [
    single ? prepareTile(single) : { key: 'prepare', label: '사업장 지정 필요', value: `${siteMissing}곳`, hint: '공급사 사업장이 없어 발주할 수 없는 거래처', tone: siteMissing ? 'warn' : 'done' },
    ...TASKS.map(task => {
      const total = single ? taskCount(single, task.key) : rows.reduce((sum, row) => sum + taskCount(row, task.key), 0)
      return { key: task.key, label: task.label, value: `${total}건`, hint: task.hint, tone: (total ? task.tone : 'done') as TaskTone, to: single && total ? accountHref(task.path, single.account_id) : undefined }
    }),
  ]

  const refresh = () => { clearDeadlineAlertCache(); stockCache.clear(); setRevision(value => value + 1) }

  return { data, error, rows, single, busy, idle, siteMissing, tiles, refresh }
}
