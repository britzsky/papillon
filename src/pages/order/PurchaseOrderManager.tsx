import { OrderStatusBadge } from '../../components/WorkspaceTheme'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import OrderPreferenceChanges from '../../components/OrderPreferenceChanges'
import SupplierOrderPrint from './SupplierOrderPrint'
import { PrintIcon } from '../../components/ActionIcons'
import { ORDER_STATUS_LABELS as labels, RECEIVABLE_STATUSES, UNCERTAIN_STATUSES, usePurchaseOrders } from '../../features/order/usePurchaseOrders'
import './PurchaseOrderManager.css'

/** 발주서 관리(PC). 조회·접수 재조회·입고 확정 로직은 features/order/usePurchaseOrders(터치 화면과 공용). */
export default function PurchaseOrderManager() {
  const [params, setParams] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  const focusedId = params.get('purchase_order_id') || ''
  const {
    from, setFrom, to, setTo, status, setStatus, offset, setOffset, supplierId, setSupplierId, suppliers,
    orders, selected, selectOrder, busy, message, load, reconcile,
    receiptDate, setReceiptDate, receiptQuantity, setReceiptQuantity, receive,
  } = usePurchaseOrders(accountId, focusedId)

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
        {orders.map(order => <tr key={order.purchase_order_id} className={selected?.purchase_order_id === order.purchase_order_id ? 'is-selected' : ''}><td><button className="purchase-orders__select" onClick={() => selectOrder(order)}>{order.client_ord}</button></td><td>{order.supplier_name}</td><td>{order.requested_delivery_date}</td><td><OrderStatusBadge status={order.status} label={labels[order.status] || order.status} /></td><td>{Number(order.total_amount).toLocaleString()}원</td></tr>)}
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
          {UNCERTAIN_STATUSES.includes(selected.status) ? <><br /><b>접수 여부가 확정되지 않은 품목은 ‘공급사 접수 상태 다시 조회’로 확인해주세요.</b></> : null}</p>
        <button className="action-query-button" disabled={busy} onClick={() => void reconcile()}>공급사 접수 상태 다시 조회</button>
      </div>
      <div className="workspace-table-scroll" tabIndex={0} role="region" aria-label="조회 결과 테이블"><table><thead><tr><th>상품</th><th>주문량</th><th>기입고</th><th>잔량</th><th>이번 입고</th></tr></thead><tbody>{selected.items.map(item => <tr key={item.client_ord_item}><td>{item.product_name}{item.ingredient_link_status === 'CONFLICT' && <small role="alert">식자재 연결이 변경되어 자동 연결 확인 필요</small>}{item.ingredient_link_status === 'PENDING' && <small>접수 확인 후 식자재 자동 연결 예정</small>}{item.ingredient_link_status === 'LINKED' && <small>식자재 자동 연결 완료</small>}<small>상품코드: {item.supplier_item_code}</small><small><OrderStatusBadge status={item.item_status} label={labels[item.item_status] || item.item_status} /></small>{item.supplier_error_message ? <small role="note">사유: {item.supplier_error_message}</small> : null}{item.supplier_result_code ? <small>응답 코드: {item.supplier_result_code}</small> : null}</td><td>{item.order_qty} {item.order_unit}</td><td>{item.received_order_qty}</td><td>{Math.max(0, item.order_qty - item.received_order_qty)}</td><td><input aria-label={`${item.product_name} 이번 입고수량`} type="number" min="0" step="0.001" max={Math.max(0, item.order_qty - item.received_order_qty)} value={receiptQuantity(item)} onChange={e => setReceiptQuantity(item, e.target.value)} /></td></tr>)}</tbody></table></div>
      <div className="purchase-orders__receipt-actions">
        <label>실입고일<input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label>
        <button className="action-save-button" disabled={busy || !RECEIVABLE_STATUSES.includes(selected.status)} onClick={() => void receive()}>입고 확정</button>
      </div>
      <p>이번 입고는 미입고 잔량(주문량 − 기입고)으로 기본 입력됩니다. 실제 도착 수량이 다르면 수정하고, 도착하지 않은 품목은 0으로 변경한 뒤 입고를 확정하세요.</p>
    </> : <p>발주서를 선택하면 품목과 입고 내역을 확인할 수 있습니다.</p>}</section></div>
  </SideMenuLayout>{selected && <SupplierOrderPrint order={selected} accountId={accountId} labels={labels} />}</main>
}
