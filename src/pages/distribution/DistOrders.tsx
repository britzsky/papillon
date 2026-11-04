import { useCallback, useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getPartners, text, won, qty, type Row } from '../../api/distAdmin'
import {
  addShipment, approveCancelClaim, cancelOrderByHq, confirmDeposit, confirmPurchaseOrder, createPurchaseOrder, getAdminOrder, getAdminOrders, HQ_CANCEL_REASON_LABEL,
  ITEM_STATUS_LABEL, markDelivered, PO_STATUS_LABEL, prepareOwnStock, rejectCancelClaim, saveOrderNote, TX_LABEL, WORK_LABEL, type AdminOrder, type OrderQuery, type WorkKey,
} from '../../api/distOrders'
import { BUYER_LABEL, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, CLAIM_STATUS_LABEL, CANCEL_REASON_LABEL, type BuyerType } from '../../api/distShop'
import { Notice } from './DistFields'
import { runAction } from './distActions'
import './DistAdmin.css'

const STATUS_TONE: Record<string, string> = { PENDING_PAYMENT: 'is-warn', PAID: 'is-info', PREPARING: 'is-info', PARTIALLY_SHIPPED: 'is-info', SHIPPED: 'is-info', DELIVERED: 'is-ok', COMPLETED: 'is-ok', CANCELED: 'is-done' }
const WORK_KEYS: WorkKey[] = ['need_deposit', 'need_po', 'need_invoice', 'cancel_requested']
const isOn = (value: unknown) => value === true || value === 1 || value === '1'

/**
 * 협력사 관리 › 주문 관리(본사 전용, 2026-11-02 3단계). 위 일감(입금 확인·발주서·송장·취소 요청)을 눌러 해야 할 주문만 본다.
 * 오른쪽에서 입금 확인 → 협력사 발주서(전달 후 협력사 확인) / 자사재고 출고 준비 → 송장 → 배송 완료, 출고 전 취소·환불.
 * 은행 입금 통지·택배 연동·발주서 자동 전송은 업체를 정한 뒤 — 지금은 본사가 확인해서 누른다.
 */
