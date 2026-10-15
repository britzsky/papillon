import { OrderStatusBadge } from '../../components/WorkspaceTheme'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import OrderPreferenceChanges from '../../components/OrderPreferenceChanges'
import SupplierOrderPrint from './SupplierOrderPrint'
import { PrintIcon } from '../../components/ActionIcons'
import { buildApiUrl } from '../../config/api'
import { ORDER_STATUS_LABELS as labels, RECEIVABLE_STATUSES, UNCERTAIN_STATUSES, usePurchaseOrders, type PurchaseOrder } from '../../features/order/usePurchaseOrders'
import './PurchaseOrderManager.css'

/** 아워홈 품목별 출고 상태(서버 /Procurement/SupplierShipment, 실시간 조회·재고 반영 없음) */
type ShipmentLine = { client_ord_item: string; state: 'SHIPPED' | 'OPEN' | 'DELETED' | 'MISSING'; shipped_qty?: string }
type Notice = { event_key: string; event_type: string; title: string; status: string }

const kstDay = (offset = 0) => new Date(Date.now() + 9 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10)
const addDays = (value: string, days: number) => { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const mondayOf = (value: string) => { const d = new Date(`${value}T00:00:00Z`); return addDays(value, -((d.getUTCDay() + 6) % 7)) }
const shortDate = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`
const money = (value: number) => Number(value || 0).toLocaleString('ko-KR')
const DONE = ['RECEIVED', 'CANCELED', 'FAILED']

/**
 * 발주서·입고(PC, 2026-10-15 개편 — 시안 ③). 조회·접수 재조회·입고 확정 로직은 features/order/usePurchaseOrders(터치 화면과 공용).
 * 이번 주 납품일 칸 → 공급사 확인 요망 띠 → 그날 발주서 목록 + 선택한 발주서(단계·품목·공급사 출고·받은 수량·입고).
 */
export default function PurchaseOrderManager() {
  const [params, setParams] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  const focusedId = params.get('purchase_order_id') || ''
  const {
    from, setFrom, to, setTo, status, setStatus, offset, setOffset, supplierId, setSupplierId, suppliers,
    orders, selected, selectOrder, busy, message, load, reconcile,
    receiptDate, setReceiptDate, receiptQuantity, setReceiptQuantity, receive,
  } = usePurchaseOrders(accountId, focusedId)

  // 이번 주 칸(납품일 기준) — 고른 날이 없으면 오늘 들어올 발주서가 있을 때 오늘, 없으면 전체
  const [day, setDay] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => mondayOf(kstDay()))
  const today = kstDay()
  const activeDay = day ?? (orders.some(o => o.requested_delivery_date === today) ? today : '')
  const shown = activeDay ? orders.filter(o => o.requested_delivery_date === activeDay) : orders
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(date => {
    const list = orders.filter(o => o.requested_delivery_date === date)
    const pills = [
      { n: list.filter(o => o.status === 'RECEIVED').length, text: '입고 완료', tone: 'done' },
      { n: list.filter(o => RECEIVABLE_STATUSES.includes(o.status) && o.status !== 'NOT_RECEIVED').length, text: date < today ? '미입고' : '입고 대기', tone: date < today ? 'warn' : 'info' },
      { n: list.filter(o => UNCERTAIN_STATUSES.includes(o.status) || o.status === 'NOT_RECEIVED' || o.status === 'FAILED').length, text: '확인 요망', tone: 'urgent' },
    ].filter(p => p.n)
    return { date, pills }
  })

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
      const remaining = Math.max(0, Math.round((Number(item.order_qty) - Number(item.received_order_qty)) * 1000) / 1000)
      if (line?.state === 'SHIPPED' && line.shipped_qty !== undefined && Number(line.shipped_qty) !== remaining) setReceiptQuantity(item, String(Math.min(remaining, Number(line.shipped_qty))))
      if (line?.state === 'DELETED') setReceiptQuantity(item, '0')
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
    const recv = selected.status === 'RECEIVED' ? { text: '입고 완료', tone: 'ok' } : selected.status === 'PARTIAL_RECEIVED' ? { text: '부분 입고', tone: 'warn' } : selected.status === 'NOT_RECEIVED' ? { text: '미입고', tone: 'urgent' } : { text: '입고 대기', tone: 'done' }
    return [accept, ship, recv]
  }, [selected, lines.length, shippedCount, live.length])
  const receivable = Boolean(selected && RECEIVABLE_STATUSES.includes(selected.status))
  const note = !selected ? '' : !receivable ? '' : changedCount ? `공급사가 주문과 다른 수량을 출고한 품목 ${changedCount}개 · 받은 수량을 출고 수량으로 미리 채워뒀어요` : shippedCount && shippedCount === live.length ? '주문한 수량 그대로 출고됐어요' : '물건이 도착하면 받은 수량만 확인해 주세요'

  return <main className="purchase-orders"><SideMenuLayout header={<HeaderBar title="발주서·입고" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리', to: '/order_manager' }, { label: '발주서·입고' }]} />}>
    <div className="rd rd-recv">
      <header className="rd-recv__head">
        <h1 className="rd-h1">발주서·입고</h1>
        <div className="rd-recv__head-actions">
          {accountId ? <Link className="rd-btn" to={`/inventory/account?${new URLSearchParams({ account_id: accountId })}`}>재고·직접구매 등록</Link> : null}
          {selected ? <button type="button" className="rd-btn print-button" disabled={busy} title="선택한 공급사 발주서 인쇄" onClick={() => window.print()}><PrintIcon />발주서 인쇄</button> : null}
        </div>
      </header>
      {focusedId ? <p className="rd-muted">선택한 발주서만 보고 있어요. <button type="button" className="rd-btn is-ghost" onClick={() => { setParams({ account_id: accountId }); setOffset(0) }}>전체 발주서 보기</button></p> : null}

      <section className="rd-week" aria-label="이번 주 납품일">
        <button type="button" className="rd-icon-btn" aria-label="이전 주" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
        {week.map(({ date, pills }) => <button key={date} type="button" aria-pressed={activeDay === date} className={`rd-week__day${activeDay === date ? ' is-active' : ''}${date === today ? ' is-today' : ''}`} onClick={() => setDay(activeDay === date ? '' : date)}>
          <span className="rd-fs-xs">{'월화수목금토일'[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]}{date === today ? ' · 오늘' : ''}</span>
          <strong>{Number(date.slice(8, 10))}</strong>
          <span className="rd-week__pills">{pills.map(p => <span key={p.text} className={`rd-chip is-${p.tone}`}>{p.text} {p.n}</span>)}</span>
        </button>)}
        <button type="button" className="rd-icon-btn" aria-label="다음 주" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
      </section>

      {notices.map(n => { const id = n.event_key.replace(/^SUPPLIER:/, ''); const order = orders.find(o => o.purchase_order_id === id); const urgent = n.title.includes('확인 요망')
        return <section key={n.event_key} className={`rd-recv__notice${urgent ? ' is-urgent' : ''}`} aria-label="공급사 확인 요망">
          <span className={`rd-chip ${urgent ? 'is-urgent' : 'is-info'}`}>{urgent ? '확인 요망' : '출고 알림'}</span>
          <span className="rd-recv__notice-text">{n.title}</span>
          <button type="button" className="rd-btn" onClick={() => order ? (setDay(order.requested_delivery_date), selectOrder(order)) : setParams({ account_id: accountId, purchase_order_id: id })}>발주서 보기</button>
          {urgent ? <Link className="rd-btn" to={`/order_manager/order?${new URLSearchParams({ account_id: accountId })}`}>다른 상품으로 다시 발주</Link> : null}
        </section> })}

      <details className="rd-card rd-recv__filters">
        <summary className="rd-fs-sm">지난 발주서 찾기 · 주문일 {from} ~ {to}{status ? ` · ${labels[status] || status}` : ''}{supplierId ? ` · ${suppliers.find(s => s.id === supplierId)?.name || ''}` : ''}</summary>
        <section className="purchase-orders__filters" aria-label="발주서 조회 조건">
          <label>주문 시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0) }} /></label>
          <label>주문 종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0) }} /></label>
          <label>진행 상태<select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">전체</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>공급사<select value={supplierId} onChange={e => { setSupplierId(e.target.value); setOffset(0) }}><option value="">전체</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <button type="button" className="rd-btn is-primary" onClick={() => { setDay(''); void load() }} disabled={busy}>조회</button>
        </section>
      </details>
      {message && <p className="rd-recv__message" role="status">{message}</p>}

      <div className="rd-recv__grid">
        <section className="rd-recv__list" aria-label="발주서 목록">
          <div className="rd-recv__list-head">
            <h2 className="rd-h2">{activeDay ? `${shortDate(activeDay)}${activeDay === today ? '(오늘)' : ''} 들어올 발주서 ${shown.length}장` : `발주서 ${shown.length}장`}</h2>
            {activeDay ? <button type="button" className="rd-btn is-ghost" onClick={() => setDay('')}>전체 보기</button> : null}
          </div>
          {shown.map(order => <button key={order.purchase_order_id} type="button" className={`rd-recv__card${selectedId === order.purchase_order_id ? ' is-selected' : ''}`} onClick={() => selectOrder(order)}>
            <span className="rd-recv__card-top"><span className={`rd-supplier is-${(order as PurchaseOrder & { supplier_code?: string }).supplier_code || ''}`}>{order.supplier_name}</span><OrderStatusBadge status={order.status} label={labels[order.status] || order.status} /></span>
            <strong className="rd-fs-md">{order.site_name || order.sold_to || order.client_ord}</strong>
            <span className="rd-muted rd-fs-sm">{shortDate(order.requested_delivery_date)} 납품 · {order.items?.length ? `${order.items.length}품목 · ` : ''}{money(order.total_amount)}원</span>
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
          <OrderPreferenceChanges key={`${accountId}/${selected.purchase_order_id}`} accountId={accountId} orderId={selected.purchase_order_id} changes={selected.preference_changes} />
          {UNCERTAIN_STATUSES.includes(selected.status) || selected.supplier_result_message ? <div className={`rd-recv__response${UNCERTAIN_STATUSES.includes(selected.status) ? ' is-urgent' : ''}`}>
            <span className="rd-fs-sm"><b>공급사 응답</b> {selected.supplier_result_message || '품목별 결과를 확인해 주세요.'}{selected.supplier_result_code ? ` (${selected.supplier_result_code})` : ''}{UNCERTAIN_STATUSES.includes(selected.status) ? ' · 접수 여부 확인 요망' : ''}</span>
            <button type="button" className="rd-btn" disabled={busy} onClick={() => void reconcile()}>공급사 접수 상태 다시 조회</button>
          </div> : null}
          {shipment?.id === selectedId && shipment.error ? <p className="rd-text-warn rd-fs-sm">{shipment.error}</p> : null}
          <div className="rd-recv__table"><table>
            <thead><tr><th>상품</th><th className="is-num">주문</th><th className="is-num">공급사 출고</th><th className="is-num">이미 입고</th><th className="is-num">받은 수량</th></tr></thead>
            <tbody>{selected.items.map(item => { const line = lineOf(item.client_ord_item); const diff = line?.state === 'SHIPPED' && Number(line.shipped_qty) !== Number(item.order_qty)
              return <tr key={item.client_ord_item} className={diff || line?.state === 'DELETED' ? 'is-diff' : ''}>
                <td><strong>{item.product_name}</strong>
                  <small className="rd-muted">{item.supplier_item_code} · <OrderStatusBadge status={item.item_status} label={labels[item.item_status] || item.item_status} /></small>
                  {item.ingredient_link_status === 'CONFLICT' && <small className="rd-text-warn" role="alert">식자재 연결이 바뀌어 자동 연결 확인 요망</small>}
                  {item.ingredient_link_status === 'PENDING' && <small className="rd-muted">접수 확인 후 식자재 자동 연결 예정</small>}
                  {item.supplier_error_message ? <small className="rd-text-warn" role="note">사유: {item.supplier_error_message}{item.supplier_result_code ? ` (${item.supplier_result_code})` : ''}</small> : null}
                </td>
                <td className="is-num">{item.order_qty} {item.order_unit}</td>
                <td className={`is-num${diff || line?.state === 'DELETED' ? ' rd-text-red' : ''}`}><b>{!line ? '—' : line.state === 'SHIPPED' ? `${line.shipped_qty} ${item.order_unit}` : line.state === 'OPEN' ? '출고 전' : line.state === 'DELETED' ? '아워홈 삭제' : '조회 안 됨'}</b></td>
                <td className="is-num">{item.received_order_qty}</td>
                <td className="is-num"><input className="rd-input rd-recv__qty" aria-label={`${item.product_name} 받은 수량`} type="number" min="0" step="0.001" disabled={!receivable} max={Math.max(0, item.order_qty - item.received_order_qty)} value={receiptQuantity(item)} onChange={e => setReceiptQuantity(item, e.target.value)} /></td>
              </tr> })}</tbody>
          </table></div>
          <div className="rd-recv__actions">
            <span className={`rd-fs-sm ${changedCount ? 'rd-text-warn' : shippedCount ? 'rd-text-ok' : 'rd-muted'}`}>{note}</span>
            {receivable ? <label className="rd-fs-sm rd-recv__date">실입고일<input className="rd-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label> : null}
            <button type="button" className="rd-btn is-primary" disabled={busy || !receivable} onClick={() => void receive()}>{receivable ? '받은 수량대로 입고' : labels[selected.status] || selected.status}</button>
          </div>
          {receivable ? <p className="rd-muted rd-fs-xs">받은 수량은 남은 수량(주문 − 이미 입고)으로 채워져요. 실제와 다르면 고치고, 안 온 품목은 0으로 바꾼 뒤 입고하세요.</p> : null}
        </> : <p className="rd-order__empty">왼쪽에서 발주서를 고르면 품목과 입고를 여기서 처리할 수 있어요.</p>}</section>
      </div>
    </div>
  </SideMenuLayout>{selected && <SupplierOrderPrint order={selected} accountId={accountId} labels={labels} />}</main>
}
