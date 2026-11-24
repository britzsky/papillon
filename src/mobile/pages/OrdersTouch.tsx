import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { ORDER_STATUS_LABELS, RECEIVABLE_STATUSES, UNCERTAIN_STATUSES, closedByShortage, daysAgo, usePurchaseOrders, remainingQty, type OrderItem, type PurchaseOrder } from '../../features/order/usePurchaseOrders'
import { PENDING_LABELS, useReceivingPending } from '../../features/order/useReceivingPending'
import { SHORTAGE_SOURCES, deliveryLabel, type ShortageSource } from '../../api/receiving'
import './OrdersTouch.css'
import FavoriteProductHeart from '../../components/FavoriteProductHeart'
import TouchSelect from '../TouchSelect'
import { confirmDialog } from '../../utils/dialog'
import PurchaseOrderManager from '../../pages/order/PurchaseOrderManager'

/** 태블릿(700px 이상) 여부 — 화면을 열 때 한 번만(deviceMode와 같은 원칙) */
const IS_TABLET = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 700px)').matches)

const qty = (value?: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const won = (value?: number) => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`
// 남은 수량 = 주문 − 입고 − 결품(공용 계산)
const remaining = (item: OrderItem) => remainingQty(item)

type Group = 'all' | 'wait' | 'check' | 'done'
// 남은 품목을 모두 결품으로 닫은 발주서는 '입고 완료'로 센다
const GROUPS: { key: Group; label: string; icon: TouchIconName; match?: (order: PurchaseOrder) => boolean }[] = [
  { key: 'all', label: '전체', icon: 'order' },
  { key: 'wait', label: '입고 대기', icon: 'truck', match: o => RECEIVABLE_STATUSES.includes(o.status) && !closedByShortage(o) },
  { key: 'check', label: '확인 필요', icon: 'alert', match: o => [...UNCERTAIN_STATUSES, 'FAILED'].includes(o.status) },
  { key: 'done', label: '입고 완료', icon: 'check', match: o => o.status === 'RECEIVED' || closedByShortage(o) },
]
const DELIVERY_ORDER: Record<string, number> = { CENTER: 0, DIRECT: 1, PARCEL: 2 }
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
  // 2026-11-23 사용자 결정: 태블릿 발주서·입고 = 브라우저 디자인(PC 본문을 태블릿 틀에). 휴대폰은 아래 터치 화면 그대로
  return IS_TABLET ? <PurchaseOrderManager shell="tablet" /> : <PhoneOrders />
}

function PhoneOrders() {
  const [params, setParams] = useSearchParams()
  const [accountId, setAccountId] = useState(() => params.get('account_id') || localStorage.getItem('account_id') || '')
  const focusedId = params.get('purchase_order_id') || ''
  const po = usePurchaseOrders(accountId, focusedId)
  const [group, setGroup] = useState<Group>('all')
  const [period, setPeriod] = useState(30)

  const counts = useMemo(() => Object.fromEntries(GROUPS.map(g => [g.key, g.match ? po.orders.filter(g.match).length : po.orders.length])) as Record<Group, number>, [po.orders])
  const match = GROUPS.find(g => g.key === group)?.match
  const shown = match ? po.orders.filter(match) : po.orders
  // 안 들어온 품목(배송 대기·결품 확인 필요·웰스토리 미입 등록) — PC와 공용
  const { pending, error: pendingError, attention } = useReceivingPending(accountId, po.orders)
  const openPending = (orderId: string) => { const found = po.orders.find(o => o.purchase_order_id === orderId); if (found) po.selectOrder(found); else setParams({ account_id: accountId, purchase_order_id: orderId }) }

  const choosePeriod = (days: number) => { setPeriod(days); po.setFrom(daysAgo(days)); po.setTo(new Date().toLocaleDateString('sv-SE')); po.setOffset(0) }

  const toolbar = <>
    <div className="t-segment" role="group" aria-label="조회 기간">
      {PERIODS.map(days => <button key={days} type="button" className={period === days ? 'is-active' : ''} disabled={Boolean(focusedId)} onClick={() => choosePeriod(days)}>최근 {days}일</button>)}
    </div>
    <button type="button" className="t-btn is-icon" aria-label="새로고침" disabled={po.busy} onClick={() => void po.load()}><TouchIcon name="refresh" /></button>
  </>

  return <TouchLayout title="발주서 · 입고" subtitle={accountId ? `${po.orders.length}건` : undefined} toolbar={toolbar}
    aside={<OrderPanel po={po} accountId={accountId} />} onAccountChange={value => { setAccountId(value); po.selectOrder(null) }}>
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

    {accountId && attention.length > 0 && <div className="t-msg is-warn od-pending" role="region" aria-label="안 들어온 품목">
      <strong>안 들어온 품목 {(['CHECK_NEEDED', 'SUPPLIER_REPORTED', 'WAITING'] as const).filter(s => pending?.counts[s]).map(s => `${PENDING_LABELS[s]} ${pending?.counts[s]}`).join(' · ')}</strong>
      <ul>{attention.slice(0, 10).map(item => <li key={item.purchase_order_item_id}>
        <span><b>{PENDING_LABELS[item.state]}</b> {item.product_name} {qty(item.remaining_qty)}{item.order_unit} · {item.supplier_name} · {item.delivery_date.slice(5).replace('-', '.')} 납품 · {item.delivery_type_label}
          {item.supplier_situations.some(s => s.action_note) ? ` · ${item.supplier_situations.map(s => s.action_note).filter(Boolean).join(', ')}` : ''}</span>
        <button type="button" className="t-btn is-small" onClick={() => openPending(item.purchase_order_id)}>발주서</button>
      </li>)}</ul>
      <small>센터 배송·직송은 납품 다음 날, 택배는 이틀 뒤부터 확인 필요로 바뀝니다.</small>
    </div>}
    {pendingError && <p className="t-msg is-error">{pendingError}</p>}
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
function OrderPanel({ po, accountId }: { po: ReturnType<typeof usePurchaseOrders>; accountId: string }) {
  const order: PurchaseOrder | null = po.selected
  if (!order) return <div className="od-panel">
    <div className="od-panel__head"><h2>입고 확정</h2><p>왼쪽에서 발주서를 고르면 품목과 입고 수량이 여기에 나옵니다.</p></div>
  </div>

  const closed = closedByShortage(order)
  const receivable = RECEIVABLE_STATUSES.includes(order.status) && !closed
  const uncertain = UNCERTAIN_STATUSES.includes(order.status)
  const thisTime = order.items.filter(item => Number(po.receiptQuantity(item)) > 0).length
  const shortageCount = po.shortageLines(order).length
  // 배송 구분이 둘 이상이면 묶음별로(직송·택배는 센터 배송과 따로 온다)
  const groupKey = (item: OrderItem) => item.delivery_type || ''
  const rows = [...order.items].sort((a, b) => (DELIVERY_ORDER[groupKey(a)] ?? 3) - (DELIVERY_ORDER[groupKey(b)] ?? 3))
  const grouped = new Set(rows.map(groupKey)).size > 1
  const form = po.shortageForm
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
        {rows.map((item, index) => {
          const left = remaining(item), shortage = Number(item.shortage_order_qty || 0), over = receivable ? po.leftoverQty(item) : 0
          const groupStart = grouped && (index === 0 || groupKey(rows[index - 1]) !== groupKey(item))
          const groupItems = groupStart ? rows.filter(r => groupKey(r) === groupKey(item)) : []
          return <Fragment key={item.client_ord_item}>
          {groupStart && <li className="od-items__group">
            <span><b>{deliveryLabel(item.delivery_type)}</b> {groupItems.length}품목{item.delivery_type && item.delivery_type !== 'CENTER' ? ' · 따로 올 수 있어요' : ''}</span>
            {receivable && <button type="button" className="t-btn is-small" disabled={po.busy} onClick={() => groupItems.forEach(r => po.setReceiptQuantity(r, '0'))}>아직 안 옴</button>}
          </li>}
          <li className={left === 0 ? 'is-done' : ''}>
            <div className="od-items__name">
              <strong>{item.product_name}<FavoriteProductHeart accountId={accountId} supplierProductId={item.supplier_product_id} productName={item.product_name} favorite={item.favorite_yn === 'Y'} /></strong>
              <small>주문 {qty(item.order_qty)} · 입고 {qty(item.received_order_qty)}{shortage > 0 ? ` · 결품 ${qty(shortage)}` : ''} · 남음 {qty(left)} {item.order_unit}</small>
              {shortage > 0 && <span className="od-items__shortage"><span className="t-badge is-danger">결품 {qty(shortage)}</span>
                <button type="button" className="t-btn is-small" disabled={po.busy} onClick={async () => { if (await confirmDialog(`${item.product_name} 결품을 취소할까요? 남은 수량이 다시 입고 예정으로 돌아갑니다.`)) void po.cancelShortage(item) }}>결품 취소</button></span>}
              {over > 0 && <div className="t-segment od-items__left" role="group" aria-label={`${item.product_name} 남는 ${qty(over)}${item.order_unit} 처리`}>
                <span>남는 {qty(over)}{item.order_unit}</span>
                <button type="button" className={po.leftoverChoice(item) === 'WAIT' ? 'is-active' : ''} onClick={() => po.setLeftoverChoice(item, 'WAIT')}>배송 대기</button>
                <button type="button" className={po.leftoverChoice(item) === 'SHORTAGE' ? 'is-active' : ''} onClick={() => po.setLeftoverChoice(item, 'SHORTAGE')}>결품</button>
              </div>}
              {item.supplier_error_message && <small className="od-items__error">사유: {item.supplier_error_message}</small>}
              {!po.needsIngredient(item)
                ? <small>재고 식재료: {item.ingredient_name || item.ingredient_id}</small>
                : receivable && left > 0 ? <TouchSelect className="t-input od-items__ingredient" aria-label={`${item.product_name} 재고에 넣을 식재료`} value={po.receiptChoice(item).ingredient_id} disabled={po.busy}
                  onChange={e => po.setReceiptChoice(item, { ingredient_id: e.target.value })}>
                  <option value="">재고에 넣을 식재료 선택</option>
                  {po.ingredients.map(row => <option key={row.ingredient_id} value={row.ingredient_id}>{row.ingredient_name}{row.base_unit ? ` (${row.base_unit})` : ''}</option>)}
                </TouchSelect> : null}
            </div>
            {receivable && left > 0
              ? <div className="od-items__qty">
                <button type="button" className="t-round" aria-label="1 줄이기" disabled={po.busy} onClick={() => bump(item, -1)}>−</button>
                <input type="text" inputMode="decimal" aria-label={`${item.product_name} 이번 입고수량`} value={po.receiptQuantity(item)} disabled={po.busy}
                  onChange={e => po.setReceiptQuantity(item, e.target.value.replace(/[^0-9.]/g, ''))} />
                <button type="button" className="t-round" aria-label="1 늘리기" disabled={po.busy} onClick={() => bump(item, 1)}>+</button>
              </div>
              : <span className={`t-badge ${left === 0 ? (shortage > 0 && Number(item.received_order_qty) === 0 ? 'is-danger' : 'is-ok') : ''}`}>{left === 0 ? (shortage > 0 && Number(item.received_order_qty) === 0 ? '결품' : '입고 완료') : ORDER_STATUS_LABELS[item.item_status] || item.item_status}</span>}
          </li></Fragment>
        })}
      </ul>
      {receivable && <p className="od-hint">남은 수량이 미리 들어가 있습니다. 실제로 온 만큼 고치고, 남는 수량은 배송 대기(나중에 옴) 또는 결품(안 옴)을 고르세요.</p>}
      {receivable && shortageCount > 0 && <div className="od-shortage" aria-label="결품 확정">
        <strong>결품 {shortageCount}품목 · 입고 예정·재고·금액에서 빠집니다</strong>
        <TouchSelect className="t-input" aria-label="누가 알렸나" value={form.source} onChange={e => po.setShortageForm({ ...form, source: e.target.value as ShortageSource })}>
          {SHORTAGE_SOURCES.filter(s => s.value !== 'SUPPLIER_SITUATION' || order.supplier_code === 'WELSTORY').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </TouchSelect>
        <input className="t-input" aria-label="결품 사유" maxLength={300} placeholder="사유 (예: 산지 수급 불가)" value={form.reason} onChange={e => po.setShortageForm({ ...form, reason: e.target.value })} />
        <input className="t-input" aria-label="공급사 담당자" maxLength={50} placeholder="통화한 공급사 담당자(선택)" value={form.contact_name} onChange={e => po.setShortageForm({ ...form, contact_name: e.target.value })} />
      </div>}
      {po.shortageNotice?.orderId === order.purchase_order_id && <div className="od-notice-copy" aria-label="공급사 전달 문구">
        <strong>공급사에 전달할 문구</strong>
        <small>{order.supplier_code === 'WELSTORY' ? '웰스토리는 결품 등록 API가 없어요 · CRM 담당자에게 보내면 등록 여부를 상황 조회로 확인해요' : '아워홈은 결품 등록 API가 없어요 · 담당자에게 보내 주세요'}</small>
        <textarea className="t-input" readOnly rows={6} value={po.shortageNotice.text} />
        <span><button type="button" className="t-btn is-small" onClick={() => void navigator.clipboard?.writeText(po.shortageNotice?.text || '')}>복사</button> <button type="button" className="t-btn is-small" onClick={() => po.setShortageNotice(null)}>닫기</button></span>
      </div>}
    </div>

    <div className="od-panel__actions">
      <div className="t-summary">
        <div><span>품목</span><span>{order.items.length}개</span></div>
        {receivable && <div><span>실입고일</span><input className="od-date" type="date" value={po.receiptDate} onChange={e => po.setReceiptDate(e.target.value)} /></div>}
        <div className="is-total"><span>주문 금액</span><span>{won(order.total_amount)}</span></div>
      </div>
      {/* 2026-10-29 검수: 공급사 발주서별 검수완료 뒤에만 입고 확정(PC와 같음) */}
      {receivable && !order.inspected_at ? <button type="button" className="t-btn is-primary is-large is-block" disabled={po.busy} onClick={() => void po.inspect(true)}>검수완료 · 물건 확인함</button> : null}
      {receivable && order.inspected_at ? <button type="button" className="t-btn is-small" disabled={po.busy} onClick={async () => { if ((await confirmDialog(`${order.supplier_name} 검수완료를 취소할까요?`))) void po.inspect(false) }}>검수 취소 (검수완료 {String(order.inspected_at).replace('T', ' ').slice(5, 16)})</button> : null}
      {receivable && shortageCount > 0 && thisTime > 0 && !order.inspected_at ? <button type="button" className="t-btn is-block" disabled={po.busy} onClick={() => void po.receive(true)}>결품만 확정 · {shortageCount}개 품목</button> : null}
      <button type="button" className="t-btn is-primary is-large is-block" disabled={po.busy || !receivable || (thisTime > 0 && !order.inspected_at) || (thisTime === 0 && shortageCount === 0)} onClick={() => void po.receive()}>
        {!receivable ? closed ? '결품으로 마감된 발주서' : order.status === 'RECEIVED' ? '입고 완료된 발주서' : '입고할 수 없는 상태'
          : thisTime === 0 && shortageCount > 0 ? `결품 확정 · ${shortageCount}개 품목`
          : !order.inspected_at ? '검수완료 후 입고'
          : shortageCount > 0 ? `입고 ${thisTime}개 + 결품 ${shortageCount}개 확정` : `입고 확정 · ${thisTime}개 품목`}
      </button>
    </div>
  </div>
}
