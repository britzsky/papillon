import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  BUYER_LABEL, cancelMyOrder, CANCEL_REASON_LABEL, CLAIM_STATUS_LABEL, getMyOrder, getMyOrders, num, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, text, won, type BuyerType, type MyOrder, type Row,
} from '../../api/distShop'
import MallLayout from './MallLayout'
import './Mall.css'

type Filter = '' | 'ACTIVE' | 'DONE'
const FILTERS: Array<[Filter, string]> = [['ACTIVE', '진행 중'], ['DONE', '끝난 주문'], ['', '전체']]
const STEPS = ['주문', '결제·확정', '상품 준비', '배송', '배송 완료']
const STEP_OF: Record<string, number> = { PENDING_PAYMENT: 0, PAID: 1, PREPARING: 2, PARTIALLY_SHIPPED: 3, SHIPPED: 3, DELIVERED: 4, COMPLETED: 4 }
const TONE: Record<string, string> = { PENDING_PAYMENT: 'is-warn', PAID: 'is-info', PREPARING: 'is-info', SHIPPED: 'is-info', PARTIALLY_SHIPPED: 'is-info', DELIVERED: 'is-ok', COMPLETED: 'is-ok', CANCELED: 'is-done' }

const statusLabel = (order: Row) => {
  if (order.cancel_claim_status === 'REQUESTED' || order.cancel_claim_status === 'APPROVED') return '취소 요청 중'
  if (order.order_status === 'PAID' && order.payment_status === 'CREDIT') return '주문 확정(후불)'
  return ORDER_STATUS_LABEL[text(order.order_status)] ?? text(order.order_status)
}

/**
 * 더채움몰 › 내 주문(2026-11-02). 로그인한 사람이 주문한 것만 보인다(같은 거래처의 다른 사람 주문도 안 보임).
 * 입금 안내·배송조회(택배사 조회 페이지 링크)·취소: 입금 전·후불은 바로 취소, 입금 확인된 주문은 취소 요청(본사가 환불).
 */
