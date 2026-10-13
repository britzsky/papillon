import { Link } from 'react-router-dom'
import type { BatchResult } from '../api/mixedProcurement'

const LABELS: Record<string, string> = { ORDERED: '접수 완료', CONFIRMED: '접수 확인', FAILED: '접수 실패', VALIDATION_FAILED: '전송 전 확인 필요', UNKNOWN: '접수 여부 확인 필요', SENDING: '전송 결과 확인 중', PARTIAL_FAILED: '일부 품목 확인 필요' }
const tone = (status: string) => ['ORDERED', 'CONFIRMED'].includes(status) ? 'is-ok' : ['FAILED', 'VALIDATION_FAILED'].includes(status) ? 'is-danger' : 'is-yellow'

/** 공급사별 발주 결과(터치 발주 화면 공용). PC는 BatchOrderResults. */
export default function BatchResultList({ result, accountId }: { result: BatchResult; accountId: string }) {
  return <ul className="t-batch">{result.orders.map((order, i) => <li key={order.purchase_order_id || i}>
    <span className="t-dot">{order.supplier_name.slice(0, 1)}</span>
    <div>
      <strong>{order.supplier_name}</strong>
      <small>납품 {order.delivery_date}{order.external_site_code ? ` · ${order.external_site_code}` : ''}</small>
      {order.message && <small>{order.message}</small>}
    </div>
    <span className={`t-badge ${tone(order.status)}`}>{LABELS[order.status] || order.status}</span>
    {order.purchase_order_id && <Link className="t-btn is-small is-soft t-batch__link" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: order.purchase_order_id })}`}>발주서 보기</Link>}
  </li>)}</ul>
}
