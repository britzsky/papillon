import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { ORDER_STATUS_LABELS, RECEIVABLE_STATUSES, UNCERTAIN_STATUSES, daysAgo, usePurchaseOrders, type OrderItem, type PurchaseOrder } from '../../features/order/usePurchaseOrders'
import './OrdersTouch.css'

const qty = (value?: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const won = (value?: number) => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`
const remaining = (item: OrderItem) => Math.max(0, Math.round((Number(item.order_qty) - Number(item.received_order_qty)) * 1000) / 1000)

type Group = 'all' | 'wait' | 'check' | 'done'
const GROUPS: { key: Group; label: string; icon: TouchIconName; statuses?: string[] }[] = [
  { key: 'all', label: '전체', icon: 'order' },
  { key: 'wait', label: '입고 대기', icon: 'truck', statuses: RECEIVABLE_STATUSES },
  { key: 'check', label: '확인 필요', icon: 'alert', statuses: [...UNCERTAIN_STATUSES, 'FAILED'] },
  { key: 'done', label: '입고 완료', icon: 'check', statuses: ['RECEIVED'] },
]
const PERIODS = [7, 30, 90]

function statusTone(status: string) {
  if (status === 'RECEIVED') return 'is-ok'
  if (UNCERTAIN_STATUSES.includes(status) || status === 'FAILED') return 'is-danger'
  if (RECEIVABLE_STATUSES.includes(status)) return 'is-yellow'
  return ''
}

/**
 * 발주서·입고(태블릿·휴대폰). POS 배치: 위 상태 칸 → 발주서 카드, 오른쪽에서 품목별 이번 입고 수량을 넣고 입고 확정.
 * 로직은 PC 발주서 관리와 같은 usePurchaseOrders.
 */
export default function OrdersTouch() {
  const [params, setParams] = useSearchParams()
  const [accountId, setAccountId] = useState(() => params.get('account_id') || localStorage.getItem('account_id') || '')
  const focusedId = params.get('purchase_order_id') || ''
  const po = usePurchaseOrders(accountId, focusedId)
  const [group, setGroup] = useState<Group>('all')
  const [period, setPeriod] = useState(30)

  const counts = useMemo(() => Object.fromEntries(GROUPS.map(g => [g.key, g.statuses ? po.orders.filter(o => g.statuses!.includes(o.status)).length : po.orders.length])) as Record<Group, number>, [po.orders])
  const statuses = GROUPS.find(g => g.key === group)?.statuses
  const shown = statuses ? po.orders.filter(order => statuses.includes(order.status)) : po.orders

  const choosePeriod = (days: number) => { setPeriod(days); po.setFrom(daysAgo(days)); po.setTo(new Date().toLocaleDateString('sv-SE')); po.setOffset(0) }

  const toolbar = <>
    <div className="t-segment" role="group" aria-label="조회 기간">
      {PERIODS.map(days => <button key={days} type="button" className={period === days ? 'is-active' : ''} disabled={Boolean(focusedId)} onClick={() => choosePeriod(days)}>최근 {days}일</button>)}
    </div>
    <button type="button" className="t-btn is-icon" aria-label="새로고침" disabled={po.busy} onClick={() => void po.load()}><TouchIcon name="refresh" /></button>
  </>

  return <TouchLayout title="발주서 · 입고" subtitle={accountId ? `${po.orders.length}건` : undefined} toolbar={toolbar}
    aside={<OrderPanel po={po} />} onAccountChange={value => { setAccountId(value); po.selectOrder(null) }}>
    {focusedId && <div className="t-msg is-warn od-focus">
      <span>알림에서 고른 발주서 하나만 보고 있습니다.</span>
      <button type="button" className="t-btn is-small" onClick={() => { setParams({ account_id: accountId }); po.setOffset(0) }}>전체 발주서 보기</button>
    </div>}

    <div className="t-tabs" role="tablist" aria-label="상태">
      {GROUPS.map(g => <button key={g.key} type="button" role="tab" aria-selected={group === g.key}
        className={`t-tab${group === g.key ? ' is-active' : ''}${g.key === 'check' && counts.check > 0 ? ' od-tab--alert' : ''}`} onClick={() => setGroup(g.key)}>
        <TouchIcon name={g.icon} />
        <strong>{g.label}</strong>
        <small>{counts[g.key]}건</small>
      </button>)}
    </div>

    {!accountId && <p className="t-msg">위에서 거래처를 고르면 발주서가 나옵니다.</p>}
    {po.message && <p className={`t-msg ${/실패|확인해|입력해/.test(po.message) ? 'is-error' : 'od-done'}`} role="status">{po.message}</p>}
    {accountId && po.busy && po.orders.length === 0 && <p className="t-msg" role="status">발주서를 불러오는 중…</p>}
    {accountId && !po.busy && shown.length === 0 && <p className="t-msg">조건에 맞는 발주서가 없습니다.</p>}

    <ul className="od-list">
      {shown.map(order => <li key={order.purchase_order_id}>
        <button type="button" className={`t-card od-card${po.selected?.purchase_order_id === order.purchase_order_id ? ' is-selected' : ''}`} onClick={() => po.selectOrder(order)}>
          <span className="t-dot">{order.supplier_name.slice(0, 1)}</span>
          <span className="od-card__main">
            <strong>{order.supplier_name}</strong>
            <small>{order.client_ord} · 품목 {order.items.length}개</small>
          </span>
          <span className="od-card__date"><small>납품일</small><strong>{order.requested_delivery_date.slice(5).replace('-', '.')}</strong></span>
          <span className="od-card__amount">{won(order.total_amount)}</span>
          <span className={`t-badge ${statusTone(order.status)}`}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
        </button>
      </li>)}
    </ul>
    {!focusedId && (po.offset > 0 || po.orders.length >= 50) && <div className="od-pages">
      <button type="button" className="t-btn is-soft" disabled={po.busy || po.offset === 0} onClick={() => po.setOffset(Math.max(0, po.offset - 50))}>이전 50건</button>
      <button type="button" className="t-btn is-soft" disabled={po.busy || po.orders.length < 50} onClick={() => po.setOffset(po.offset + 50)}>다음 50건</button>
    </div>}
  </TouchLayout>
}

/** 오른쪽 패널: 발주서 제목 → 상태·공급사 응답 → 품목별 이번 입고(−/+) → 실입고일·합계 → 입고 확정 */
function OrderPanel({ po }: { po: ReturnType<typeof usePurchaseOrders> }) {
  const order: PurchaseOrder | null = po.selected
  if (!order) return <div className="od-panel">
    <div className="od-panel__head"><h2>입고 확정</h2><p>왼쪽에서 발주서를 고르면 품목과 입고 수량이 여기에 나옵니다.</p></div>
  </div>

  const receivable = RECEIVABLE_STATUSES.includes(order.status)
  const uncertain = UNCERTAIN_STATUSES.includes(order.status)
  const thisTime = order.items.filter(item => Number(po.receiptQuantity(item)) > 0).length
  const bump = (item: OrderItem, delta: number) => {
    const next = Math.max(0, Math.round(((Number(po.receiptQuantity(item)) || 0) + delta) * 1000) / 1000)
    po.setReceiptQuantity(item, String(next))
  }

  return <div className="od-panel">
    <div className="od-panel__head">
      <div className="od-panel__title">
        <span className="t-dot">{order.supplier_name.slice(0, 1)}</span>
        <div>
          <h2>{order.supplier_name}</h2>
          <p>{order.client_ord}{order.site_name ? ` · ${order.site_name}` : ''}</p>
        </div>
      </div>
      <div className="od-panel__meta">
        <span className={`t-badge ${statusTone(order.status)}`}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
        <span>납품일 {order.requested_delivery_date}</span>
      </div>
    </div>

    <div className="od-panel__body">
      {uncertain && <div className="t-msg is-warn od-uncertain">
        <strong>공급사 접수 여부가 아직 확실하지 않습니다.</strong>
        <span>{order.supplier_result_message || '품목별 결과를 확인해주세요.'}</span>
        <button type="button" className="t-btn is-small" disabled={po.busy} onClick={() => void po.reconcile()}><TouchIcon name="refresh" size={18} />접수 상태 다시 조회</button>
      </div>}

      <ul className="od-items">
        {order.items.map(item => {
          const left = remaining(item)
          return <li key={item.client_ord_item} className={left === 0 ? 'is-done' : ''}>
            <div className="od-items__name">
              <strong>{item.product_name}</strong>
              <small>주문 {qty(item.order_qty)} · 입고 {qty(item.received_order_qty)} · 남음 {qty(left)} {item.order_unit}</small>
              {item.supplier_error_message && <small className="od-items__error">사유: {item.supplier_error_message}</small>}
            </div>
            {receivable && left > 0
              ? <div className="od-items__qty">
                <button type="button" className="t-round" aria-label="1 줄이기" disabled={po.busy} onClick={() => bump(item, -1)}>−</button>
                <input type="text" inputMode="decimal" aria-label={`${item.product_name} 이번 입고수량`} value={po.receiptQuantity(item)} disabled={po.busy}
                  onChange={e => po.setReceiptQuantity(item, e.target.value.replace(/[^0-9.]/g, ''))} />
                <button type="button" className="t-round" aria-label="1 늘리기" disabled={po.busy} onClick={() => bump(item, 1)}>+</button>
              </div>
              : <span className={`t-badge ${left === 0 ? 'is-ok' : ''}`}>{left === 0 ? '입고 완료' : ORDER_STATUS_LABELS[item.item_status] || item.item_status}</span>}
          </li>
        })}
      </ul>
      {receivable && <p className="od-hint">남은 수량이 미리 들어가 있습니다. 실제로 온 만큼 고치고, 안 온 품목은 0으로 두세요.</p>}
    </div>

    <div className="od-panel__actions">
      <div className="t-summary">
        <div><span>품목</span><span>{order.items.length}개</span></div>
        {receivable && <div><span>실입고일</span><input className="od-date" type="date" value={po.receiptDate} onChange={e => po.setReceiptDate(e.target.value)} /></div>}
        <div className="is-total"><span>주문 금액</span><span>{won(order.total_amount)}</span></div>
      </div>
      <button type="button" className="t-btn is-primary is-large is-block" disabled={po.busy || !receivable || thisTime === 0} onClick={() => void po.receive()}>
        {receivable ? `입고 확정 · ${thisTime}개 품목` : order.status === 'RECEIVED' ? '입고 완료된 발주서' : '입고할 수 없는 상태'}
      </button>
    </div>
  </div>
}
