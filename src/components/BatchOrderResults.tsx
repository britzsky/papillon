import { Link } from 'react-router-dom'
import type { BatchResult } from '../api/mixedProcurement'
import { DocumentIcon } from './ActionIcons'
import './BatchOrderResults.css'
const labels: Record<string, string> = { ORDERED: '접수 완료', CONFIRMED: '접수 확인', FAILED: '접수 실패', VALIDATION_FAILED: '전송 전 확인 필요', UNKNOWN: '접수 여부 확인 필요', SENDING: '전송 결과 확인 중', PARTIAL_FAILED: '일부 품목 확인 필요', RECEIVED: '입고 완료', PARTIAL_RECEIVED: '일부 입고', NOT_RECEIVED: '미입고', CANCELED: '취소' }

/** 상태 색: 접수·입고는 초록, 실패는 빨강, 나머지(확인 필요·진행 중)는 주황 */
const tone = (status: string) => ['ORDERED', 'CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED'].includes(status) ? 'ok'
  : ['FAILED', 'VALIDATION_FAILED', 'CANCELED'].includes(status) ? 'fail' : 'warn'

export default function BatchOrderResults({ result, accountId }: { result: BatchResult | null; accountId: string }) {
  if (!result) return null
  return <section className="batch-results" aria-label="공급사별 발주 결과">
    <h3>공급사별 발주 결과 <span>{result.orders.length}건</span></h3>
    <ul>{result.orders.map((order, index) => <li key={order.purchase_order_id || index} className={`batch-result is-${tone(order.status)}`}>
      <div className="batch-result__head">
        <span className="batch-result__badge">{labels[order.status] || order.status}</span>
        <strong>{order.supplier_name}</strong>
        <span className="batch-result__meta">{order.external_site_code} · 납품 {order.delivery_date}</span>
        {order.purchase_order_id && <Link className="batch-result__link" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: order.purchase_order_id })}`}><DocumentIcon />발주서 확인·인쇄</Link>}
      </div>
      {order.message && <p className="batch-result__message">{order.message}</p>}
    </li>)}</ul>
    <p className="batch-results__note">접수된 발주서는 다시 전송하지 않습니다. 접수 여부가 불명확하면 해당 발주서에서 주문 대사를 실행하세요.</p>
  </section>
}
