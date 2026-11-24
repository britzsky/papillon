import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { OrderStatusBadge } from '../../components/WorkspaceTheme'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TopMenuLayout from '../../components/TopMenuLayout'
import TouchLayout from '../../mobile/TouchLayout'
import WorkflowBar from '../../components/WorkflowBar'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import SupplierOrderPrint from './SupplierOrderPrint'
import InspectionPrint from './InspectionPrint'
import { flushSync } from 'react-dom'
import { buildApiUrl } from '../../config/api'
import { ORDER_STATUS_LABELS as labels, RECEIVABLE_STATUSES, UNCERTAIN_STATUSES, closedByShortage, remainingQty, usePurchaseOrders, type OrderItem, type PurchaseOrder } from '../../features/order/usePurchaseOrders'
import { SHORTAGE_SOURCES, deliveryLabel, type ShortageSource } from '../../api/receiving'
import { PENDING_LABELS, useReceivingPending } from '../../features/order/useReceivingPending'
import './PurchaseOrderManager.css'
import './PurchaseOrderWeek.css'
import FavoriteProductHeart from '../../components/FavoriteProductHeart'
import { confirmDialog } from '../../utils/dialog'

/** 아워홈 품목별 출고 상태(서버 /Procurement/SupplierShipment, 실시간 조회·재고 반영 없음) */
type ShipmentLine = { client_ord_item: string; state: 'SHIPPED' | 'OPEN' | 'DELETED' | 'MISSING'; shipped_qty?: string }
type Notice = { event_key: string; event_type: string; title: string; status: string }

