import { OrderStatusBadge } from '../../components/WorkspaceTheme'
import { Link, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { buildApiUrl } from '../../config/api'
import OrderPreferenceChanges from '../../components/OrderPreferenceChanges'
import type { PreferenceChange } from '../../api/mixedProcurement'
import SupplierOrderPrint from './SupplierOrderPrint'
import { PrintIcon } from '../../components/ActionIcons'
import { getSupplierSites } from '../../api/supplierIntegration'
import './PurchaseOrderManager.css'

type OrderItem = { unit_price_snapshot?: number; line_amount?: number; source_ingredient_id?: string; ingredient_link_status?: string; supplier_item_code?: string; client_ord_item: string; product_name: string; order_qty: number; received_order_qty: number; order_unit: string; item_status: string; supplier_result_code?: string; supplier_error_message?: string }
type PurchaseOrder = { supplier_id?: number | string; sold_to?: string; site_name?: string; account_name?: string; created_at?: string; client_note?: string; purchase_order_id: string; client_ord: string; supplier_name: string; status: string; requested_delivery_date: string; total_amount: number; items: OrderItem[]; supplier_result_code?: string; supplier_result_message?: string; preference_changes?: PreferenceChange[] }
const today = () => new Date().toLocaleDateString('sv-SE')
const labels: Record<string, string> = { SENDING: '전송 중', UNKNOWN: '결과 확인 필요', ORDERED: '주문 접수', CONFIRMED: '주문 확인', PARTIAL_FAILED: '일부 품목 확인 필요', FAILED: '실패', PARTIAL_RECEIVED: '부분입고', RECEIVED: '입고완료', NOT_RECEIVED: '미입고', CANCELED: '취소' }

async function request(path: string, body?: unknown) {
  const response = await fetch(buildApiUrl(path), body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.')
  return data
}

export default function PurchaseOrderManager() {
  const [params, setParams] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  const focusedId = params.get('purchase_order_id') || ''
  const [from, setFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 30); return date.toLocaleDateString('sv-SE') })
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [receiptDate, setReceiptDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [supplierId, setSupplierId] = useState('')
  // 공급사 조회 조건: 이 거래처에 연결된 공급사 + 조회된 발주서의 공급사(연결이 끊긴 공급사의 과거 발주서도 고를 수 있게)
  const [siteSuppliers, setSiteSuppliers] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    if (!accountId) return
    let active = true
    getSupplierSites(accountId).then(sites => { if (active) setSiteSuppliers(sites.map(site => ({ id: String(site.supplier_id), name: site.supplier_name }))) }).catch(() => { /* 목록 실패해도 조회된 발주서의 공급사로 고를 수 있다 */ })
    return () => { active = false }
  }, [accountId])
  const receiptRequest = useRef<{ signature: string; key: string } | null>(null)

  const load = useCallback(async () => {
    if (!accountId) { setMessage('로그인한 고객사를 확인해 주세요.'); return }
    if (from > to) { setMessage('조회 시작일과 종료일을 확인해 주세요.'); return }
    setBusy(true); setMessage('')
    try {
      const query = new URLSearchParams({ account_id: accountId, date_from: from, date_to: to, status, offset: String(offset), limit: '50' })
      if (supplierId) query.set('supplier_id', supplierId)
      if (focusedId) { query.set('purchase_order_id', focusedId); query.delete('date_from'); query.delete('date_to'); query.delete('status'); query.delete('supplier_id') }
      const result = await request(`/Procurement/Orders?${query}`)
      setOrders(result.orders)
      setSelected(current => result.orders.find((order: PurchaseOrder) => order.purchase_order_id === (focusedId || current?.purchase_order_id)) || result.orders[0] || null)
    } catch (error) { setMessage(error instanceof Error ? error.message : '조회 실패') }
    finally { setBusy(false) }
  }, [accountId, from, to, status, supplierId, offset, focusedId])
  useEffect(() => { void load() }, [load])
  const suppliers = useMemo(() => {
    const byId = new Map(siteSuppliers.map(s => [s.id, s]))
    for (const order of orders) if (order.supplier_id != null && !byId.has(String(order.supplier_id))) byId.set(String(order.supplier_id), { id: String(order.supplier_id), name: order.supplier_name })
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [siteSuppliers, orders])

  const reconcile = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const result = await request('/Procurement/Reconcile', { account_id: accountId, purchase_order_id: selected.purchase_order_id })
      await load(); setMessage(`공급사 조회: ${result.query_message || result.message || "조회 완료"}${result.query_result_code ? ` (${result.query_result_code})` : ""} · 주문 상태: ${labels[result.status] || result.status}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '대사 실패') }
    finally { setBusy(false) }
  }
  const receiptQuantity = (item: OrderItem) => quantities[item.client_ord_item]
    ?? String(Math.max(0, Math.round((Number(item.order_qty) - Number(item.received_order_qty)) * 1000) / 1000))

  const receive = async () => {
    if (!selected) return
    const items = selected.items.filter(item => Number(receiptQuantity(item)) > 0).map(item => ({ client_ord_item: item.client_ord_item, received_qty: Number(receiptQuantity(item)) }))
    if (!items.length) { setMessage('이번에 실제 입고된 수량을 입력해 주세요.'); return }
    const signature = JSON.stringify({ order: selected.purchase_order_id, receiptDate, items })
    if (receiptRequest.current?.signature !== signature) receiptRequest.current = { signature, key: crypto.randomUUID() }
    setBusy(true)
    try {
      await request('/Procurement/Receive', { account_id: accountId, purchase_order_id: selected.purchase_order_id, receipt_date: receiptDate, receipt_key: receiptRequest.current.key, user_id: localStorage.getItem('user_id') || '', items })
      setQuantities({}); receiptRequest.current = null
      await load(); setMessage('실제 입고수량을 재고에 반영했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '입고 처리 실패') }
    finally { setBusy(false) }
  }

  return <main className="purchase-orders"><SideMenuLayout header={<HeaderBar title="발주서 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리', to: '/order_manager' }, { label: '발주서 관리' }]} />}>
    {focusedId ? <p>선택한 발주 결과를 조회하고 있습니다. <button onClick={() => { setParams({ account_id: accountId }); setOffset(0) }}>전체 발주 내역 보기</button></p> : null}
    <section className="purchase-orders__filters" aria-label="발주서 조회 조건">
      <label>주문 시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0) }} /></label>
      <label>주문 종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0) }} /></label>
      <label>진행 상태<select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">전체</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>공급사<select value={supplierId} onChange={e => { setSupplierId(e.target.value); setOffset(0) }}><option value="">전체</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button className="action-query-button" onClick={() => void load()} disabled={busy}>조회</button>
    </section>
    {message && <p role="status">{message}</p>}
    {accountId && <p className="purchase-orders__inventory-link"><Link to={`/inventory/account?${new URLSearchParams({ account_id: accountId })}`}>이 거래처 재고 확인</Link></p>}
    <div className="purchase-orders__layout"><section aria-label="발주 목록">
      <div className="workspace-table-scroll" tabIndex={0} role="region" aria-label="조회 결과 테이블"><table><thead><tr><th>주문번호</th><th>공급사</th><th>납품일</th><th>상태</th><th>금액</th></tr></thead><tbody>
        {orders.map(order => <tr key={order.purchase_order_id} className={selected?.purchase_order_id === order.purchase_order_id ? 'is-selected' : ''}><td><button className="purchase-orders__select" onClick={() => { setSelected(order); setQuantities({}); receiptRequest.current = null }}>{order.client_ord}</button></td><td>{order.supplier_name}</td><td>{order.requested_delivery_date}</td><td><OrderStatusBadge status={order.status} label={labels[order.status] || order.status} /></td><td>{Number(order.total_amount).toLocaleString()}원</td></tr>)}
      </tbody></table></div>{!orders.length && <p>조건에 해당하는 발주서가 없습니다.</p>}
      <nav aria-label="페이지"><button disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>이전</button><button disabled={busy || orders.length < 50} onClick={() => setOffset(offset + 50)}>다음</button></nav>
    </section><section aria-label="발주 상세">{selected ? <>
      <h2>{selected.supplier_name} · {selected.client_ord}</h2>
      {/* 사업장·납품일·처리 상태·인쇄를 한 줄에 간격을 두고 놓아 품목 표를 위로 올린다 */}
      <div className="purchase-orders__summary">
        <span title={selected.site_name ? `${selected.site_name} (${selected.sold_to})` : selected.sold_to}><em>사업장</em>{selected.site_name ? `${selected.site_name} (${selected.sold_to})` : selected.sold_to}</span>
        <span><em>납품일</em>{selected.requested_delivery_date}</span>
        <span><em>상태</em><OrderStatusBadge status={selected.status} label={labels[selected.status] || selected.status} /></span>
        <button className="print-button" disabled={busy} title="이 공급사 발주서 인쇄" onClick={() => window.print()}><PrintIcon />발주서 인쇄</button>
      </div>
      <OrderPreferenceChanges key={`${accountId}/${selected.purchase_order_id}`} accountId={accountId} orderId={selected.purchase_order_id} changes={selected.preference_changes} />
      <div className="purchase-orders__response">
        <p><em>공급사 응답</em>{selected.supplier_result_message || '전체 응답 사유가 없습니다. 아래 품목별 결과를 확인해주세요.'}{selected.supplier_result_code ? ` (${selected.supplier_result_code})` : ''}
          {['UNKNOWN', 'SENDING', 'PARTIAL_FAILED'].includes(selected.status) ? <><br /><b>접수 여부가 확정되지 않은 품목은 ‘공급사 접수 상태 다시 조회’로 확인해주세요.</b></> : null}</p>
        <button className="action-query-button" disabled={busy} onClick={() => void reconcile()}>공급사 접수 상태 다시 조회</button>
      </div>
      <div className="workspace-table-scroll" tabIndex={0} role="region" aria-label="조회 결과 테이블"><table><thead><tr><th>상품</th><th>주문량</th><th>기입고</th><th>잔량</th><th>이번 입고</th></tr></thead><tbody>{selected.items.map(item => <tr key={item.client_ord_item}><td>{item.product_name}{item.ingredient_link_status === 'CONFLICT' && <small role="alert">식자재 연결이 변경되어 자동 연결 확인 필요</small>}{item.ingredient_link_status === 'PENDING' && <small>접수 확인 후 식자재 자동 연결 예정</small>}{item.ingredient_link_status === 'LINKED' && <small>식자재 자동 연결 완료</small>}<small>상품코드: {item.supplier_item_code}</small><small><OrderStatusBadge status={item.item_status} label={labels[item.item_status] || item.item_status} /></small>{item.supplier_error_message ? <small role="note">사유: {item.supplier_error_message}</small> : null}{item.supplier_result_code ? <small>응답 코드: {item.supplier_result_code}</small> : null}</td><td>{item.order_qty} {item.order_unit}</td><td>{item.received_order_qty}</td><td>{Math.max(0, item.order_qty - item.received_order_qty)}</td><td><input aria-label={`${item.product_name} 이번 입고수량`} type="number" min="0" step="0.001" max={Math.max(0, item.order_qty - item.received_order_qty)} value={receiptQuantity(item)} onChange={e => setQuantities({ ...quantities, [item.client_ord_item]: e.target.value })} /></td></tr>)}</tbody></table></div>
      <div className="purchase-orders__receipt-actions">
        <label>실입고일<input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label>
        <button className="action-save-button" disabled={busy || !['ORDERED', 'CONFIRMED', 'PARTIAL_RECEIVED', 'NOT_RECEIVED'].includes(selected.status)} onClick={() => void receive()}>입고 확정</button>
      </div>
      <p>이번 입고는 미입고 잔량(주문량 − 기입고)으로 기본 입력됩니다. 실제 도착 수량이 다르면 수정하고, 도착하지 않은 품목은 0으로 변경한 뒤 입고를 확정하세요.</p>
    </> : <p>발주서를 선택하면 품목과 입고 내역을 확인할 수 있습니다.</p>}</section></div>
  </SideMenuLayout>{selected && <SupplierOrderPrint order={selected} accountId={accountId} labels={labels} />}</main>
}
