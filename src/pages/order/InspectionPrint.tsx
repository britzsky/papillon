import { createPortal } from 'react-dom'
import type { PurchaseOrder } from '../../features/order/usePurchaseOrders'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const withWeekday = (date: string) => { const d = new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime()) ? date : `${date} (${WEEKDAYS[d.getDay()]})` }
const qty = (value: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
/** 공급사 순서: 웰스토리 → 아워홈 → 그 밖(이름순) */
const rank = (order: PurchaseOrder) => order.supplier_code === 'WELSTORY' ? 0 : order.supplier_code === 'OURHOME' ? 1 : 2

/**
 * 검수서(A4 세로, 인쇄할 때만 보임). 납품일 하루치 발주서를 공급사 구분 없이 한 번에 뽑고, 안에서 공급사·사업장별로 나눈다.
 * 현장에서 물건을 보며 품목마다 확인 칸에 체크하고 실제 수량·비고를 적은 뒤, 화면에서 공급사 발주서별로 '검수완료'를 누른다.
 * 발주서 인쇄와 같은 인쇄 규칙(supplier-order-print)을 쓰므로 둘 중 하나만 그린다.
 */
export default function InspectionPrint({ date, orders, accountId }: { date: string; orders: PurchaseOrder[]; accountId: string }) {
  const printedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)
  const sorted = [...orders].sort((a, b) => rank(a) - rank(b) || a.supplier_name.localeCompare(b.supplier_name, 'ko') || (a.site_name || '').localeCompare(b.site_name || '', 'ko'))
  const live = (order: PurchaseOrder) => order.items.filter(item => !['FAILED', 'CANCELED'].includes(item.item_status))
  const itemCount = sorted.reduce((sum, order) => sum + live(order).length, 0)
  return createPortal(<article id="supplier-order-print" className="supplier-order-print inspection-print">
    <header className="po-doc__head">
      <h1>검 수 서</h1>
      <table className="po-doc__approval" aria-label="확인"><tbody>
        <tr><th rowSpan={2}>확<br />인</th><th>검수자</th><th>책임자</th></tr>
        <tr><td /><td /></tr>
      </tbody></table>
    </header>
    <table className="po-doc__info insp-doc__info"><tbody>
      <tr><th>납 품 일</th><td><strong>{withWeekday(date)}</strong></td><th>거 래 처</th><td>{orders[0]?.account_name || accountId}</td></tr>
      <tr><th>공 급 사</th><td>{sorted.map(order => order.supplier_name).filter((name, i, all) => all.indexOf(name) === i).join(' · ') || '-'} (발주서 {sorted.length}장 · {itemCount}품목)</td><th>출력일시</th><td>{printedAt}</td></tr>
    </tbody></table>
    {sorted.map(order => <section key={order.purchase_order_id} className="insp-doc__supplier">
      <h2>{order.supplier_name}{order.site_name ? ` · ${order.site_name}` : ''}<small>발주번호 {order.client_ord} · 도착시각 ____:____ · 검수자 __________</small></h2>
      <table className="po-doc__items">
        <thead><tr><th>No</th><th>확인</th><th>상품코드</th><th>상품명</th><th>주문수량</th><th>단위</th><th>실제 수량</th><th>비고(결품·파손·규격·원산지)</th></tr></thead>
        <tbody>{live(order).map((item, index) => <tr key={item.client_ord_item}>
          <td className="is-center">{index + 1}</td><td className="is-center insp-doc__check">☐</td><td>{item.supplier_item_code}</td><td className="is-name">{item.product_name}</td>
          <td className="is-number"><strong>{qty(Number(item.order_qty) - Number(item.received_order_qty || 0))}</strong></td><td className="is-center">{item.order_unit}</td>
          <td className="insp-doc__blank" /><td className="insp-doc__note" />
        </tr>)}</tbody>
      </table>
    </section>)}
    {!sorted.length ? <p>이 날 납품 예정인 발주서가 없습니다.</p> : null}
    <section className="po-doc__notes">
      <h2>검 수 기 준</h2>
      <ul>
        <li>주문수량은 이미 입고된 수량을 뺀 남은 수량입니다. 실제 수량이 다르면 '실제 수량'에 적고, 입고할 때 그 수량으로 고쳐 주십시오.</li>
        <li>공급사별로 도착 시각이 다를 수 있습니다. 도착한 공급사부터 확인한 뒤 화면에서 그 공급사 발주서의 '검수완료'를 누르면 입고 처리할 수 있습니다.</li>
      </ul>
    </section>
    <footer className="po-doc__foot">더채움 발주 시스템 · 검수서 · {date}</footer>
  </article>, document.body)
}
