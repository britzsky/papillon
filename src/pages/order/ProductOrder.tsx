import CatalogPreparation from '../../components/CatalogPreparation'
import { useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import BatchOrderResults from '../../components/BatchOrderResults'
import ProductImage from '../../components/ProductImage'
import type { SupplierOffer } from '../../api/supplierIntegration'
import { lineKey, useProductOrder, type CartLine } from '../../features/order/useProductOrder'
import '../operations/MenuManager.css'
import './ProductOrder.css'
import './OrderPos.css'

const PAGE_SIZE = 24
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
/** 수량 한 칸 이동: 발주배수만큼, 최소 발주수량 아래로는 내려가지 않음 */
const stepQty = (line: CartLine, direction: 1 | -1) => {
  const step = line.offer.order_increment_qty || 1
  const next = Math.round((line.quantity + direction * step) * 1000) / 1000
  return Math.max(line.offer.minimum_order_qty || step, next)
}
const supplierTone = (code: string) => code === 'WELSTORY' ? 'is-blue' : code === 'OURHOME' ? 'is-orange' : ''

/** 상품 검색 발주(PC). 로직은 features/order/useProductOrder(터치와 공용). embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다 */
export default function ProductOrder({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  return <ProductOrderContent key={accountId} accountId={accountId} initialSource={params.get('ingredient_id') || ''} embedded={embedded} />
}

/** 상품 카드: 사진 · 공급사 · D-N · 이름 · 규격 · 발주 상태 · 단가 · 담기 */
function OfferCard({ offer, inCart, canAdd, onAdd }: { offer: SupplierOffer; inCart: boolean; canAdd: boolean; onAdd: () => void }) {
  const available = offer.orderability_status === 'AVAILABLE'
  const reason = offer.orderability_reason || offer.availability_reason
  return <article className={`pos-card${inCart ? ' is-in-cart' : ''}`}>
    <div className="pos-card__image"><ProductImage src={offer.thumbnail_url || offer.image_url} fullSrc={offer.image_url} name={offer.product_name} zoomable /></div>
    <div className="pos-card__meta">
      <span className={`pos-chip ${supplierTone(offer.supplier_code)}`}>{offer.supplier_name}</span>
      {offer.lead_time_days != null && offer.lead_time_days > 0 && <span className="pos-chip">D-{offer.lead_time_days}</span>}
    </div>
    <strong className="pos-card__name" title={offer.product_name}>{offer.product_name}</strong>
    <span className="pos-card__sub">{offer.supplier_item_code} · {offer.base_qty}{offer.base_unit}/{offer.order_unit}</span>
    <span className={`pos-card__status ${available ? 'is-ok' : 'is-warn'}`} title={reason}>{available ? '발주 가능' : reason || '납품일자·마감 확인 요망'}</span>
    <div className="pos-card__foot">
      <b className="pos-card__price">{won(offer.purchase_price)}</b>
      <button type="button" className="pos-add" disabled={!canAdd} onClick={onAdd} aria-label={`${offer.product_name} 담기`}>{inCart ? '담김' : '+ 담기'}</button>
    </div>
  </article>
}

function ProductOrderContent({ accountId, initialSource, embedded }: { accountId: string; initialSource: string; embedded: boolean }) {
  const {
    sites, ingredients, source, chooseSource, site, setSite, date, changeDate, query, setQuery, cart, busy, locked, message, result, page, setPage,
    search, order, newCart, canAdd, addToCart, setLineQuantity, removeLine, filtered, groups, cartTotal, canOrder,
  } = useProductOrder(accountId, initialSource)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const inCart = (offer: SupplierOffer) => cart.some(line => line.offer.supplier_offer_id === offer.supplier_offer_id && line.date === date)

  const body = <div className="pos-order">
    <section className="pos-filters" aria-label="상품 조회 조건">
      <label>구매할 식재료<select disabled={busy || locked} value={source} onChange={e => chooseSource(e.target.value)}><option value="">상품의 기존 연결 사용</option>{ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}</select></label>
      <label>공급사 · 사업장<select disabled={busy} value={site} onChange={e => { setSite(e.target.value); setPage(1) }}><option value="">전체 공급사·사업장</option>{sites.map(s => <option key={s.supplier_account_site_id} value={s.supplier_account_site_id}>{s.supplier_name} · {s.external_site_name || s.external_site_code}</option>)}</select></label>
      <label>납품일<input disabled={busy} type="date" value={date} onChange={e => changeDate(e.target.value)} /></label>
      <label className="pos-filters__search">상품 검색<input placeholder="상품명 · 코드 · 공급사" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} onKeyDown={e => { if (e.key === 'Enter' && !busy && date && accountId) void search() }} /></label>
      <button type="button" className="is-primary" disabled={busy || !date || !accountId} onClick={() => void search()}>{busy ? '조회 중…' : '상품 조회'}</button>
    </section>
    <div className="pos-notes">
      <CatalogPreparation key={accountId + date} accountId={accountId} date={date} onReady={() => void search()} />
      {message && <p role="status" className="pos-message">{message}</p>}
    </div>

    <div className="pos-layout">
      <section className="pos-catalog" aria-label="공급상품">
        <header className="pos-catalog__head">
          <h2>공급상품 <small>{filtered.length}건</small></h2>
          <span>웰스토리·아워홈 상품을 함께 담고 공급사·사업장·납품일별로 발주서 발급</span>
        </header>
        {filtered.length ? <div className="pos-grid">
          {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(offer =>
            <OfferCard key={offer.supplier_offer_id} offer={offer} inCart={inCart(offer)} canAdd={canAdd(offer)} onAdd={() => addToCart(offer)} />)}
        </div> : <p className="pos-empty">{busy ? '상품 조회 중' : '조회된 상품 없음 · 납품일 선택 후 상품 조회 요망'}</p>}
        {filtered.length > PAGE_SIZE && <nav className="pos-pager" aria-label="상품 쪽 이동">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button>
          <span>{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>다음</button>
        </nav>}
      </section>

      <aside className="pos-cart" aria-label="현재 발주">
        <header className="pos-cart__head"><h2>현재 발주</h2><span className="pos-chip is-green">발주서 {Object.keys(groups).length}건</span></header>
        {!cart.length && <p className="pos-empty">담은 상품 없음 · 왼쪽에서 상품 담기 요망</p>}
        {Object.entries(groups).map(([key, lines]) => <section key={key} className="pos-cart__group">
          <h3><span className={`pos-chip ${supplierTone(lines[0].offer.supplier_code)}`}>{lines[0].offer.supplier_name}</span>{lines[0].offer.external_site_name || lines[0].offer.external_site_code} · {lines[0].date}</h3>
          {lines.map(line => <div key={lineKey(line)} className="pos-line">
            <span className="pos-line__image"><ProductImage compact src={line.offer.thumbnail_url || line.offer.image_url} name={line.offer.product_name} /></span>
            <span className="pos-line__info"><strong title={line.offer.product_name}>{line.offer.product_name}</strong><small>{won(line.offer.purchase_price)} / {line.offer.order_unit}</small></span>
            <span className="pos-stepper">
              <button type="button" aria-label={`${line.offer.product_name} 수량 줄이기`} disabled={busy || locked || line.quantity <= line.offer.minimum_order_qty} onClick={() => setLineQuantity(line, stepQty(line, -1))}>−</button>
              <input aria-label={`${line.offer.product_name} 발주수량`} disabled={busy || locked} type="number" min={line.offer.minimum_order_qty} step={line.offer.order_increment_qty} value={line.quantity} onChange={e => setLineQuantity(line, Number(e.target.value))} />
              <button type="button" aria-label={`${line.offer.product_name} 수량 늘리기`} disabled={busy || locked} onClick={() => setLineQuantity(line, stepQty(line, 1))}>+</button>
            </span>
            <b className="pos-line__amount">{won(line.quantity * line.offer.purchase_price)}</b>
            <button type="button" className="pos-line__remove" aria-label={`${line.offer.product_name} 빼기`} disabled={busy || locked} onClick={() => removeLine(line)}>×</button>
          </div>)}
        </section>)}
        <dl className="pos-cart__sum">
          <div><dt>담은 품목</dt><dd>{cart.length}개</dd></div>
          <div><dt>발주서</dt><dd>{Object.keys(groups).length}건 (공급사·사업장·납품일별)</dd></div>
          <div className="is-total"><dt>상품금액 합계</dt><dd>{won(cartTotal)}</dd></div>
        </dl>
        <button type="button" className="is-primary pos-cart__submit" disabled={!canOrder} onClick={() => void order()}>공급사별 발주 확정</button>
        <div className="pos-cart__sub">
          <button type="button" disabled={busy} onClick={newCart}>새 발주 작성</button>
          <button type="button" disabled={busy || !accountId} onClick={() => void order(true)}>이전 요청 결과 확인</button>
        </div>
        <p className="pos-cart__hint">최종 금액·발주 가능 여부는 확정 시 공급사 기준으로 재검증</p>
      </aside>
    </div>
    <BatchOrderResults result={result} accountId={accountId} />
  </div>
  if (embedded) return <div className="mixed-product-order">{body}</div>
  return <div className="menu-manager-page mixed-product-order"><main className="menu-manager-content"><SideMenuLayout header={<HeaderBar title="상품발주" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리' }, { label: '상품발주' }]} />}>{body}</SideMenuLayout></main></div>
}
