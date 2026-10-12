import { createPortal } from 'react-dom'
import { koreanAmount } from '../../utils/koreanAmount'

export type PrintableOrderItem = { client_ord_item: string; supplier_item_code?: string; product_name: string; order_qty: number; order_unit: string; unit_price_snapshot?: number; line_amount?: number; item_status: string }
export type PrintableOrder = {
  purchase_order_id: string; client_ord: string; supplier_name: string; sold_to?: string; site_name?: string; account_name?: string
  status: string; requested_delivery_date: string; created_at?: string; client_note?: string; total_amount: number; items: PrintableOrderItem[]
}

const money = (value?: number) => Number(value || 0).toLocaleString('ko-KR')
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const withWeekday = (date: string) => { const d = new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime()) ? date : `${date} (${WEEKDAYS[d.getDay()]})` }

/**
 * 공급사 발주서 인쇄 양식(A4 세로). 화면에는 보이지 않고 인쇄할 때만 나온다.
 * 금액은 발주 당시 공급사 판가 × 수량(부가세 포함 여부는 공급사 정산 기준).
 */
export default function SupplierOrderPrint({ order, accountId, labels }: { order: PrintableOrder; accountId: string; labels: Record<string, string> }) {
  const printedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)
  const orderedAt = order.created_at ? String(order.created_at).replace('T', ' ').slice(0, 10) : '-'
  const total = Number(order.total_amount || 0)
  const settled = (status: string) => ['ORDERED', 'CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED'].includes(status)
  return createPortal(<article id="supplier-order-print" className="supplier-order-print">
    <header className="po-doc__head">
      <h1>발 주 서</h1>
      <table className="po-doc__approval" aria-label="결재"><tbody>
        <tr><th rowSpan={2}>결<br />재</th><th>담 당</th><th>확 인</th></tr>
        <tr><td /><td /></tr>
      </tbody></table>
    </header>
    <div className="po-doc__parties">
      <table className="po-doc__info"><tbody>
        <tr><th>수 신</th><td><strong>{order.supplier_name}</strong> 귀하</td></tr>
        <tr><th>사 업 장</th><td>{order.site_name ? `${order.site_name} (${order.sold_to})` : order.sold_to || '-'}</td></tr>
        <tr><th>발주번호</th><td>{order.client_ord}</td></tr>
        <tr><th>발 주 일</th><td>{orderedAt}</td></tr>
        <tr><th>납품요청일</th><td><strong>{withWeekday(order.requested_delivery_date)}</strong></td></tr>
      </tbody></table>
      <table className="po-doc__info"><tbody>
        <tr><th>발 신</th><td><strong>{order.account_name || accountId}</strong></td></tr>
        <tr><th>거래처코드</th><td>{accountId}</td></tr>
        <tr><th>처리상태</th><td>{labels[order.status] || order.status}</td></tr>
        <tr><th>품목 수</th><td>{order.items.length}개</td></tr>
        <tr><th>출력일시</th><td>{printedAt}</td></tr>
      </tbody></table>
    </div>
    <p className="po-doc__lead">아래와 같이 발주합니다.</p>
    <div className="po-doc__total"><span>합계금액</span><strong>일금 {koreanAmount(total)} 원정</strong><span>(₩{money(total)})</span></div>
    <table className="po-doc__items">
      <thead><tr><th>No</th><th>상품코드</th><th>상품명</th><th>수량</th><th>단위</th><th>단가</th><th>금액</th><th>비고</th></tr></thead>
      <tbody>{order.items.map((item, index) => <tr key={item.client_ord_item}>
        <td className="is-center">{index + 1}</td><td>{item.supplier_item_code}</td><td className="is-name">{item.product_name}</td>
        <td className="is-number">{Number(item.order_qty).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}</td><td className="is-center">{item.order_unit}</td>
        <td className="is-number">{money(item.unit_price_snapshot)}</td><td className="is-number">{money(item.line_amount)}</td>
        <td className="is-center">{settled(item.item_status) ? '' : labels[item.item_status] || item.item_status}</td>
      </tr>)}</tbody>
      <tfoot><tr><th colSpan={6}>합 계</th><td className="is-number"><strong>{money(total)}</strong></td><td /></tr></tfoot>
    </table>
    <section className="po-doc__notes">
      <h2>비 고</h2>
      <p>{order.client_note || ' '}</p>
      <ul>
        <li>금액은 발주 당시 공급사 판가 × 수량이며, 부가세 포함 여부는 공급사 정산 기준에 따릅니다.</li>
        <li>납품 시 수량·규격·원산지를 확인한 뒤 입고 확정해 주십시오. 비고에 표시된 품목은 공급사 접수 여부를 확인해야 합니다.</li>
      </ul>
    </section>
    <footer className="po-doc__foot">더채움 발주 시스템 · 공급사 API로 전송된 발주 내역 · {order.purchase_order_id}</footer>
  </article>, document.body)
}