const kstDay = (offset = 0) => new Date(Date.now() + 9 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10)
const addDays = (value: string, days: number) => { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const mondayOf = (value: string) => { const d = new Date(`${value}T00:00:00Z`); return addDays(value, -((d.getUTCDay() + 6) % 7)) }
const shortDate = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`
const money = (value: number) => Number(value || 0).toLocaleString('ko-KR')
const DONE = ['RECEIVED', 'CANCELED', 'FAILED']
const qtyText = (value: number) => String(Math.round(Number(value || 0) * 1000) / 1000)
/** 검수완료 시각 표시: 10/29 14:20 */
const inspectedText = (value?: string | null) => { const v = String(value || '').replace('T', ' '); return v.length >= 16 ? `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))} ${v.slice(11, 16)}` : v }

/**
 * 발주서·입고(PC, 2026-10-15 개편 — 시안 ③). 조회·접수 재조회·입고 확정 로직은 features/order/usePurchaseOrders(터치 화면과 공용).
 * 이번 주 납품일 칸 → 공급사 확인 요망 띠 → 그날 발주서 목록 + 선택한 발주서(단계·품목·공급사 출고·받은 수량·입고).
 * 2026-10-29 검수: 검수서는 납품일 하루치를 공급사 구분 없이 한 번에 인쇄, 검수완료는 공급사 발주서별 → 검수완료 뒤에만 입고.
 */
/** shell: 'tablet'이면 태블릿 틀(TouchLayout, 위 물방울 메뉴) 안에 같은 본문(2026-11-23 사용자 결정: 태블릿 발주서·입고 = 브라우저) */
export default function PurchaseOrderManager({ shell = 'pc' }: { shell?: 'pc' | 'tablet' }) {
  const [params, setParams] = useSearchParams()
  const accountId = workspaceAccountId(params)
  const focusedId = params.get('purchase_order_id') || ''
  const {
    from, setFrom, to, setTo, status, setStatus, offset, setOffset, supplierId, setSupplierId, suppliers,
    orders, selected, selectOrder, busy, message, load, reconcile, inspect, ordersForDelivery,
    receiptDate, setReceiptDate, receiptQuantity, setReceiptQuantity, receive,
    leftoverQty, leftoverChoice, setLeftoverChoice, shortageLines, shortageForm, setShortageForm, shortageNotice, setShortageNotice, cancelShortage,
    ingredients, receiptChoice, setReceiptChoice, needsIngredient,
  } = usePurchaseOrders(accountId, focusedId)

  // 안 들어온 품목(배송 대기·결품 확인 필요·웰스토리 미입 등록) — 터치 화면과 공용
  const { pending, error: pendingError, attention } = useReceivingPending(accountId, orders)

  // 이번 주 칸(납품일 기준) — 고른 날이 없으면 오늘 들어올 발주서가 있을 때 오늘, 없으면 전체
  const [day, setDay] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => mondayOf(kstDay()))
  const today = kstDay()
  const activeDay = day ?? (orders.some(o => o.requested_delivery_date === today) ? today : '')
  const openOrder = (orderId: string, date: string) => { const order = orders.find(o => o.purchase_order_id === orderId); if (order) { setDay(date); selectOrder(order) } else setParams({ account_id: accountId, purchase_order_id: orderId }) }
  const cardStatus = (o: PurchaseOrder) => o.status === 'RECEIVED' || closedByShortage(o) ? { text: '입고 완료', tone: 'done' }
    : UNCERTAIN_STATUSES.includes(o.status) || o.status === 'NOT_RECEIVED' || o.status === 'FAILED' ? { text: '확인 요망', tone: 'urgent' }
    : RECEIVABLE_STATUSES.includes(o.status) ? { text: o.requested_delivery_date < today ? '미입고' : '입고 대기', tone: o.requested_delivery_date < today ? 'urgent' : 'wait' }
    : { text: labels[o.status] || o.status, tone: 'done' }
  const shown = activeDay ? orders.filter(o => o.requested_delivery_date === activeDay) : orders
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(date => {
    const list = orders.filter(o => o.requested_delivery_date === date)
    const pills = [
      { n: list.filter(o => o.status === 'RECEIVED' || closedByShortage(o)).length, text: '입고 완료', tone: 'done' },
      { n: list.filter(o => RECEIVABLE_STATUSES.includes(o.status) && o.status !== 'NOT_RECEIVED').length, text: date < today ? '미입고' : '입고 대기', tone: date < today ? 'warn' : 'info' },
      { n: list.filter(o => UNCERTAIN_STATUSES.includes(o.status) || (o.status === 'NOT_RECEIVED' && !closedByShortage(o)) || o.status === 'FAILED').length, text: '확인 요망', tone: 'urgent' },
    ].filter(p => p.n)
    return { date, pills }
  })

  // 검수서 인쇄: 고른 납품일(없으면 선택한 발주서의 납품일, 그것도 없으면 오늘) 하루치를 공급사 구분 없이 한 장으로
  const [inspection, setInspection] = useState<{ date: string; orders: PurchaseOrder[] } | null>(null)
  const [printError, setPrintError] = useState('')
  const inspectionDay = activeDay || selected?.requested_delivery_date || today
  const printInspection = async () => {
    setPrintError('')
    try {
      const list = await ordersForDelivery(inspectionDay)
      if (!list.length) { setPrintError(`${shortDate(inspectionDay)} 납품 예정 발주서 없음`); return }
      flushSync(() => setInspection({ date: inspectionDay, orders: list }))
      window.print()
    } catch (error) { setPrintError(error instanceof Error ? error.message : '검수서를 불러오지 못했습니다.') }
    finally { setInspection(null) }
  }

  // 공급사 확인 요망 띠: 저장된 업무 알림 중 공급사 출고·삭제 알림(배치가 매시간 갱신)
  const [notices, setNotices] = useState<Notice[]>([])
  useEffect(() => {
    if (!accountId) return
    let active = true
    fetch(buildApiUrl(`/v2/workspace/notifications?${new URLSearchParams({ account_id: accountId })}`))
      .then(r => r.ok ? r.json() : [])
      .then((rows: Notice[]) => { if (active) setNotices(Array.isArray(rows) ? rows.filter(n => n.event_type === 'SUPPLIER_STATUS' && n.status !== 'RESOLVED') : []) })
      .catch(() => { if (active) setNotices([]) })
    return () => { active = false }
  }, [accountId])

  // 선택한 아워홈 발주서의 품목별 출고 상태 → '공급사 출고' 칸, 받은 수량 미리 채우기(입고는 사람이 확정)
  const [shipment, setShipment] = useState<{ id: string; lines: ShipmentLine[]; error?: string } | null>(null)
  const isOurhome = (order: PurchaseOrder | null) => Boolean(order && ((order as PurchaseOrder & { supplier_code?: string }).supplier_code === 'OURHOME' || order.supplier_name.includes('아워홈')))
  const selectedId = selected?.purchase_order_id || ''
  const watch = selected && isOurhome(selected) && !DONE.includes(selected.status) ? selectedId : ''
  useEffect(() => {
    if (!watch) return
    let active = true
    fetch(buildApiUrl(`/Procurement/SupplierShipment?${new URLSearchParams({ account_id: accountId, purchase_order_id: watch })}`))
      .then(async r => { const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body.message || '아워홈 출고 상태를 확인하지 못했습니다.'); return body })
      .then(body => { if (active) setShipment({ id: watch, lines: Array.isArray(body.lines) ? body.lines : [] }) })
      .catch(e => { if (active) setShipment({ id: watch, lines: [], error: e.message }) })
    return () => { active = false }
  }, [watch, accountId])
  const lines = shipment?.id === selectedId ? shipment.lines : []
  const lineOf = (item: string) => lines.find(l => l.client_ord_item === item)
  useEffect(() => {
    if (!selected || !lines.length || !RECEIVABLE_STATUSES.includes(selected.status)) return
    for (const item of selected.items) {
      const line = lines.find(l => l.client_ord_item === item.client_ord_item)
      // 남은 수량(결품 제외). 덜 출고·삭제된 줄은 남는 수량을 결품으로 미리 골라 둔다(확정은 사람이 누름)
      const remaining = remainingQty(item)
      if (line?.state === 'SHIPPED' && line.shipped_qty !== undefined && Number(line.shipped_qty) !== remaining) { setReceiptQuantity(item, String(Math.min(remaining, Number(line.shipped_qty)))); if (Number(line.shipped_qty) < remaining) setLeftoverChoice(item, 'SHORTAGE') }
      if (line?.state === 'DELETED' && remaining > 0) { setReceiptQuantity(item, '0'); setLeftoverChoice(item, 'SHORTAGE') }
    }
    // 출고 상태를 새로 받았을 때 한 번만 채운다(사용자가 고친 값은 그 뒤로 유지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment])

  const live = selected ? selected.items.filter(i => !['FAILED', 'CANCELED'].includes(i.item_status)) : []
  const shippedCount = live.filter(i => lineOf(i.client_ord_item)?.state === 'SHIPPED').length
  const changedCount = live.filter(i => { const l = lineOf(i.client_ord_item); return l?.state === 'SHIPPED' && Number(l.shipped_qty) !== Number(i.order_qty) }).length
  const steps = useMemo(() => {
    if (!selected) return []
    const accept = UNCERTAIN_STATUSES.includes(selected.status) ? { text: '접수 확인 요망', tone: 'urgent' } : selected.status === 'FAILED' ? { text: '접수 실패', tone: 'urgent' } : { text: '접수 확인', tone: 'ok' }
    const ship = !isOurhome(selected) ? { text: '배송', tone: 'done' } : !lines.length ? { text: '출고 확인 중', tone: 'done' }
      : shippedCount && shippedCount === live.length ? { text: '출고완료', tone: 'info' } : shippedCount ? { text: `일부 출고 ${shippedCount}/${live.length}`, tone: 'info' } : { text: '출고 전', tone: 'done' }
    const check = selected.inspected_at ? { text: `검수완료 ${inspectedText(selected.inspected_at)}`, tone: 'ok' } : RECEIVABLE_STATUSES.includes(selected.status) ? { text: '검수 대기', tone: 'done' } : null
    const recv = selected.status === 'RECEIVED' ? { text: '입고 완료', tone: 'ok' } : selected.status === 'PARTIAL_RECEIVED' ? { text: '부분 입고', tone: 'warn' } : selected.status === 'NOT_RECEIVED' ? { text: '미입고', tone: 'urgent' } : { text: '입고 대기', tone: 'done' }
    return check ? [accept, ship, check, recv] : [accept, ship, recv]
  }, [selected, lines.length, shippedCount, live.length])
  const receivable = Boolean(selected && RECEIVABLE_STATUSES.includes(selected.status) && !closedByShortage(selected))
  // 배송 구분이 둘 이상이면 묶음별로 보여 준다(직송·택배는 센터 배송과 따로 온다)
  const deliveryOrder: Record<string, number> = { CENTER: 0, DIRECT: 1, PARCEL: 2 }
  const groupKey = (item: OrderItem) => item.delivery_type || ''
  const rows = selected ? [...selected.items].sort((a, b) => (deliveryOrder[groupKey(a)] ?? 3) - (deliveryOrder[groupKey(b)] ?? 3)) : []
  const grouped = new Set(rows.map(groupKey)).size > 1
  const receivingCount = selected ? selected.items.filter(item => Number(receiptQuantity(item)) > 0).length : 0
  const shortageCount = shortageLines(selected).length
  const waitingAfter = selected ? selected.items.filter(item => leftoverChoice(item) === 'WAIT' && leftoverQty(item) > 0).length : 0
  const inspected = Boolean(selected?.inspected_at)
  const note = !selected ? '' : !receivable ? '' : !inspected ? '물건이 도착하면 검수서로 확인하고 검수완료를 눌러 주세요' : changedCount ? `공급사가 주문과 다른 수량을 출고한 품목 ${changedCount}개 · 받은 수량을 출고 수량으로 미리 채워뒀어요` : shippedCount && shippedCount === live.length ? '주문한 수량 그대로 출고됐어요' : '물건이 도착하면 받은 수량만 확인해 주세요'

  const content = <>
    <div className="rd rd-recv">
      <header className="rd-recv__head">
        <h1 className="rd-sr-only">발주서·입고 관리</h1>
        <div className="rd-recv__head-actions">
          {accountId ? <Link className="rd-btn" to={`/inventory/account?${new URLSearchParams({ account_id: accountId })}`}>재고·직접구매 등록</Link> : null}
          {selected ? <button type="button" className="rd-btn" disabled={busy} title="선택한 공급사 발주서 인쇄" onClick={() => window.print()}>발주서 인쇄</button> : null}
          {accountId ? <button type="button" className="rd-btn" disabled={busy} title="이 날 납품되는 모든 공급사 발주서를 한 장의 검수서로 인쇄" onClick={() => void printInspection()}>검수서 인쇄 ({shortDate(inspectionDay)} 납품)</button> : null}
        </div>
        <DeadlineAlertSlot />
      </header>
      {focusedId ? <p className="rd-muted">선택한 발주서만 보고 있어요. <button type="button" className="rd-btn is-ghost" onClick={() => { setParams({ account_id: accountId }); setOffset(0) }}>전체 발주서 보기</button></p> : null}

      <section className="rd-week" aria-label="이번 주 납품일">
        <button type="button" className="rd-icon-btn" aria-label="이전 주" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
        <div className="rd-week__strip">
        {week.map(({ date, pills }) => <button key={date} type="button" aria-pressed={activeDay === date} className={`rd-week__day${activeDay === date ? ' is-active' : ''}${date === today ? ' is-today' : ''}`} onClick={() => setDay(activeDay === date ? '' : date)}>
          <span className="rd-week__wd">{'월화수목금토일'[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]}{date === today ? <em>오늘</em> : null}</span>
          <strong>{Number(date.slice(8, 10))}</strong>
          <span className="rd-week__pills">{pills.map(p => <span key={p.text} className={`rd-week__pill is-${p.tone}`}>{p.text} {p.n}</span>)}</span>
        </button>)}
        </div>
        <button type="button" className="rd-icon-btn" aria-label="다음 주" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
      </section>

      {notices.map(n => { const id = n.event_key.replace(/^SUPPLIER:/, ''); const order = orders.find(o => o.purchase_order_id === id); const urgent = n.title.includes('확인 요망')
        return <section key={n.event_key} className={`rd-recv__notice${urgent ? ' is-urgent' : ''}`} aria-label="공급사 확인 요망">
          <span className={`rd-chip ${urgent ? 'is-urgent' : 'is-info'}`}>{urgent ? '확인 요망' : '출고 알림'}</span>
          <span className="rd-recv__notice-text">{n.title}</span>
          <button type="button" className="rd-btn" onClick={() => order ? (setDay(order.requested_delivery_date), selectOrder(order)) : setParams({ account_id: accountId, purchase_order_id: id })}>발주서 보기</button>
          {urgent ? <Link className="rd-btn" to={`/order_manager/order?${new URLSearchParams({ account_id: accountId })}`}>다른 상품으로 다시 발주</Link> : null}
        </section> })}

      {attention.length || (pending?.counts.WAITING ?? 0) > 0 ? <details className={`rd-card rd-recv__pending${attention.length ? ' is-urgent' : ''}`} open={attention.length > 0}>
        <summary className="rd-fs-sm"><b>안 들어온 품목</b>{(['CHECK_NEEDED', 'SUPPLIER_REPORTED', 'WAITING'] as const).map(state => pending?.counts[state] ? <span key={state} className={`rd-chip ${state === 'WAITING' ? 'is-info' : 'is-urgent'}`}>{PENDING_LABELS[state]} {pending.counts[state]}</span> : null)}
          <span className="rd-muted">센터 배송·직송은 납품 다음 날, 택배는 이틀 뒤부터 확인 필요로 바뀌어요</span></summary>
        <ul className="rd-recv__pending-list">{(attention.length ? attention : pending?.items || []).slice(0, 30).map(item => <li key={item.purchase_order_item_id}>
          <span className={`rd-chip ${item.state === 'WAITING' ? 'is-info' : 'is-urgent'}`}>{PENDING_LABELS[item.state]}</span>
          <span><b>{item.product_name}</b> {qtyText(item.remaining_qty)}{item.order_unit} · {item.supplier_name} · {shortDate(item.delivery_date)} 납품 · {item.delivery_type_label}
            {item.expected_date !== item.delivery_date ? ` · 새 입고일 ${shortDate(item.expected_date)}` : ''}
            {item.supplier_situations.length ? <small className="rd-muted"> · 웰스토리 상황: {item.supplier_situations.map(s => `${s.incident_type === 'MISSING' ? '미입' : s.incident_type}${s.action_note ? ` ${s.action_note}` : ''}`).join(', ')}</small> : null}</span>
          <button type="button" className="rd-btn" onClick={() => openOrder(item.purchase_order_id, item.delivery_date)}>발주서 보기</button>
        </li>)}</ul>
      </details> : null}
      {pendingError ? <p className="rd-text-warn rd-fs-sm">{pendingError}</p> : null}

      <section className="rd-card rd-recv__filterbar" aria-label="발주서 조회 조건">
        <label className="rd-recv__field is-date"><span>주문 시작일</span><input type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0) }} /></label>
        <label className="rd-recv__field is-date"><span>주문 종료일</span><input type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0) }} /></label>
        <label className="rd-recv__field is-select"><span className="rd-sr-only">진행 상태</span><select aria-label="진행 상태" value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">진행 상태 · 전체</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="rd-recv__field is-select"><span className="rd-sr-only">공급사</span><select aria-label="공급사" value={supplierId} onChange={e => { setSupplierId(e.target.value); setOffset(0) }}><option value="">공급사 · 전체</option>{suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}</select></label>
        <button type="button" className="rd-btn is-primary rd-recv__search" onClick={() => { setDay(''); void load() }} disabled={busy}>조회</button>
      </section>
      {printError ? <p className="rd-recv__message rd-text-warn" role="alert">{printError}</p> : null}
      {message && <p className="rd-recv__message" role="status">{message}
        {/* 업무 순서 ③→④: 입고를 반영하면 재고로 */}
        {message.startsWith('실제 입고수량을 재고에 반영') ? <> <Link className="rd-link" to={`/inventory/account?${new URLSearchParams({ account_id: accountId })}`}>다음: 재고 보기 →</Link></> : null}</p>}

      <div className="rd-recv__grid">
        <section className="rd-recv__list" aria-label="발주서 목록">
          <div className="rd-recv__list-head">
            <h2 className="rd-h2">{activeDay ? `${shortDate(activeDay)}${activeDay === today ? '(오늘)' : ''} 들어올 발주서 ${shown.length}장` : `발주서 ${shown.length}장`}</h2>
            {activeDay ? <button type="button" className="rd-btn is-ghost" onClick={() => setDay('')}>전체 보기</button> : null}
          </div>
          {shown.map(order => <button key={order.purchase_order_id} type="button" className={`rd-recv__card${selectedId === order.purchase_order_id ? ' is-selected' : ''}`} onClick={() => selectOrder(order)}>
            <span className="rd-recv__card-top"><span className={`rd-recv__supplier is-${order.supplier_code || ''}`}>{order.supplier_name}</span><span className={`rd-recv__state is-${cardStatus(order).tone}`} title={labels[order.status] || order.status}>{cardStatus(order).text}</span></span>
            <strong className="rd-fs-md">{order.site_name || order.sold_to || order.client_ord}</strong>
            <span className="rd-muted rd-fs-sm">{shortDate(order.requested_delivery_date)} 납품{order.inspected_at && RECEIVABLE_STATUSES.includes(order.status) ? ' · 검수완료' : ''} · {order.items?.length ? `${order.items.length}품목 · ` : ''}{money(order.total_amount)}원</span>
          </button>)}
          {!shown.length ? <p className="rd-order__empty">{busy ? '발주서를 불러오고 있어요.' : activeDay ? '이 날 들어올 발주서가 없어요.' : '조건에 해당하는 발주서가 없어요.'}</p> : null}
          {!activeDay ? <nav className="rd-recv__pager" aria-label="페이지"><button type="button" className="rd-btn" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>이전</button><button type="button" className="rd-btn" disabled={busy || orders.length < 50} onClick={() => setOffset(offset + 50)}>다음</button></nav> : null}
        </section>

        <section className="rd-card rd-recv__detail" aria-label="발주서 상세">{selected ? <>
          <div className="rd-recv__detail-head">
            <div className="rd-recv__title">
              <span className={`rd-supplier is-${(selected as PurchaseOrder & { supplier_code?: string }).supplier_code || ''}`}>{selected.supplier_name}</span>
              <strong className="rd-fs-lg">{selected.site_name ? `${selected.site_name} · ` : ''}{live.length}품목</strong>
              <span className="rd-muted rd-fs-sm">{shortDate(selected.requested_delivery_date)} 납품 · {selected.client_ord} · {money(selected.total_amount)}원</span>
            </div>
            <ol className="rd-recv__steps" aria-label="진행 단계">{steps.map(step => <li key={step.text} className={`rd-chip is-${step.tone}`}>{step.text}</li>)}</ol>
          </div>
          {UNCERTAIN_STATUSES.includes(selected.status) || selected.supplier_result_message ? <div className={`rd-recv__response${UNCERTAIN_STATUSES.includes(selected.status) ? ' is-urgent' : ''}`}>
            <span className="rd-fs-sm"><b>공급사 응답</b> {selected.supplier_result_message || '품목별 결과를 확인해 주세요.'}{selected.supplier_result_code ? ` (${selected.supplier_result_code})` : ''}{UNCERTAIN_STATUSES.includes(selected.status) ? ' · 접수 여부 확인 요망' : ''}</span>
            <button type="button" className="rd-btn" disabled={busy} onClick={() => void reconcile()}>공급사 접수 상태 다시 조회</button>
          </div> : null}
          {shipment?.id === selectedId && shipment.error ? <p className="rd-text-warn rd-fs-sm">{shipment.error}</p> : null}
          <div className="rd-recv__table"><table>
            <thead><tr><th>상품</th><th className="is-num">주문</th><th className="is-num">공급사 출고</th><th className="is-num">이미 입고</th><th className="is-num">받은 수량</th><th>남는 수량</th></tr></thead>
            <tbody>{rows.map((item, index) => { const line = lineOf(item.client_ord_item); const diff = line?.state === 'SHIPPED' && Number(line.shipped_qty) !== Number(item.order_qty)
              const shortage = Number(item.shortage_order_qty || 0), left = receivable ? leftoverQty(item) : 0
              const groupStart = grouped && (index === 0 || groupKey(rows[index - 1]) !== groupKey(item))
              const groupItems = groupStart ? rows.filter(r => groupKey(r) === groupKey(item)) : []
              return <Fragment key={item.client_ord_item}>{groupStart ? <tr className="rd-recv__group"><td colSpan={6}>
                <b>{deliveryLabel(item.delivery_type)}</b> <span className="rd-muted">{groupItems.length}품목{item.delivery_type && item.delivery_type !== 'CENTER' ? ' · 센터 배송과 따로 올 수 있어요' : ''}</span>
                {receivable ? <button type="button" className="rd-btn is-ghost" onClick={() => groupItems.forEach(r => setReceiptQuantity(r, '0'))}>이 묶음 아직 안 옴 (받은 수량 0)</button> : null}
              </td></tr> : null}
              <tr className={diff || line?.state === 'DELETED' ? 'is-diff' : ''}>
                <td><strong>{item.product_name}</strong><FavoriteProductHeart accountId={accountId} supplierProductId={item.supplier_product_id} productName={item.product_name} favorite={item.favorite_yn === 'Y'} />
                  <small className="rd-muted">{item.supplier_item_code} · <OrderStatusBadge status={item.item_status} label={labels[item.item_status] || item.item_status} /></small>
                  {!needsIngredient(item)
                    ? <small className="rd-muted">재고 식재료: {item.ingredient_name || item.ingredient_id}</small>
                    : receivable ? <span className="rd-recv__ingredient">
                      <select className="rd-input" aria-label={`${item.product_name} 재고에 넣을 식재료`} value={receiptChoice(item).ingredient_id} onChange={e => setReceiptChoice(item, { ingredient_id: e.target.value })}>
                        <option value="">재고에 넣을 식재료 선택</option>
                        {ingredients.map(row => <option key={row.ingredient_id} value={row.ingredient_id}>{row.ingredient_name}{row.base_unit ? ` (${row.base_unit})` : ''}</option>)}
                      </select>
                      <input className="rd-input" type="number" min="0" step="0.001" aria-label={`${item.product_name} 1${item.order_unit}당 식재료 수량`} placeholder={`1${item.order_unit}당 수량(선택)`} value={receiptChoice(item).per_unit} onChange={e => setReceiptChoice(item, { per_unit: e.target.value })} />
                    </span> : <small className="rd-muted">재고 식재료 미지정</small>}
                  {item.supplier_error_message ? <small className="rd-text-warn" role="note">사유: {item.supplier_error_message}{item.supplier_result_code ? ` (${item.supplier_result_code})` : ''}</small> : null}
                </td>
                <td className="is-num">{item.order_qty} {item.order_unit}</td>
                <td className={`is-num${diff || line?.state === 'DELETED' ? ' rd-text-red' : ''}`}><b>{!line ? '—' : line.state === 'SHIPPED' ? `${line.shipped_qty} ${item.order_unit}` : line.state === 'OPEN' ? '출고 전' : line.state === 'DELETED' ? '아워홈 삭제' : '조회 안 됨'}</b></td>
                <td className="is-num">{item.received_order_qty}{shortage > 0 ? <span className="rd-recv__shortage"><span className="rd-chip is-urgent">결품 {qtyText(shortage)}</span>
                  <button type="button" className="rd-btn is-ghost" disabled={busy} onClick={async () => { if (await confirmDialog(`${item.product_name} 결품을 취소할까요? 남은 수량이 다시 입고 예정으로 돌아갑니다.`)) void cancelShortage(item) }}>결품 취소</button></span> : null}</td>
                <td className="is-num"><input className="rd-input rd-recv__qty" aria-label={`${item.product_name} 받은 수량`} type="number" min="0" step="0.001" disabled={!receivable || remainingQty(item) === 0} max={remainingQty(item)} value={receiptQuantity(item)} onChange={e => setReceiptQuantity(item, e.target.value)} /></td>
                <td>{left > 0 ? <span className="rd-recv__left"><span className="rd-fs-sm">{qtyText(left)} {item.order_unit}</span>
                  <select className="rd-input" aria-label={`${item.product_name} 남는 수량 처리`} value={leftoverChoice(item)} onChange={e => setLeftoverChoice(item, e.target.value as 'WAIT' | 'SHORTAGE')}>
                    <option value="WAIT">배송 대기(나중에 옴)</option><option value="SHORTAGE">결품(안 옴)</option>
                  </select></span> : <span className="rd-muted">—</span>}</td>
              </tr></Fragment> })}</tbody>
          </table></div>
          {receivable && shortageCount ? <section className="rd-recv__shortage-form" aria-label="결품 확정">
            <b className="rd-fs-sm">결품 {shortageCount}품목</b>
            <label className="rd-fs-sm">누가 알렸나<select className="rd-input" value={shortageForm.source} onChange={e => setShortageForm({ ...shortageForm, source: e.target.value as ShortageSource })}>{SHORTAGE_SOURCES.filter(s => s.value !== 'SUPPLIER_SITUATION' || selected.supplier_code === 'WELSTORY').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
            <label className="rd-fs-sm">사유<input className="rd-input" maxLength={300} placeholder="예: 산지 수급 불가" value={shortageForm.reason} onChange={e => setShortageForm({ ...shortageForm, reason: e.target.value })} /></label>
            <label className="rd-fs-sm">공급사 담당자<input className="rd-input" maxLength={50} placeholder="통화한 사람(선택)" value={shortageForm.contact_name} onChange={e => setShortageForm({ ...shortageForm, contact_name: e.target.value })} /></label>
            <span className="rd-muted rd-fs-xs">결품 수량은 입고 예정·재고·금액에서 빠지고 부족 재고 추천에 다시 나와요. 늦게 오면 결품 취소하면 돼요.</span>
          </section> : null}
          {shortageNotice?.orderId === selectedId ? <section className="rd-recv__notice-copy" aria-label="공급사 전달 문구">
            <b className="rd-fs-sm">공급사에 전달할 문구</b><span className="rd-muted rd-fs-xs">{selected.supplier_code === 'WELSTORY' ? '웰스토리는 결품 등록 API가 없어요 · CRM 담당자에게 보내면 등록 여부를 상황 조회로 자동 확인해요' : '아워홈은 결품 등록 API가 없어요 · 담당자에게 보내 주세요'}</span>
            <textarea className="rd-input" readOnly rows={Math.min(8, shortageNotice.text.split('\n').length)} value={shortageNotice.text} />
            <span><button type="button" className="rd-btn" onClick={() => void navigator.clipboard?.writeText(shortageNotice.text)}>복사</button> <button type="button" className="rd-btn is-ghost" onClick={() => setShortageNotice(null)}>닫기</button></span>
          </section> : null}
          <div className="rd-recv__actions">
            <span className={`rd-fs-sm ${changedCount ? 'rd-text-warn' : shippedCount ? 'rd-text-ok' : 'rd-muted'}`}>{note}</span>
            {receivable ? <label className="rd-fs-sm rd-recv__date">실입고일<input className="rd-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label> : null}
            {receivable && !inspected ? <button type="button" className="rd-btn is-primary" disabled={busy} title="검수서로 물건을 확인했으면 누르세요. 이 공급사 발주서만 검수완료됩니다." onClick={() => void inspect(true)}>검수완료</button> : null}
            {receivable && inspected ? <button type="button" className="rd-btn is-ghost" disabled={busy} onClick={async () => { if ((await confirmDialog(`${selected.supplier_name} 검수완료를 취소할까요? 취소하면 다시 검수완료할 때까지 입고할 수 없습니다.`))) void inspect(false) }}>검수 취소</button> : null}
            {receivable && shortageCount && receivingCount && !inspected ? <button type="button" className="rd-btn" disabled={busy} title="공급사가 미리 알려 준 결품 등 · 검수 전에도 확정할 수 있어요" onClick={() => void receive(true)}>결품만 확정</button> : null}
            <button type="button" className={`rd-btn${inspected || !receivable || (shortageCount && !receivingCount) ? ' is-primary' : ''}`} disabled={busy || !receivable || (receivingCount > 0 && !inspected) || (!receivingCount && !shortageCount)} title={receivable && receivingCount && !inspected ? '검수완료 후 입고할 수 있어요' : undefined} onClick={() => void receive()}>
              {!receivable ? (closedByShortage(selected) ? '결품으로 마감' : labels[selected.status] || selected.status) : !receivingCount && shortageCount ? '결품 확정' : !inspected ? '검수완료 후 입고' : shortageCount ? '받은 수량 입고 + 결품 확정' : '받은 수량대로 입고'}</button>
          </div>
          {receivable ? <p className="rd-muted rd-fs-xs">받은 수량은 남은 수량(주문 − 이미 입고 − 결품)으로 채워져요. 실제와 다르면 고치고, 남는 수량은 <b>배송 대기</b>(나중에 옴) 또는 <b>결품</b>(안 옴)을 골라 주세요.{waitingAfter ? ` 배송 대기 ${waitingAfter}품목은 입고 예정으로 남아요.` : ''}</p> : null}
        </> : <p className="rd-order__empty">왼쪽에서 발주서를 고르면 품목과 입고를 여기서 처리할 수 있어요.</p>}</section>
      </div>
    </div>
  </>
  return <div className="purchase-orders">{shell === 'tablet' ? <TouchLayout title="발주서·입고 관리" pcContent><WorkflowBar />{content}</TouchLayout> : <TopMenuLayout title="발주서·입고 관리">{content}</TopMenuLayout>}{inspection ? <InspectionPrint date={inspection.date} orders={inspection.orders} accountId={accountId} /> : selected && <SupplierOrderPrint order={selected} accountId={accountId} labels={labels} />}</div>
}