export default function MallOrders() {
  const { orderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const placed = (location.state as { placed?: string } | null)?.placed
  const [filter, setFilter] = useState<Filter>('ACTIVE')
  const [orders, setOrders] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [revision, setRevision] = useState(0)
  const [detail, setDetail] = useState<MyOrder | null>(null)
  const [message, setMessage] = useState(placed ?? '')
  const [failed, setFailed] = useState(false)
  const selected = orderId ? Number(orderId) : null

  useEffect(() => {
    let alive = true
    getMyOrders(filter).then(result => { if (alive) { setOrders(result.orders); setLoaded(true) } })
      .catch(error => { if (alive) { setFailed(true); setMessage(error instanceof Error ? error.message : '주문 내역을 불러오지 못했습니다.') } })
    return () => { alive = false }
  }, [filter, revision])
  useEffect(() => {
    if (!selected) return
    let alive = true
    getMyOrder(selected).then(result => { if (alive) setDetail(result) })
      .catch(error => { if (alive) { setDetail(null); setFailed(true); setMessage(error instanceof Error ? error.message : '주문을 불러오지 못했습니다.') } })
    return () => { alive = false }
  }, [selected, revision])

  const shown = selected && detail && Number(detail.order.order_id) === selected ? detail : null
  const afterCancel = (text: string) => { setFailed(false); setMessage(text); setRevision(value => value + 1) }

  return <MallLayout>
    <div className="rd rd-page mall mall-wrap mall-sub">
      <header className="mall-head">
        <div><h1 className="rd-h1">내 주문</h1><p className="rd-muted">내가 주문한 것만 보입니다. 입금 안내·배송조회·취소를 여기서 합니다.</p></div>
        <Link to="/mall" className="rd-btn">상품 보기</Link>
      </header>
      {message ? <p className={`mall-msg${failed ? ' is-error' : ''}`} role={failed ? 'alert' : 'status'}>{message}</p> : null}
      <div className="mall-orders">
        <section className="rd-card mall-section mall-orders__list" aria-labelledby="mall-orders-title">
          <h2 className="rd-sr-only" id="mall-orders-title">주문 목록</h2>
          <div className="mall-chips" role="group" aria-label="주문 구분">
            {FILTERS.map(([key, label]) => <button key={label} type="button" className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          {loaded && orders.length === 0 ? <p className="mall-empty-line">{filter === 'ACTIVE' ? '진행 중인 주문이 없습니다.' : '주문이 없습니다.'} <Link to="/mall">상품 보러 가기</Link></p> : null}
          <ul className="mall-order-list">
            {orders.map(order => {
              const id = Number(order.order_id)
              return <li key={id}>
                <button type="button" className={`mall-order-row${selected === id ? ' is-selected' : ''}`} aria-current={selected === id ? 'true' : undefined}
                  onClick={() => { setMessage(''); navigate(`/mall/orders/${id}`) }}>
                  {order.image_url ? <img src={text(order.image_url)} alt="" /> : <span className="mall-thumb" aria-hidden="true" />}
                  <span className="mall-order-row__text">
                    <b>{text(order.first_item_name)}{order.first_item_option ? ` ${text(order.first_item_option)}` : ''}{Number(order.item_count) > 1 ? ` 외 ${Number(order.item_count) - 1}건` : ''}</b>
                    <small className="rd-muted">{text(order.ordered_at)} · {text(order.order_no)} · {BUYER_LABEL[text(order.buyer_type) as BuyerType] ?? ''}</small>
                  </span>
                  <span className="mall-order-row__side">
                    <span className={`rd-chip ${TONE[text(order.order_status)] ?? ''}`}>{statusLabel(order)}</span>
                    <b>{won(order.total_amount)}</b>
                  </span>
                </button>
              </li>
            })}
          </ul>
        </section>

        <section className="rd-card mall-section mall-orders__detail" aria-label="주문 상세">
          {!selected ? <p className="mall-empty-line">왼쪽에서 주문을 고르세요.</p> : !shown ? <p className="mall-empty-line" role="status">불러오는 중…</p> :
            <OrderDetail data={shown} onCanceled={afterCancel} onError={text => { setFailed(true); setMessage(text) }} />}
        </section>
      </div>
    </div>
  </MallLayout>
}

function OrderDetail({ data, onCanceled, onError }: { data: MyOrder; onCanceled: (message: string) => void; onError: (message: string) => void }) {
  const { order, recipient, items, payments, shipments, tracking_events: events, history, claims, cancel } = data
  const canceled = order.order_status === 'CANCELED'
  const step = STEP_OF[text(order.order_status)] ?? 0
  const payment = payments[payments.length - 1]
  const dialog = useRef<HTMLDialogElement>(null)
  const [reasonCode, setReasonCode] = useState('CHANGE_MIND')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const submitCancel = async () => {
    setBusy(true)
    try {
      const result = await cancelMyOrder(Number(order.order_id), reasonCode, reason)
      dialog.current?.close()
      onCanceled(result.message ?? '주문을 취소했습니다.')
    } catch (error) {
      dialog.current?.close()
      onError(error instanceof Error ? error.message : '주문을 취소하지 못했습니다.')
    } finally { setBusy(false) }
  }

  return <div className="mall-detail">
    <div className="mall-detail__head">
      <div><h2 className="rd-h2">주문 {text(order.order_no)}</h2><small className="rd-muted">{text(order.ordered_at)} · {BUYER_LABEL[text(order.buyer_type) as BuyerType]}{order.account_name ? ` (${text(order.account_name)})` : ''}</small></div>
      <span className={`rd-chip ${TONE[text(order.order_status)] ?? ''}`}>{statusLabel({ ...order, cancel_claim_status: claims.find(row => row.claim_type === 'CANCEL')?.status })}</span>
    </div>

    {canceled ? <p className="mall-msg">취소된 주문입니다{order.canceled_at ? ` (${text(order.canceled_at)})` : ''}.</p> :
      <ol className="mall-steps" aria-label="진행 단계">{STEPS.map((label, index) =>
        <li key={label} className={index < step ? 'is-done' : index === step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}>{label}</li>)}</ol>}

    {payment ? <section className="mall-box" aria-labelledby="mall-pay-head">
      <h3 id="mall-pay-head">결제</h3>
      {payment.status === 'WAITING_DEPOSIT' && !canceled ? <div className="mall-deposit">
        <p><b>{won(payment.amount)}</b>을 아래 계좌로 입금해 주세요. 입금이 확인되면 상품 준비가 시작됩니다.</p>
        <dl className="mall-dl">
          <div><dt>입금 계좌</dt><dd><b>{text(payment.bank_name)} {text(payment.deposit_account_no)}</b></dd></div>
          <div><dt>입금자명</dt><dd>{text(payment.depositor_name)} <small className="rd-muted">(다르면 확인이 늦어집니다)</small></dd></div>
          <div><dt>입금 기한</dt><dd>{text(payment.deposit_due_at)}</dd></div>
        </dl>
      </div> : <dl className="mall-dl">
        <div><dt>방법</dt><dd>{PAYMENT_METHOD_LABEL[text(payment.payment_method)] ?? text(payment.payment_method)}</dd></div>
        <div><dt>상태</dt><dd>{payment.payment_method === 'CREDIT' && payment.status === 'READY' ? '월말 청구서에 포함 예정' : PAYMENT_STATUS_LABEL[text(payment.status)] ?? text(payment.status)}</dd></div>
        {payment.paid_at ? <div><dt>결제일</dt><dd>{text(payment.paid_at)}</dd></div> : null}
      </dl>}
    </section> : null}

    <section className="mall-box" aria-labelledby="mall-items-head">
      <h3 id="mall-items-head">상품</h3>
      <ul className="mall-lines is-compact">{items.map(item => <li key={text(item.order_item_id)}>
        {item.image_url ? <img src={text(item.image_url)} alt="" /> : <span className="mall-thumb" aria-hidden="true" />}
        <div className="mall-lines__name"><b>{text(item.product_name)}{item.option_name ? ` ${text(item.option_name)}` : ''}</b>
          <small className="rd-muted">{text(item.partner_name)} · {won(item.unit_price)} × {num(item.qty)}{item.item_status === 'CANCELED' ? ' · 취소' : ''}</small></div>
        <b className="mall-lines__amount">{won(item.amount)}</b>
      </li>)}</ul>
      <dl className="mall-dl">
        <div><dt>상품 합계</dt><dd>{won(order.item_amount)}</dd></div>
        <div><dt>배송비</dt><dd>{won(order.shipping_fee)}</dd></div>
        <div className="is-total"><dt>합계</dt><dd>{won(order.total_amount)}</dd></div>
      </dl>
    </section>

    <section className="mall-box" aria-labelledby="mall-ship-head">
      <h3 id="mall-ship-head">배송</h3>
      {shipments.length === 0 ? <p className="rd-muted">{canceled ? '배송하지 않습니다.' : '아직 출고 전입니다. 송장이 등록되면 여기서 배송조회를 할 수 있습니다.'}</p> :
        <ul className="mall-shipments">{shipments.map(row => <li key={text(row.shipment_id)}>
          <div><b>{text(row.carrier_name) || '택배'} {text(row.tracking_no)}</b> <span className="rd-chip is-info">{SHIPMENT_STATUS_LABEL[text(row.status)] ?? text(row.status)}</span></div>
          {row.item_summary ? <small className="rd-muted">{text(row.item_summary)}</small> : null}
          {row.tracking_url ? <a className="rd-btn" href={text(row.tracking_url)} target="_blank" rel="noopener noreferrer">배송조회<span className="rd-sr-only"> (새 창)</span></a> : null}
          {events.filter(event => event.shipment_id === row.shipment_id).length ? <ol className="mall-events">{events.filter(event => event.shipment_id === row.shipment_id).map((event, index) =>
            <li key={index}><time>{text(event.event_at)}</time> {text(event.event_description) || SHIPMENT_STATUS_LABEL[text(event.event_status)]} {event.event_location ? <small className="rd-muted">· {text(event.event_location)}</small> : null}</li>)}</ol> : null}
        </li>)}</ul>}
    </section>

    <section className="mall-box" aria-labelledby="mall-addr-head">
      <h3 id="mall-addr-head">주문자·배송지</h3>
      <dl className="mall-dl">
        <div><dt>주문자</dt><dd>{text(order.orderer_name)} · {text(order.orderer_phone)}</dd></div>
        <div><dt>받는 분</dt><dd>{text(recipient.name)} · {text(recipient.phone)}</dd></div>
        <div><dt>주소</dt><dd>({text(recipient.zipcode)}) {text(recipient.address1)} {text(recipient.address2)}</dd></div>
        {recipient.delivery_request ? <div><dt>배송 요청</dt><dd>{text(recipient.delivery_request)}</dd></div> : null}
        {order.request_note ? <div><dt>요청사항</dt><dd>{text(order.request_note)}</dd></div> : null}
      </dl>
    </section>

    {claims.length ? <section className="mall-box" aria-labelledby="mall-claim-head">
      <h3 id="mall-claim-head">취소·반품</h3>
      <ul className="mall-history">{claims.map(claim => <li key={text(claim.claim_id)}>{text(claim.requested_at)} · {claim.claim_type === 'CANCEL' ? '취소' : text(claim.claim_type)} {CLAIM_STATUS_LABEL[text(claim.status)] ?? text(claim.status)}
        {claim.reason_detail ? ` · ${text(claim.reason_detail)}` : ''}{Number(claim.refund_amount) > 0 ? ` · 환불 ${won(claim.refund_amount)}` : ''}{claim.reject_reason ? ` · 거절 사유: ${text(claim.reject_reason)}` : ''}</li>)}</ul>
    </section> : null}

    <details className="mall-box"><summary>진행 기록</summary>
      <ul className="mall-history">{history.map((row, index) => <li key={index}>{text(row.changed_at)} · {ORDER_STATUS_LABEL[text(row.to_status)] ?? PAYMENT_STATUS_LABEL[text(row.to_status)] ?? text(row.to_status)}{row.reason ? ` · ${text(row.reason)}` : ''}</li>)}</ul>
    </details>

    <div className="mall-detail__actions">
      {cancel.mode === 'NONE' ? (cancel.reason && !canceled ? <p className="rd-muted rd-fs-sm">{cancel.reason}</p> : null) :
        <button type="button" className="rd-btn" onClick={() => dialog.current?.showModal()}>{cancel.mode === 'IMMEDIATE' ? '주문 취소' : '취소 요청'}</button>}
    </div>

    <dialog ref={dialog} className="mall-dialog is-small" aria-labelledby="mall-cancel-title">
      <form className="mall-dialog__body rd" method="dialog" onSubmit={event => { event.preventDefault(); void submitCancel() }}>
        <h2 className="rd-h2" id="mall-cancel-title">{cancel.mode === 'IMMEDIATE' ? '주문을 취소할까요?' : '취소를 요청할까요?'}</h2>
        <p className="rd-muted">{cancel.mode === 'IMMEDIATE' ? '아직 돈이 오가지 않은 주문이라 바로 취소됩니다.' : '입금이 확인된 주문입니다. 본사가 확인한 뒤 입금하신 금액을 환불해 드립니다.'}</p>
        <fieldset className="mall-reasons"><legend>취소 사유</legend>
          {Object.entries(CANCEL_REASON_LABEL).map(([key, label]) => <label key={key} className="mall-check"><input type="radio" name="mall-cancel-reason" checked={reasonCode === key} onChange={() => setReasonCode(key)} />{label}</label>)}
        </fieldset>
        <label className="mall-field is-wide"><span>자세한 사유(선택)</span><input className="rd-input" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="mall-detail__actions">
          <button type="button" className="rd-btn" onClick={() => dialog.current?.close()}>닫기</button>
          <button type="submit" className="rd-btn is-primary" disabled={busy}>{busy ? '처리 중…' : cancel.mode === 'IMMEDIATE' ? '주문 취소' : '취소 요청'}</button>
        </div>
      </form>
    </dialog>
  </div>
}