export default function DistOrders() {
  const [query, setQuery] = useState<OrderQuery>({})
  const [keyword, setKeyword] = useState('')
  const [orders, setOrders] = useState<Row[]>([])
  const [work, setWork] = useState<Record<string, number>>({})
  const [partners, setPartners] = useState<Row[]>([])
  const [carriers, setCarriers] = useState<Row[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminOrder | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const notice = useCallback((value: string, isError: boolean) => { setMessage(value); setFailed(isError) }, [])

  useEffect(() => {
    getPartners().then(result => { setPartners(result.partners); setCarriers(result.carriers) }).catch(() => undefined)
  }, [])
  useEffect(() => {
    let alive = true
    getAdminOrders(query).then(result => { if (alive) { setOrders(result.orders); setWork(result.work ?? {}) } })
      .catch(error => { if (alive) notice(error instanceof Error ? error.message : '주문 목록을 불러오지 못했습니다.', true) })
    return () => { alive = false }
  }, [query, revision, notice])
  useEffect(() => {
    if (!selected) return
    let alive = true
    getAdminOrder(selected).then(result => { if (alive) setDetail(result) })
      .catch(error => { if (alive) notice(error instanceof Error ? error.message : '주문을 불러오지 못했습니다.', true) })
    return () => { alive = false }
  }, [selected, revision, notice])

  const act = async (action: () => Promise<unknown>) => { if (await runAction(setBusy, notice, action)) setRevision(value => value + 1) }
  const shown = detail && Number(detail.order.order_id) === selected ? detail : null

  return <div className="dist-page"><SideMenuLayout header={<HeaderBar title="주문 관리" breadcrumbs={[{ label: '협력사 관리' }, { label: '주문 관리' }]} />}>
    <div className="rd rd-page dist-admin">
      <header className="rd-page__head"><div>
        <h1 className="rd-sr-only">주문 관리</h1>
        <p className="rd-muted">더채움몰의 모든 주문입니다. 위 일감을 눌러 처리할 주문만 볼 수 있습니다. 입금·송장·배송 완료는 지금은 확인 후 직접 눌러 주세요.</p>
      </div></header>
      <Notice message={message} failed={failed} />

      <div className="dist-work" role="group" aria-label="일감">
        {WORK_KEYS.map(key => <button key={key} type="button" className={`dist-work__tile${query.work === key ? ' is-active' : ''}${Number(work[key]) > 0 ? ' has-work' : ''}`}
          aria-pressed={query.work === key} onClick={() => setQuery(current => ({ ...current, work: current.work === key ? '' : key }))}>
          <span>{WORK_LABEL[key]}</span><b>{Number(work[key] ?? 0)}</b></button>)}
      </div>

      <div className="dist-split">
        <section className="rd-card dist-card dist-list" aria-labelledby="dist-orders-title">
          <form className="dist-filters" onSubmit={event => { event.preventDefault(); setQuery(current => ({ ...current, keyword: keyword.trim() })) }}>
            <select className="rd-input" aria-label="주문 상태" value={query.status ?? ''} onChange={event => setQuery(current => ({ ...current, status: event.target.value }))}>
              <option value="">상태 전체</option>
              {Object.entries(ORDER_STATUS_LABEL).filter(([key]) => key !== 'CANCEL_REQUESTED').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select className="rd-input" aria-label="구매 유형" value={query.buyer_type ?? ''} onChange={event => setQuery(current => ({ ...current, buyer_type: event.target.value }))}>
              <option value="">구매 유형 전체</option><option value="ACCOUNT">거래처 구매</option><option value="PERSONAL">개인 구매</option>
            </select>
            <select className="rd-input" aria-label="협력사" value={query.partner_id ?? ''} onChange={event => setQuery(current => ({ ...current, partner_id: event.target.value }))}>
              <option value="">협력사 전체</option>
              {partners.map(row => <option key={text(row.partner_id)} value={text(row.partner_id)}>{text(row.partner_name)}</option>)}
            </select>
            <input className="rd-input" type="date" aria-label="주문일 시작" value={query.from ?? ''} onChange={event => setQuery(current => ({ ...current, from: event.target.value }))} />
            <input className="rd-input" type="date" aria-label="주문일 끝" value={query.to ?? ''} onChange={event => setQuery(current => ({ ...current, to: event.target.value }))} />
            <input className="rd-input" type="search" aria-label="주문번호·거래처·상품 검색" placeholder="주문번호·거래처·상품" value={keyword} onChange={event => setKeyword(event.target.value)} />
            <button type="submit" className="rd-btn">검색</button>
          </form>
          <h2 className="rd-h2" id="dist-orders-title">주문 {orders.length}건{query.work ? ` · ${WORK_LABEL[query.work]}` : ''}</h2>
          <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="주문 목록">
            <table className="rd-table dist-table dist-orders-table">
              <thead><tr><th>주문</th><th>구매자</th><th>상품</th><th className="is-num">금액</th><th>상태</th></tr></thead>
              <tbody>
                {orders.length === 0 ? <tr><td colSpan={5} className="dist-empty">조건에 맞는 주문이 없습니다.</td></tr> : null}
                {orders.map(row => {
                  const id = Number(row.order_id)
                  return <tr key={id} className={selected === id ? 'is-selected' : ''}>
                    <td><button type="button" className="dist-row-link" onClick={() => { setSelected(id); notice('', false) }} aria-current={selected === id ? 'true' : undefined}>
                      <span><b className="dist-code">{text(row.order_no)}</b><small className="rd-muted">{text(row.ordered_at)}</small></span></button></td>
                    <td>{row.buyer_type === 'ACCOUNT' ? text(row.account_name) || text(row.account_id) : `${text(row.customer_name_masked)} (개인)`}<small className="rd-muted dist-block">{text(row.orderer_user_id)}</small></td>
                    <td>{text(row.first_item)}{Number(row.item_count) > 1 ? ` 외 ${Number(row.item_count) - 1}` : ''}<small className="rd-muted dist-block">{text(row.partner_names)}</small></td>
                    <td className="is-num">{won(row.total_amount)}<small className="rd-muted dist-block">{PAYMENT_METHOD_LABEL[text(row.payment_method)] ?? ''}</small></td>
                    <td><span className={`rd-chip ${STATUS_TONE[text(row.order_status)] ?? ''}`}>{ORDER_STATUS_LABEL[text(row.order_status)] ?? text(row.order_status)}</span>
                      <span className="dist-flags">{WORK_KEYS.filter(key => isOn(row[key])).map(key => <span key={key} className={`rd-chip ${key === 'cancel_requested' ? 'is-urgent' : 'is-warn'}`}>{WORK_LABEL[key]}</span>)}</span></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rd-card dist-card dist-detail" aria-label="주문 처리">
          {!selected ? <p className="dist-empty">왼쪽에서 주문을 고르세요.</p> : !shown ? <p className="dist-empty" role="status">불러오는 중…</p> :
            <OrderPanel key={selected} data={shown} carriers={carriers} busy={busy} act={act} />}
        </section>
      </div>
    </div>
  </SideMenuLayout></div>
}

function OrderPanel({ data, carriers, busy, act }: { data: AdminOrder; carriers: Row[]; busy: boolean; act: (action: () => Promise<unknown>) => Promise<void> }) {
  const { order, recipient, items, payments, transactions, purchase_orders: pos, purchase_order_items: poItems, shipments, claims, history, actions } = data
  const orderId = Number(order.order_id)
  const payment = payments[payments.length - 1]
  const paid = Number(order.paid_amount) > 0
  const [note, setNote] = useState(text(order.admin_note))
  const partnerName = (partnerId: number) => text(items.find(item => Number(item.partner_id) === partnerId)?.partner_name)

  return <div className="dist-order">
    <div className="dist-card__head">
      <div><h2 className="rd-h2">주문 {text(order.order_no)}</h2>
        <small className="rd-muted">{text(order.ordered_at)} · {BUYER_LABEL[text(order.buyer_type) as BuyerType]}{order.account_name ? ` · ${text(order.account_name)}` : ''} · 주문자 ID {text(order.orderer_user_id)}</small></div>
      <span className={`rd-chip ${STATUS_TONE[text(order.order_status)] ?? ''}`}>{ORDER_STATUS_LABEL[text(order.order_status)] ?? text(order.order_status)}</span>
    </div>

    <section className="dist-box" aria-labelledby="dist-o-ship-to">
      <h3 id="dist-o-ship-to">주문자·배송지</h3>
      <dl className="dist-dl">
        <div><dt>주문자</dt><dd>{text(order.orderer_name)} · {text(order.orderer_phone)}{order.orderer_email ? ` · ${text(order.orderer_email)}` : ''}</dd></div>
        <div><dt>받는 분</dt><dd>{text(recipient.name)} · {text(recipient.phone)}</dd></div>
        <div><dt>주소</dt><dd>({text(recipient.zipcode)}) {text(recipient.address1)} {text(recipient.address2)}</dd></div>
        {recipient.delivery_request ? <div><dt>배송 요청</dt><dd>{text(recipient.delivery_request)}</dd></div> : null}
        {order.request_note ? <div><dt>요청사항</dt><dd>{text(order.request_note)}</dd></div> : null}
      </dl>
      <div className="dist-inline">
        <input className="rd-input dist-url" aria-label="본사 메모" placeholder="본사 메모(주문자에게는 안 보임)" maxLength={1000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
        <button type="button" className="rd-btn" disabled={busy || note === text(order.admin_note)} onClick={() => void act(() => saveOrderNote(orderId, note))}>메모 저장</button>
      </div>
    </section>

    <section className="dist-box" aria-labelledby="dist-o-pay">
      <h3 id="dist-o-pay">결제</h3>
      <dl className="dist-dl">
        <div><dt>금액</dt><dd><b>{won(order.total_amount)}</b> (상품 {won(order.item_amount)} + 배송비 {won(order.shipping_fee)})</dd></div>
        {payment ? <div><dt>방법·상태</dt><dd>{PAYMENT_METHOD_LABEL[text(payment.payment_method)]} · {PAYMENT_STATUS_LABEL[text(payment.status)] ?? text(payment.status)}</dd></div> : null}
        {payment?.payment_method === 'BANK_TRANSFER' ? <div><dt>입금 안내</dt><dd>{text(payment.bank_name)} {text(payment.deposit_account_no)} · 입금자 {text(payment.depositor_name)} · 기한 {text(payment.deposit_due_at)}</dd></div> : null}
        {paid ? <div><dt>받은 금액</dt><dd>{won(order.paid_amount)}{Number(order.refunded_amount) > 0 ? ` · 환불 ${won(order.refunded_amount)}` : ''}</dd></div> : null}
      </dl>
      {actions.confirm_deposit ? <DepositForm amount={text(payment?.amount)} depositor={text(payment?.depositor_name)} busy={busy} onSubmit={body => act(() => confirmDeposit(orderId, body))} /> : null}
    </section>

    <section className="dist-box" aria-labelledby="dist-o-items">
      <h3 id="dist-o-items">상품</h3>
      <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="주문 상품">
        <table className="rd-table dist-table">
          <thead><tr><th>상품</th><th>협력사·출고</th><th className="is-num">수량</th><th className="is-num">출고</th><th className="is-num">금액</th><th className="is-num">매입가</th><th>상태</th></tr></thead>
          <tbody>{items.map(item => <tr key={text(item.order_item_id)} className={item.item_status === 'CANCELED' ? 'is-off' : ''}>
            <td><b>{text(item.product_name)}</b>{item.option_name ? ` ${text(item.option_name)}` : ''}<small className="rd-muted dist-block dist-code">{text(item.product_code)}</small></td>
            <td>{text(item.partner_name)}<small className="rd-muted dist-block">{item.fulfillment_type === 'DROP_SHIP' ? '협력사 직송' : '자사재고'}</small></td>
            <td className="is-num">{qty(item.qty)}{Number(item.canceled_qty) > 0 ? <small className="rd-muted dist-block">취소 {qty(item.canceled_qty)}</small> : null}</td>
            <td className="is-num">{qty(item.shipped_qty)}</td>
            <td className="is-num">{won(item.amount)}</td>
            <td className="is-num">{won(item.unit_cost)}</td>
            <td>{ITEM_STATUS_LABEL[text(item.item_status)] ?? text(item.item_status)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="dist-box" aria-labelledby="dist-o-po">
      <h3 id="dist-o-po">협력사 발주·출고 준비</h3>
      {actions.po_partner_ids.length === 0 && pos.length === 0 && !actions.prepare_own_stock ? <p className="rd-muted rd-fs-sm">{order.order_status === 'PENDING_PAYMENT' ? '입금을 확인하면 발주서를 만들 수 있습니다.' : '발주할 직송 상품이 없습니다.'}</p> : null}
      {actions.po_partner_ids.map(partnerId => <PurchaseOrderCreate key={partnerId} name={partnerName(Number(partnerId))} busy={busy}
        onSubmit={body => act(() => createPurchaseOrder(orderId, { ...body, partner_id: partnerId }))} />)}
      {actions.prepare_own_stock ? <div className="dist-inline"><span>자사재고 상품이 있습니다.</span>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => void act(() => prepareOwnStock(orderId))}>출고 준비로 표시</button>
        <small className="rd-muted">재고 차감은 재고 단계에서 붙습니다.</small></div> : null}
      {pos.map(po => <PurchaseOrderCard key={text(po.purchase_order_id)} po={po} lines={poItems.filter(line => line.purchase_order_id === po.purchase_order_id)} order={order} recipient={recipient}
        busy={busy} onConfirm={body => act(() => confirmPurchaseOrder(Number(po.purchase_order_id), body))} />)}
    </section>

    <section className="dist-box" aria-labelledby="dist-o-ship">
      <h3 id="dist-o-ship">송장·배송</h3>
      {shipments.length === 0 ? <p className="rd-muted rd-fs-sm">등록된 송장이 없습니다.</p> : <ul className="dist-shipments">{shipments.map(row => <li key={text(row.shipment_id)}>
        <div><b>{text(row.carrier_name)} {text(row.tracking_no)}</b> <span className={`rd-chip ${row.status === 'DELIVERED' ? 'is-ok' : 'is-info'}`}>{SHIPMENT_STATUS_LABEL[text(row.status)] ?? text(row.status)}</span>
          <small className="rd-muted"> {row.partner_name ? `${text(row.partner_name)} 직송` : '본사 창고'} · {text(row.invoiced_at)}</small></div>
        <small className="rd-muted">{text(row.item_summary)}</small>
        <div className="dist-inline">
          {row.tracking_url ? <a className="rd-btn" href={text(row.tracking_url)} target="_blank" rel="noopener noreferrer">배송조회<span className="rd-sr-only"> (새 창)</span></a> : null}
          {row.status !== 'DELIVERED' ? <button type="button" className="rd-btn" disabled={busy} onClick={() => void act(() => markDelivered(Number(row.shipment_id)))}>배송 완료</button> : null}
        </div>
      </li>)}</ul>}
      {actions.add_shipment ? <ShipmentForm items={items} carriers={carriers} busy={busy} onSubmit={body => act(() => addShipment(orderId, body))} /> : null}
    </section>

    {claims.length || actions.cancel ? <section className="dist-box" aria-labelledby="dist-o-cancel">
      <h3 id="dist-o-cancel">취소·환불</h3>
      {claims.map(claim => <div key={text(claim.claim_id)} className={`dist-claim${claim.status === 'REQUESTED' ? ' is-open' : ''}`}>
        <div><b>{claim.claim_type === 'CANCEL' ? '취소' : text(claim.claim_type)} {CLAIM_STATUS_LABEL[text(claim.status)] ?? text(claim.status)}</b>
          <small className="rd-muted"> {text(claim.claim_no)} · {text(claim.requested_at)} · {CANCEL_REASON_LABEL[text(claim.reason_code)] ?? HQ_CANCEL_REASON_LABEL[text(claim.reason_code)] ?? text(claim.reason_code)}{claim.reason_detail ? ` · ${text(claim.reason_detail)}` : ''}</small></div>
        {Number(claim.refund_amount) > 0 ? <small>환불 {won(claim.refund_amount)}</small> : null}
        {claim.reject_reason ? <small className="rd-muted">거절 사유: {text(claim.reject_reason)}</small> : null}
        {claim.status === 'REQUESTED' ? <ClaimForm paid={paid} amount={won(order.paid_amount)} busy={busy}
          onApprove={refund => act(() => approveCancelClaim(Number(claim.claim_id), { refund }))}
          onReject={reason => act(() => rejectCancelClaim(Number(claim.claim_id), reason))} /> : null}
      </div>)}
      {actions.cancel ? <HqCancelForm paid={paid} amount={won(order.paid_amount)} busy={busy} onSubmit={body => act(() => cancelOrderByHq(orderId, body))} /> : null}
    </section> : null}

    <details className="dist-box"><summary>결제 거래·진행 기록</summary>
      {transactions.length ? <ul className="dist-log">{transactions.map(row => <li key={text(row.payment_tx_id)}>{text(row.completed_at)} · {TX_LABEL[text(row.tx_type)] ?? text(row.tx_type)} {won(row.amount)}
        {row.refund_bank_code ? ` · ${text(row.refund_bank_code)} ${text(row.refund_holder_name)}` : ''}{row.reason ? ` · ${text(row.reason)}` : ''} · {text(row.user_id)}</li>)}</ul> : null}
      <ul className="dist-log">{history.map((row, index) => <li key={index}>{text(row.changed_at)} · {ORDER_STATUS_LABEL[text(row.to_status)] ?? PAYMENT_STATUS_LABEL[text(row.to_status)] ?? text(row.to_status)}{row.reason ? ` · ${text(row.reason)}` : ''}</li>)}</ul>
    </details>
  </div>
}

function DepositForm({ amount, depositor, busy, onSubmit }: { amount: string; depositor: string; busy: boolean; onSubmit: (body: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ amount, depositor_name: depositor, paid_at: '', note: '' })
  return <form className="dist-subform" onSubmit={event => { event.preventDefault(); void onSubmit(form) }}>
    <h4>입금 확인</h4>
    <p className="rd-muted rd-fs-sm">통장에서 입금을 확인한 뒤 누르세요. 금액이 주문 금액과 다르면 저장되지 않습니다.</p>
    <div className="dist-fields">
      <Field id="dist-dep-amount" label="입금액(원)" value={text(form.amount)} onChange={value => setForm(current => ({ ...current, amount: value }))} />
      <Field id="dist-dep-name" label="입금자명" value={text(form.depositor_name)} onChange={value => setForm(current => ({ ...current, depositor_name: value }))} />
      <Field id="dist-dep-at" label="입금일시" type="datetime-local" hint="비우면 지금" value={text(form.paid_at)} onChange={value => setForm(current => ({ ...current, paid_at: value }))} />
      <Field id="dist-dep-note" label="메모" value={text(form.note)} onChange={value => setForm(current => ({ ...current, note: value }))} />
    </div>
    <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy}>입금 확인</button></div>
  </form>
}

function PurchaseOrderCreate({ name, busy, onSubmit }: { name: string; busy: boolean; onSubmit: (body: Row) => Promise<void> }) {
  const [expected, setExpected] = useState('')
  return <form className="dist-inline dist-po-create" onSubmit={event => { event.preventDefault(); void onSubmit({ expected_date: expected }) }}>
    <b>{name}</b><span className="rd-muted">발주 안 한 직송 상품이 있습니다.</span>
    <label className="dist-inline"><span className="rd-fs-sm">출고 예정일</span><input className="rd-input" type="date" value={expected} disabled={busy} onChange={event => setExpected(event.target.value)} /></label>
    <button type="submit" className="rd-btn is-primary" disabled={busy}>발주서 만들기</button>
  </form>
}

function PurchaseOrderCard({ po, lines, order, recipient, busy, onConfirm }: { po: Row; lines: Row[]; order: Row; recipient: Row; busy: boolean; onConfirm: (body: Row) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [expected, setExpected] = useState(text(po.expected_date))
  const [copied, setCopied] = useState(false)
  // 협력사에 문자·카톡·메일로 보낼 발주서 글(자동 전송은 협력사 전달 방식이 정해진 뒤)
  const sheet = useMemo(() => [
    `[더채움 발주서] ${text(po.po_no)}`,
    `주문번호: ${text(order.order_no)} / 협력사: ${text(po.partner_name)}`,
    '',
    '■ 상품',
    ...lines.map(line => `- ${text(line.product_name)}${line.option_name ? ` ${text(line.option_name)}` : ''} × ${qty(line.qty)}${line.partner_item_code ? ` (협력사코드 ${text(line.partner_item_code)})` : ''}`),
    '',
    '■ 받는 분',
    `${text(recipient.name)} / ${text(recipient.phone)}`,
    `(${text(recipient.zipcode)}) ${text(recipient.address1)} ${text(recipient.address2)}`.trim(),
    recipient.delivery_request ? `배송 요청: ${text(recipient.delivery_request)}` : '',
    po.expected_date ? `출고 예정일: ${text(po.expected_date)}` : '',
    '',
    '출고 후 택배사·송장번호를 알려주세요.',
  ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n'), [po, lines, order, recipient])
  const copy = async () => {
    try { await navigator.clipboard.writeText(sheet); setCopied(true) } catch { setCopied(false); setOpen(true) }
  }
  return <div className="dist-po">
    <div className="dist-inline"><b className="dist-code">{text(po.po_no)}</b><span>{text(po.partner_name)}</span>
      <span className={`rd-chip ${po.status === 'COMPLETED' ? 'is-ok' : po.status === 'CANCELED' ? 'is-done' : 'is-info'}`}>{PO_STATUS_LABEL[text(po.status)] ?? text(po.status)}</span>
      <small className="rd-muted">매입 {won(po.total_amount)} · 전달 {text(po.sent_at)}{po.confirmed_at ? ` · 확인 ${text(po.confirmed_at)}` : ''}{po.expected_date ? ` · 출고 예정 ${text(po.expected_date)}` : ''}</small></div>
    <small className="rd-muted">받는 곳: {text(po.manager_name)} {text(po.manager_phone)} {text(po.po_send_target)}</small>
    <div className="dist-inline">
      <button type="button" className="rd-btn" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? '발주서 닫기' : '발주서 보기'}</button>
      <button type="button" className="rd-btn" onClick={() => void copy()}>{copied ? '복사했습니다' : '발주서 글 복사'}</button>
      {po.status === 'SENT' ? <>
        <input className="rd-input" type="date" aria-label="출고 예정일" value={expected} disabled={busy} onChange={event => setExpected(event.target.value)} />
        <button type="button" className="rd-btn is-primary" disabled={busy} onClick={() => void onConfirm({ expected_date: expected })}>협력사 확인</button>
      </> : null}
    </div>
    {open ? <textarea className="rd-input dist-sheet" readOnly rows={Math.min(18, sheet.split('\n').length + 1)} value={sheet} aria-label="발주서 내용" /> : null}
  </div>
}

function ShipmentForm({ items, carriers, busy, onSubmit }: { items: Row[]; carriers: Row[]; busy: boolean; onSubmit: (body: Row) => Promise<void> }) {
  const open = items.filter(item => Number(item.remaining_qty) > 0 && item.item_status !== 'CANCELED')
  const firstOrigin = open[0] ? `${text(open[0].fulfillment_type)}:${text(open[0].partner_id)}` : ''
  const originOf = (item: Row) => item.fulfillment_type === 'DROP_SHIP' ? `DROP_SHIP:${text(item.partner_id)}` : 'OWN_STOCK:'
  const [picked, setOrigin] = useState(firstOrigin.startsWith('OWN_STOCK') ? 'OWN_STOCK:' : firstOrigin)
  const [carrier, setCarrier] = useState(text(open.find(item => originOf(item) === picked)?.default_carrier_code) || text(carriers[0]?.carrier_code))
  const [tracking, setTracking] = useState('')
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const origins = Array.from(new Map(open.map(item => [originOf(item), item.fulfillment_type === 'DROP_SHIP' ? `${text(item.partner_name)} 직송` : '본사 창고(자사재고)'])))
  // 고른 출고지를 다 보내면 남은 첫 출고지로
  const origin = origins.some(([key]) => key === picked) ? picked : origins[0]?.[0] ?? ''
  const rows = open.filter(item => originOf(item) === origin)
  const submit = () => onSubmit({
    carrier_code: carrier, tracking_no: tracking,
    items: rows.map(item => ({ order_item_id: item.order_item_id, qty: qtys[text(item.order_item_id)] ?? text(item.remaining_qty) })),
  }).then(() => setTracking(''))
  if (open.length === 0) return null
  return <form className="dist-subform" onSubmit={event => { event.preventDefault(); void submit() }}>
    <h4>송장 등록</h4>
    <div className="dist-fields">
      <div className="dist-field"><label htmlFor="dist-ship-origin">출고지</label>
        <select id="dist-ship-origin" className="rd-input" value={origin} disabled={busy} onChange={event => setOrigin(event.target.value)}>
          {origins.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="dist-field"><label htmlFor="dist-ship-carrier">택배사</label>
        <select id="dist-ship-carrier" className="rd-input" value={carrier} disabled={busy} onChange={event => setCarrier(event.target.value)}>
          {carriers.map(row => <option key={text(row.carrier_code)} value={text(row.carrier_code)}>{text(row.carrier_name)}</option>)}</select></div>
      <Field id="dist-ship-no" label="송장번호" value={tracking} onChange={setTracking} />
    </div>
    <table className="rd-table dist-table">
      <thead><tr><th>상품</th><th className="is-num">남은 수량</th><th className="is-num">이번 출고</th></tr></thead>
      <tbody>{rows.map(item => <tr key={text(item.order_item_id)}>
        <td>{text(item.product_name)}{item.option_name ? ` ${text(item.option_name)}` : ''}</td>
        <td className="is-num">{qty(item.remaining_qty)}</td>
        <td className="is-num"><input className="rd-input dist-num" type="number" min={0} max={Number(item.remaining_qty)} step={1} aria-label={`${text(item.product_name)} 이번 출고 수량`}
          value={qtys[text(item.order_item_id)] ?? text(Number(item.remaining_qty))} disabled={busy} onChange={event => setQtys(current => ({ ...current, [text(item.order_item_id)]: event.target.value }))} /></td>
      </tr>)}</tbody>
    </table>
    <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy || !tracking.trim()}>송장 등록</button></div>
  </form>
}

type Refund = { bank_name: string; account_no: string; holder: string }
function RefundFields({ value, onChange, amount }: { value: Refund; onChange: (value: Refund) => void; amount: string }) {
  return <div className="dist-refund">
    <p className="rd-fs-sm"><b>{amount}</b>이 입금된 주문입니다. 아래 계좌로 환불을 보낸 뒤 기록하세요(계좌번호는 암호화해 저장).</p>
    <div className="dist-fields">
      <Field id="dist-refund-bank" label="환불 은행" value={value.bank_name} onChange={bank_name => onChange({ ...value, bank_name })} />
      <Field id="dist-refund-account" label="계좌번호" value={value.account_no} onChange={account_no => onChange({ ...value, account_no })} />
      <Field id="dist-refund-holder" label="예금주" value={value.holder} onChange={holder => onChange({ ...value, holder })} />
    </div>
  </div>
}

function ClaimForm({ paid, amount, busy, onApprove, onReject }: { paid: boolean; amount: string; busy: boolean; onApprove: (refund: Refund | undefined) => Promise<void>; onReject: (reason: string) => Promise<void> }) {
  const [refund, setRefund] = useState<Refund>({ bank_name: '', account_no: '', holder: '' })
  const [reason, setReason] = useState('')
  return <div className="dist-subform">
    {paid ? <RefundFields value={refund} onChange={setRefund} amount={amount} /> : <p className="rd-muted rd-fs-sm">돈이 오가지 않은 주문입니다. 승인하면 바로 취소됩니다.</p>}
    <div className="dist-actions"><button type="button" className="rd-btn is-primary" disabled={busy} onClick={() => void onApprove(paid ? refund : undefined)}>{paid ? '환불하고 취소 승인' : '취소 승인'}</button></div>
    <div className="dist-inline">
      <input className="rd-input dist-url" aria-label="거절 사유" placeholder="거절 사유(주문자에게 보입니다)" maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} />
      <button type="button" className="rd-btn" disabled={busy || !reason.trim()} onClick={() => void onReject(reason)}>요청 거절</button>
    </div>
  </div>
}

function HqCancelForm({ paid, amount, busy, onSubmit }: { paid: boolean; amount: string; busy: boolean; onSubmit: (body: Row) => Promise<void> }) {
  const [reasonCode, setReasonCode] = useState('OUT_OF_STOCK')
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState<Refund>({ bank_name: '', account_no: '', holder: '' })
  return <details className="dist-cancel"><summary>본사에서 주문 취소</summary>
    <form className="dist-subform" onSubmit={event => { event.preventDefault(); if (window.confirm('이 주문을 취소할까요? 되돌릴 수 없습니다.')) void onSubmit({ reason_code: reasonCode, reason, refund: paid ? refund : undefined }) }}>
      <div className="dist-fields">
        <div className="dist-field"><label htmlFor="dist-cancel-code">취소 사유</label>
          <select id="dist-cancel-code" className="rd-input" value={reasonCode} disabled={busy} onChange={event => setReasonCode(event.target.value)}>
            {Object.entries(HQ_CANCEL_REASON_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <Field id="dist-cancel-detail" label="자세한 사유(주문자에게 보임)" value={reason} onChange={setReason} />
      </div>
      {paid ? <RefundFields value={refund} onChange={setRefund} amount={amount} /> : null}
      <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy}>{paid ? '환불하고 주문 취소' : '주문 취소'}</button></div>
    </form>
  </details>
}

function Field({ id, label, value, onChange, type, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; hint?: string }) {
  return <div className="dist-field"><label htmlFor={id}>{label}</label>
    <input id={id} className="rd-input" type={type ?? 'text'} value={value} onChange={event => onChange(event.target.value)} />
    {hint ? <small className="rd-muted">{hint}</small> : null}</div>
}
