import CatalogPreparation from '../../components/CatalogPreparation'
import { useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import BatchOrderResults from '../../components/BatchOrderResults'
import { lineKey, useProductOrder } from '../../features/order/useProductOrder'
import '../operations/MenuManager.css'
import './ProductOrder.css'

/** 상품 검색 발주(PC). 로직은 features/order/useProductOrder(터치와 공용). embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다 */
export default function ProductOrder({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  return <ProductOrderContent key={accountId} accountId={accountId} initialSource={params.get('ingredient_id') || ''} embedded={embedded} />
}
function ProductOrderContent({ accountId, initialSource, embedded }: { accountId: string; initialSource: string; embedded: boolean }) {
  const {
    sites, ingredients, source, chooseSource, site, setSite, date, changeDate, query, setQuery, busy, locked, message, result, page, setPage,
    search, order, newCart, canAdd, addToCart, setLineQuantity, removeLine, filtered, groups, cartTotal, canOrder,
  } = useProductOrder(accountId, initialSource)
  const body = <>
    <section className="menu-manager-panel"><h2>공급상품 통합 발주</h2><p>웰스토리·아워홈 상품을 함께 담고, 공급사·사업장·납품일별로 발주서를 발급합니다.</p>
      <div className="menu-manager-filter-grid">
        <label>구매할 식재료<select disabled={busy || locked} value={source} onChange={e => chooseSource(e.target.value)}><option value="">상품의 기존 연결 사용</option>{ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}</select></label>
        <label>공급사 · 사업장<select disabled={busy} value={site} onChange={e => { setSite(e.target.value); setPage(1) }}><option value="">전체 공급사·사업장</option>{sites.map(s => <option key={s.supplier_account_site_id} value={s.supplier_account_site_id}>{s.supplier_name} · {s.external_site_name || s.external_site_code}</option>)}</select></label>
        <label>납품일<input disabled={busy} type="date" value={date} onChange={e => changeDate(e.target.value)} /></label>
        <label>상품명·코드·공급사<input value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} /></label>
        <button disabled={busy || !date || !accountId} onClick={() => void search()}>상품 조회</button>
      </div><p>선택한 납품일의 상품을 자동 준비합니다. 준비 실패나 순기 확인이 필요한 경우 본사에 확인해주세요.</p>
      <CatalogPreparation key={accountId + date} accountId={accountId} date={date} onReady={() => void search()} />
      {message && <p role="status">{message}</p>}
      <div className="menu-manager-table-scroll"><table className="menu-manager-table"><thead><tr><th>공급사·사업장</th><th>상품</th><th>규격</th><th>가격</th><th>선택</th></tr></thead><tbody>{filtered.slice((page - 1) * 30, page * 30).map(o => <tr key={o.supplier_offer_id}><td>{o.supplier_name}<br />{o.external_site_name || o.external_site_code}</td><td>{o.product_name}<br />{o.supplier_item_code}</td><td>{o.base_qty}{o.base_unit}/{o.order_unit}</td><td>{o.purchase_price.toLocaleString()}원</td><td><button disabled={!canAdd(o)} onClick={() => addToCart(o)}>담기</button><small>{o.orderability_reason || o.availability_reason}</small></td></tr>)}</tbody></table></div>
      <p>{filtered.length}건 · {page}/{Math.max(1, Math.ceil(filtered.length / 30))} <button disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button><button disabled={page * 30 >= filtered.length} onClick={() => setPage(page + 1)}>다음</button></p>
      <section aria-label="혼합 발주 미리보기"><h3>선택 품목 · 발주서 {Object.keys(groups).length}건</h3>{Object.entries(groups).map(([label, lines]) => <section key={label}><h4>{lines?.[0]?.offer.supplier_name} · {lines?.[0]?.offer.external_site_name} ({lines?.[0]?.offer.external_site_code}) · {lines?.[0]?.date}</h4>{lines?.map(line => <div key={lineKey(line)}><strong>{line.offer.product_name}</strong> <label>수량 <input aria-label={`${line.offer.product_name} 발주수량`} disabled={busy || locked} type="number" min={line.offer.minimum_order_qty} step={line.offer.order_increment_qty} value={line.quantity} onChange={e => setLineQuantity(line, Number(e.target.value))} /></label> {line.offer.order_unit} · {(line.quantity * line.offer.purchase_price).toLocaleString()}원 <button disabled={busy || locked} onClick={() => removeLine(line)}>제외</button></div>)}</section>)}
        <p>상품금액 합계 {cartTotal.toLocaleString()}원</p>
        <button disabled={!canOrder} onClick={() => void order()}>공급사별 발주 확정</button>{' '}
        <button disabled={busy || !accountId} onClick={() => void order(true)}>이전 요청 결과 확인</button>{' '}
        <button disabled={busy} onClick={newCart}>새 발주 작성</button>
      </section><BatchOrderResults result={result} accountId={accountId} />
    </section>
  </>
  if (embedded) return <div className="mixed-product-order">{body}</div>
  return <div className="menu-manager-page mixed-product-order"><main className="menu-manager-content"><SideMenuLayout header={<HeaderBar title="상품발주" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리' }, { label: '상품발주' }]} />}>{body}</SideMenuLayout></main></div>
}
