import CatalogPreparation from '../../components/CatalogPreparation'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import BatchOrderResults from '../../components/BatchOrderResults'
import ProductImage from '../../components/ProductImage'
import { money, orderDay as day, useQuickOrder } from '../../features/order/useQuickOrder'
import '../../components/DailyWork.css'

/** 추천 발주안(PC). 로직은 features/order/useQuickOrder(터치 발주하기와 공용). embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다 */
export default function QuickOrder({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  const {
    date, changeDate, source, changeSource, result, preview, error, busy, attempted, batch, allowPartial, setAllowPartial,
    exceptions, submit, recover, refresh, reloadPreview,
  } = useQuickOrder(accountId)
  const body = <main className="quick-order">
    <h2>기존 사용상품으로 필요한 수량을 준비했습니다.</h2><p>납품일에 사용할 식단과 재고를 기준으로 계산합니다. 변경할 항목만 상세 발주에서 수정하세요.</p>
    {!accountId && <p role="alert">홈에서 거래처를 선택해주세요.</p>}
    <div className="quick-order__filters"><label>납품·사용일<input type="date" min={day()} value={date} disabled={busy || attempted} onChange={e => changeDate(e.target.value)} /></label><label>계산 기준<select value={source} disabled={busy || attempted} onChange={e => changeSource(e.target.value as 'PLAN' | 'INVENTORY')}><option value="PLAN">해당 날짜 식단</option><option value="INVENTORY">평균 사용량·안전재고 보충</option></select></label><button disabled={busy} onClick={refresh}>최신 발주안 다시 준비</button></div>
    <CatalogPreparation key={accountId + date} accountId={accountId} date={date} onReady={reloadPreview} />
    {busy && <p role="status">발주 정보를 확인하고 있습니다.</p>}{error && <p role="alert">{error}</p>}
    {exceptions.length > 0 && <section className="quick-order__exception"><h3>확인 필요한 식자재 {exceptions.length}개</h3>{exceptions.map(row => <p key={row.ingredient_id}><strong>{row.ingredient_name}</strong> · {row.issues.join(' · ') || row.offers.map(o => o.orderability_reason || o.availability_reason).filter(Boolean).join(' · ') || '주상품이 없거나 주문할 수 없습니다. 상품·단위를 확인해주세요.'}</p>)}{preview && <label><input type="checkbox" checked={allowPartial} disabled={busy || attempted} onChange={e => setAllowPartial(e.target.checked)} /> 위 항목을 제외하고 준비된 {preview.items.length}품목만 먼저 발주합니다.</label>}</section>}
    {preview && <><div className="table-scroll"><table><thead><tr><th>식자재 / 상품</th><th>공급사</th><th>주문량</th><th>상품금액</th></tr></thead><tbody>{preview.items.map(row => <tr key={row.ingredient_id}><td><div className="shortage-offer-cell"><ProductImage zoomable src={row.offer.thumbnail_url || row.offer.image_url || undefined} fullSrc={row.offer.image_url || undefined} name={row.offer.product_name} /><div><strong>{row.ingredient_name}</strong><br />{row.offer.product_name}</div></div></td><td>{row.offer.supplier_name}</td><td>{row.order_qty} {row.offer.order_unit}</td><td>{money(row.item_amount)}원</td></tr>)}</tbody></table></div><details><summary>계산 근거 확인</summary>{preview.items.map(row => <p key={row.ingredient_id}>{row.ingredient_name}: 필요 {row.required_qty} + 안전 {row.safe_stock_qty} − 현재 {row.current_qty} − 확정 입고 {row.incoming_qty} {row.base_unit}. 날짜별 부족 {row.shortage_qty} {row.base_unit} → 포장 단위 {row.order_qty} {row.offer.order_unit}</p>)}</details></>}
    {!busy && result && !result.ingredients.length && <p>이 날짜에 발주할 부족 재료가 없습니다. 식단이 등록되어 있는지도 확인해주세요.</p>}
    <div className="quick-order__links"><Link to={`/order_manager/order?${new URLSearchParams({ tab: source === 'PLAN' ? 'plan' : 'usage', account_id: accountId, source })}`}>수량·상품 직접 조정</Link><Link to={`/order_manager/order?${new URLSearchParams({ tab: 'products', account_id: accountId })}`}>새 상품 추가 구매</Link><Link to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId })}`}>발주·입고 내역</Link><button onClick={() => void recover()} disabled={busy}>이전 발주 결과 확인</button></div>
    {batch && <BatchOrderResults result={batch} accountId={accountId} />}
    {preview && !batch && <section className="quick-order__summary"><span><strong>{preview.items.length}품목 · {money(preview.item_amount)}원</strong><br />상품금액 기준 · 과세 항목의 세액은 별도 확인</span><button disabled={busy || attempted || (exceptions.length > 0 && !allowPartial)} onClick={() => void submit()}>{attempted ? '이전 발주 결과를 확인해주세요' : '공급사별 발주 확정'}</button></section>}
  </main>
  return embedded ? body : <SideMenuLayout header={<HeaderBar title="준비된 발주안" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주안 확인' }]} />}>{body}</SideMenuLayout>
}
