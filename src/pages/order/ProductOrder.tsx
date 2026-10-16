import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import CatalogPreparation from '../../components/CatalogPreparation'
import { useState } from 'react'
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
/** 기준단위 100g(100ml·1개)당 가격 — 규격이 다른 상품끼리 비교(2026-10-15 개편 시안 ⑤) */
function unitCost(offer: SupplierOffer) {
  const qty = Number(offer.base_qty) || 0
  if (!qty || !offer.purchase_price) return null
  const u = (offer.base_unit || '').toLowerCase()
  const factor = u === 'g' || u === 'ml' ? 100 : u === 'kg' || u === 'l' ? 0.1 : 1
  return { value: offer.purchase_price / qty * factor, per: u === 'g' || u === 'kg' ? '100g' : u === 'ml' || u === 'l' ? '100ml' : (offer.base_unit || '개') }
}

/** 상품 검색 발주(PC). 로직은 features/order/useProductOrder(터치와 공용). embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다 */
export default function ProductOrder({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  return <ProductOrderContent key={accountId} accountId={accountId} initialSource={params.get('ingredient_id') || ''} embedded={embedded} />
}

/** 같은 기준단위(100g·100ml·개)끼리 단가 비교. 단위가 다르면 100g → 100ml → 그 외 순서로 묶는다 */
function compareUnit(a: SupplierOffer, b: SupplierOffer, direction: 1 | -1) {
  const ca = unitCost(a), cb = unitCost(b)
  if (!ca || !cb) return ca ? -1 : cb ? 1 : 0
  if (ca.per !== cb.per) return ca.per === '100g' ? -1 : cb.per === '100g' ? 1 : ca.per.localeCompare(cb.per)
  return (ca.value - cb.value) * direction
}
/** 상품 검색 정렬(2026-10-15 사용자 결정: 추천순 기본, 포장 가격과 100g당 가격을 구분해 이름에 표시) */
const SORTS = {
  recommend: { label: '추천순 (늘 쓰는 상품 먼저)', compare: (a: SupplierOffer, b: SupplierOffer) => Number(Boolean(b.linked_ingredient_id)) - Number(Boolean(a.linked_ingredient_id)) || compareUnit(a, b, 1) },
  unit_asc: { label: '100g당 낮은 순', compare: (a: SupplierOffer, b: SupplierOffer) => compareUnit(a, b, 1) },
  unit_desc: { label: '100g당 높은 순', compare: (a: SupplierOffer, b: SupplierOffer) => compareUnit(a, b, -1) },
  price_asc: { label: '포장 가격 낮은 순', compare: (a: SupplierOffer, b: SupplierOffer) => a.purchase_price - b.purchase_price },
  price_desc: { label: '포장 가격 높은 순', compare: (a: SupplierOffer, b: SupplierOffer) => b.purchase_price - a.purchase_price },
} as const
type SortKey = keyof typeof SORTS

/** 상품 카드: 사진 · 공급사 · D-N · 이름 · 규격 · 발주 상태 · 단가 · 담기 */
function OfferCard({ offer, inCart, canAdd, onAdd, cheapest, line, onQty, disabled }: { offer: SupplierOffer; inCart: boolean; canAdd: boolean; onAdd: () => void; cheapest: boolean; line?: CartLine; onQty: (line: CartLine, quantity: number) => void; disabled: boolean }) {
  const available = offer.orderability_status === 'AVAILABLE'
  const reason = offer.orderability_reason || offer.availability_reason
  const cost = unitCost(offer)
  return <article className={`pos-card${inCart ? ' is-in-cart' : ''}`}>
    <div className="pos-card__image"><ProductImage src={offer.thumbnail_url || offer.image_url} fullSrc={offer.image_url} name={offer.product_name} zoomable /></div>
    <div className="pos-card__meta">
      <span className={`pos-chip ${supplierTone(offer.supplier_code)}`}>{offer.supplier_name}</span>
      {offer.lead_time_days != null && offer.lead_time_days > 0 && <span className="pos-chip">D-{offer.lead_time_days}</span>}
      {cheapest ? <span className="rd-chip is-ok pos-card__tag">가장 저렴</span> : offer.linked_ingredient_id ? <span className="rd-chip is-done pos-card__tag">늘 쓰는 상품</span> : null}
    </div>
    <strong className="pos-card__name" title={offer.product_name}>{offer.product_name}</strong>
    <span className="pos-card__sub">{offer.supplier_item_code} · {offer.base_qty}{offer.base_unit}/{offer.order_unit}</span>
    <span className={`pos-card__status ${available ? 'is-ok' : 'is-warn'}`} title={reason}>{available ? '발주 가능' : reason || '납품일자·마감 확인 요망'}</span>
    <div className="pos-card__price-row"><b className="pos-card__price">{won(offer.purchase_price)}<small>/{offer.order_unit}</small></b>{cost ? <span className="rd-muted">{cost.per}당 {won(cost.value)}</span> : null}</div>
    <div className="pos-card__foot">
      {line ? <span className="rd-stepper">
        <button type="button" aria-label={`${offer.product_name} 수량 줄이기`} disabled={disabled || line.quantity <= line.offer.minimum_order_qty} onClick={() => onQty(line, stepQty(line, -1))}>−</button>
        <input aria-label={`${offer.product_name} 발주수량`} disabled={disabled} type="number" min={line.offer.minimum_order_qty} step={line.offer.order_increment_qty} value={line.quantity} onChange={e => onQty(line, Number(e.target.value))} />
        <button type="button" aria-label={`${offer.product_name} 수량 늘리기`} disabled={disabled} onClick={() => onQty(line, stepQty(line, 1))}>+</button>
      </span> : null}
      <button type="button" className={`rd-btn pos-add${inCart ? ' is-selected' : ''}`} disabled={!canAdd} onClick={onAdd} aria-label={`${offer.product_name} 담기`}>{inCart ? '담김 ✓' : '담기'}</button>
    </div>
  </article>
}

function ProductOrderContent({ accountId, initialSource, embedded }: { accountId: string; initialSource: string; embedded: boolean }) {
  const {
    sites, ingredients, source, chooseSource, site, setSite, date, changeDate, query, setQuery, cart, busy, locked, message, result, page, setPage,
    search, order, newCart, canAdd, addToCart, setLineQuantity, removeLine, filtered, groups, cartTotal, canOrder,
  } = useProductOrder(accountId, initialSource)
  // 정렬은 보는 순서만 바꾼다(무엇을 발주할지는 담기로 사용자가 고름). 기본 추천순 = 늘 쓰는 상품 먼저 → 100g당 싼 순
  const [sort, setSort] = useState<SortKey>('recommend')
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [onlyOrderable, setOnlyOrderable] = useState(false)
  const shown = filtered.filter(o => (!onlyLinked || o.linked_ingredient_id) && (!onlyOrderable || (o.orderable_yn === 'Y' && o.orderability_status === 'AVAILABLE')))
  const sorted = [...shown].sort(SORTS[sort].compare)
  const cheapestId = (() => {
    const orderable = shown.filter(o => o.orderable_yn === 'Y' && unitCost(o))
    const per = orderable.some(o => unitCost(o)?.per === '100g') ? '100g' : unitCost(orderable[0] || shown[0] || ({} as SupplierOffer))?.per
    const same = orderable.filter(o => unitCost(o)?.per === per)
    return same.length > 1 ? same.reduce((best, o) => (unitCost(o)!.value < unitCost(best)!.value ? o : best)).supplier_offer_id : null
  })()
  const lineOf = (offer: SupplierOffer) => cart.find(line => line.offer.supplier_offer_id === offer.supplier_offer_id && line.date === date)
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const inCart = (offer: SupplierOffer) => cart.some(line => line.offer.supplier_offer_id === offer.supplier_offer_id && line.date === date)

  const body = <div className="pos-order rd rd-pos">
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
          <h2 className="rd-h2">{query.trim() ? `'${query.trim()}' 상품 ${shown.length}개` : `공급상품 ${shown.length}개`}{shown.length !== filtered.length ? <small className="rd-muted rd-fs-sm"> / 전체 {filtered.length}</small> : null}</h2>
          <div className="rd-pos__tools">
            <div className="rd-pills" role="group" aria-label="거르기">
              <button type="button" aria-pressed={onlyLinked} className={onlyLinked ? 'is-active' : ''} onClick={() => { setOnlyLinked(v => !v); setPage(1) }}>늘 쓰는 상품만</button>
              <button type="button" aria-pressed={onlyOrderable} className={onlyOrderable ? 'is-active' : ''} onClick={() => { setOnlyOrderable(v => !v); setPage(1) }}>발주 가능만</button>
            </div>
            <select className="rd-input" aria-label="정렬" value={sort} onChange={e => { setSort(e.target.value as SortKey); setPage(1) }}>
              {(Object.keys(SORTS) as SortKey[]).map(key => <option key={key} value={key}>{SORTS[key].label}</option>)}
            </select>
          </div>
        </header>
        {shown.length ? <div className="pos-grid">
          {sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(offer =>
            <OfferCard key={offer.supplier_offer_id} offer={offer} inCart={inCart(offer)} canAdd={canAdd(offer)} onAdd={() => addToCart(offer)}
              cheapest={offer.supplier_offer_id === cheapestId} line={lineOf(offer)} onQty={setLineQuantity} disabled={busy || locked} />)}
        </div> : <p className="pos-empty">{busy ? '상품 조회 중' : filtered.length ? '거르기 조건에 맞는 상품 없음 · 거르기 해제 요망' : '조회된 상품 없음 · 납품일 선택 후 상품 조회 요망'}</p>}
        {shown.length > PAGE_SIZE && <nav className="pos-pager" aria-label="상품 쪽 이동">
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
  return <div className="menu-manager-page mixed-product-order"><main className="menu-manager-content"><SideMenuLayout header={<HeaderBar title="상품발주" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주관리' }, { label: '상품발주' }]} />}>{body}</SideMenuLayout></main></div>
}
