import WorkspaceNotifications from './WorkspaceNotifications'
import { Fragment, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { buildApiUrl } from '../config/api'
import { clearDeadlineAlertCache, DEADLINE_WINDOW_HOURS, deadlineOrderPath, getDeadlineAlertsCached, minutesUntil, remainingLabel, type DeadlineAlert } from '../api/deadlineAlerts'
import { getShortages, type ShortageRow } from '../api/shortageProcurement'
import './DailyWork.css'

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

type AccountTask = { account_id: string; account_name: string; pending_orders: number; due_receipts: number; pending_meals: number; mapped_suppliers: number }
type TaskKey = 'pending_orders' | 'due_receipts' | 'pending_meals'

/** 오늘 할 일 칸. 같은 화면으로 가는 입구는 홈에서 이 칸과 '자주 쓰는 화면' 두 곳뿐이다. */
const TASKS: { key: TaskKey; label: string; hint: string; path: string; tone: 'warn' | 'info' }[] = [
  { key: 'pending_orders', label: '주문 결과 확인', hint: '접수 여부가 불명확한 발주서', path: '/order_manager/orders', tone: 'warn' },
  { key: 'due_receipts', label: '입고 확인', hint: '오늘까지 도착 예정인 미입고 주문', path: '/order_manager/orders', tone: 'info' },
  { key: 'pending_meals', label: '사용 확정', hint: '오늘 식사 실제 식수 확인', path: '/operations/table-meals', tone: 'info' },
]

const count = (row: AccountTask, key: TaskKey) => Number(row[key]) || 0
const needsSite = (row: AccountTask) => !Number(row.mapped_suppliers)
const hasWork = (row: AccountTask) => needsSite(row) || TASKS.some(task => count(row, task.key) > 0)
const href = (path: string, accountId: string) => `${path}?${new URLSearchParams({ account_id: accountId })}`

export default function DailyWork() {
  const [params] = useSearchParams()
  const account = params.get('account_id') || (localStorage.getItem('user_type') === '3' ? localStorage.getItem('account_id') || '' : '')
  const [data, setData] = useState<{ role: string; accounts: AccountTask[]; checked_at?: string } | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [noticeAccount, setNoticeAccount] = useState('')
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
  // 거래처 한 곳(현장 계정 또는 본사가 거래처를 고른 경우)은 칸 자체가 해당 화면 링크, 여러 곳은 합계 + 일이 있는 거래처 표
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
  const prepareTile = (row: AccountTask) => {
    if (needsSite(row)) return tile('prepare', '발주 준비', '사업장 지정', '공급사 사업장을 먼저 지정하세요', 'warn', href('/order_manager/supplier-sites', row.account_id))
    if (deadlines === null || stockRows === null) return tile('prepare', '발주 준비', '확인 중', '발주 마감·재고 부족을 계산하고 있습니다', 'done', href('/order_manager/recommended', row.account_id))
    const open = deadlines.map(alert => ({ alert, minutes: minutesUntil(alert.deadline, Date.now()) })).filter(x => x.minutes > 0).sort((a, b) => a.minutes - b.minutes)
    const items = open.reduce((sum, x) => sum + x.alert.items.length, 0)
    const checks = stockRows.filter(needsCheck).length
    const stockText = `재고 부족 ${stockRows.length}품목${checks ? ` · 그중 확인 필요 ${checks}` : ''}`
    // ① 식단 기준 24시간 안 마감 ② 현재고 부족 ③ 없음
    if (items) {
      const first = open[0]
      return tile('prepare', '발주 준비 · 마감 임박', `${items}품목`,
        `가장 빠른 마감 ${first.alert.deadline.slice(11, 16)}(${remainingLabel(first.minutes)}) · ${first.alert.supplier_name}${stockRows.length ? ` · ${stockText} 별도` : ''}`,
        first.minutes <= 300 ? 'urgent' : 'warn', deadlineOrderPath(row.account_id, first.alert))
    }
    if (stockRows.length) return tile('prepare', '발주 준비 · 재고 부족', `${stockRows.length}품목`,
      `현재고가 없거나 안전재고 미달${checks ? ` · 그중 확인 필요 ${checks}(판매 중단·기존 주문 확인 등)` : ''}`,
      'warn', `/order_manager/order?${new URLSearchParams({ tab: 'stock', account_id: row.account_id })}`)
    return tile('prepare', '발주 준비', '급한 발주 없음', '마감 임박·재고 부족 품목 없음 · 발주안 보기', 'done', href('/order_manager/recommended', row.account_id))
  }

  const tile = (key: string, label: string, value: string, hint: string, tone: string, to?: string) => {
    const body = <><span className="home-tasks__label">{label}</span><strong className="home-tasks__count">{value}</strong><span className="home-tasks__hint">{hint}</span></>
    const className = `home-tasks__tile is-${tone}`
    return to ? <Link key={key} className={className} to={to}>{body}</Link> : <div key={key} className={className}>{body}</div>
  }

  return <section className="home-tasks" aria-label="오늘 할 일">
    <div className="home-tasks__heading">
      <h2>오늘 할 일{single ? <span> · {single.account_name}</span> : rows.length > 1 ? <span> · 거래처 {rows.length}곳</span> : null}</h2>
      {data?.checked_at && <small>{data.checked_at.slice(11, 16)} 기준</small>}
      <button type="button" onClick={() => { clearDeadlineAlertCache(); stockCache.clear(); setRevision(value => value + 1) }}>새로고침</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">업무 현황을 확인하고 있습니다.</p>}
    {data && !rows.length && <p>조회할 거래처가 없습니다. 거래처 설정을 확인해주세요.</p>}

    {rows.length > 0 && <div className="home-tasks__tiles">
      {single
        ? prepareTile(single)
        : tile('prepare', '사업장 지정 필요', `${siteMissing}곳`, '공급사 사업장이 없어 발주할 수 없는 거래처', siteMissing ? 'warn' : 'done')}
      {TASKS.map(task => {
        const total = single ? count(single, task.key) : rows.reduce((sum, row) => sum + count(row, task.key), 0)
        return tile(task.key, task.label, `${total}건`, task.hint, total ? task.tone : 'done', single && total ? href(task.path, single.account_id) : undefined)
      })}
    </div>}

    {single && <WorkspaceNotifications accountId={single.account_id} />}

    {!single && busy.length > 0 && <div className="home-tasks__table workspace-table-scroll"><table>
      <thead><tr><th>거래처</th>{TASKS.map(task => <th key={task.key}>{task.label}</th>)}<th>공급사 사업장</th><th>발주</th><th>업무 알림</th></tr></thead>
      <tbody>{busy.map(row => <Fragment key={row.account_id}>
        <tr>
          <td><strong>{row.account_name}</strong></td>
          {TASKS.map(task => <td key={task.key}>{count(row, task.key)
            ? <Link className={`home-tasks__num is-${task.tone}`} to={href(task.path, row.account_id)}>{count(row, task.key)}건</Link>
            : <span className="home-tasks__zero">-</span>}</td>)}
          <td>{needsSite(row) ? <Link className="home-tasks__num is-warn" to={href('/order_manager/supplier-sites', row.account_id)}>지정 필요</Link> : <span className="home-tasks__zero">{Number(row.mapped_suppliers)}곳</span>}</td>
          <td><Link className="home-tasks__go" to={href('/order_manager/recommended', row.account_id)}>발주안</Link></td>
          <td><button type="button" aria-expanded={noticeAccount === row.account_id} onClick={() => setNoticeAccount(current => current === row.account_id ? '' : row.account_id)}>{noticeAccount === row.account_id ? '접기' : '보기'}</button></td>
        </tr>
        {noticeAccount === row.account_id && <tr className="home-tasks__notice-row"><td colSpan={TASKS.length + 4}><WorkspaceNotifications accountId={row.account_id} defaultOpen /></td></tr>}
      </Fragment>)}</tbody>
    </table></div>}
    {!single && rows.length > 0 && !busy.length && <p className="home-tasks__all-clear">모든 거래처에 지금 확인할 업무가 없습니다.</p>}
    {!single && idle.length > 0 && <details className="home-tasks__idle">
      <summary>업무 없는 거래처 {idle.length}곳</summary>
      <div>{idle.map(row => <Link key={row.account_id} className="home-tasks__go" to={href('/order_manager/recommended', row.account_id)}>{row.account_name}</Link>)}</div>
    </details>}
  </section>
}
