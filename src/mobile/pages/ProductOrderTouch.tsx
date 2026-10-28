import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import BatchResultList from '../BatchResultList'
import { useProductOrder, lineKey, SOURCE_REASON, type CartLine } from '../../features/order/useProductOrder'
import { preparationLabel, useCatalogPreparation } from '../../features/order/useCatalogPreparation'
import './ProductOrderTouch.css'
import TouchSelect from '../TouchSelect'

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const PAGE = 30

/**
 * 상품 검색 발주(태블릿·휴대폰): 식재료·사업장·납품일 → 상품 검색 → 상품 카드 '담기', 오른쪽 장바구니(공급사·사업장·납품일별 묶음)에서 수량 −/+ 후 발주.
 * 로직은 PC 발주하기 '상품 검색' 탭과 같은 useProductOrder.
 */
export default function ProductOrderTouch({ methodBar, favorites = false }: { methodBar: ReactNode; favorites?: boolean }) {
  const [params] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  return <Content key={accountId} accountId={accountId} initialSource={params.get('ingredient_id') || ''} methodBar={methodBar} favorites={favorites} />
}

function Content({ accountId, initialSource, methodBar, favorites }: { accountId: string; initialSource: string; methodBar: ReactNode; favorites: boolean }) {
  const p = useProductOrder(accountId, initialSource, favorites)
  const prep = useCatalogPreparation(accountId, p.date, () => void p.search(favorites || p.favoriteMode))
  const [limit, setLimit] = useState(PAGE)
  const [sort, setSort] = useState<'recommend' | 'price_asc' | 'price_desc'>('recommend')
  const submit = (event: FormEvent) => { event.preventDefault(); setLimit(PAGE); void p.search() }
  const bump = (line: CartLine, direction: number) => {
    const step = line.offer.order_increment_qty || 1
    p.setLineQuantity(line, Math.max(line.offer.minimum_order_qty || step, Math.round((line.quantity + direction * step) * 1000) / 1000))
  }

  const aside = <div className="po-panel">
    <div className="po-panel__head"><h2>장바구니</h2><p>웰스토리·아워홈 상품을 함께 담으면 공급사·사업장·납품일별로 발주서가 나뉩니다.</p></div>
    <div className="po-panel__body">
      {p.result && <><h3 className="po-sub">발주 결과</h3><BatchResultList result={p.result} accountId={accountId} /></>}
      {!p.cart.length && !p.result && <p className="po-empty">상품 카드의 '담기'를 누르면 여기에 들어옵니다.</p>}
      {Object.entries(p.groups).map(([key, lines]) => <section key={key} className="po-group">
        <h3><span className="t-dot">{lines[0].offer.supplier_name.slice(0, 1)}</span><span>{lines[0].offer.supplier_name} · {lines[0].offer.external_site_name || lines[0].offer.external_site_code}<small>납품 {lines[0].date}</small></span></h3>
        <ul>{lines.map(line => <li key={lineKey(line)}>
          <div className="po-line__name"><strong>{line.offer.product_name}</strong><small>{won(line.quantity * line.offer.purchase_price)}</small></div>
          {/* 재고 식재료: 위에서 고른 것 또는 서버가 맞힌 것. 틀리면 여기서 바꾼다(2026-10-23) */}
          <label className={`po-line__stock${line.source ? '' : ' is-empty'}`}><span>재고</span>
            <TouchSelect disabled={p.busy || p.locked} value={line.source} onChange={e => p.setLineSource(line, e.target.value)}>
              <option value="">입고할 때 고르기</option>
              {line.source && !p.ingredientName(line.source) && <option value={line.source}>{line.offer.suggested_ingredient_name || line.source}</option>}
              {p.ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}
            </TouchSelect>
            {line.source && line.sourceBy && <small>{SOURCE_REASON[line.sourceBy]}</small>}
          </label>
          <div className="po-line__qty">
            <button type="button" className="t-round" aria-label="줄이기" disabled={p.busy || p.locked} onClick={() => bump(line, -1)}>−</button>
            <input type="text" inputMode="decimal" aria-label={`${line.offer.product_name} 발주수량`} disabled={p.busy || p.locked} value={line.quantity}
              onChange={e => p.setLineQuantity(line, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} />
            <button type="button" className="t-round" aria-label="늘리기" disabled={p.busy || p.locked} onClick={() => bump(line, 1)}>+</button>
            <span>{line.offer.order_unit}</span>
            <button type="button" className="t-btn is-small is-ghost" disabled={p.busy || p.locked} onClick={() => p.removeLine(line)}>빼기</button>
          </div>
        </li>)}</ul>
      </section>)}
    </div>
    <div className="po-panel__actions">
      <div className="t-summary">
        <div><span>품목</span><span>{p.cart.length}개</span></div>
        <div><span>발주서</span><span>{Object.keys(p.groups).length}건</span></div>
        <div className="is-total"><span>상품 금액</span><span>{won(p.cartTotal)}</span></div>
      </div>
      <button type="button" className="t-btn is-primary is-large is-block" disabled={!p.canOrder} onClick={() => void p.order()}>{p.busy && p.locked ? '발주 중…' : '공급사별 발주 확정'}</button>
      <div className="po-row">
        <button type="button" className="t-btn is-small is-ghost" disabled={p.busy} onClick={p.newCart}>새 발주 작성</button>
        <button type="button" className="t-btn is-small is-ghost" disabled={p.busy || !accountId} onClick={() => void p.order(true)}>이전 요청 결과 확인</button>
      </div>
    </div>
  </div>

  // 정렬(2026-10-22): 추천(나만의 식재료·늘 쓰는 상품 먼저) · 가격 낮은 순 · 가격 높은 순
  const sorted = [...p.filtered].sort((a, b) => sort === 'price_asc' ? a.purchase_price - b.purchase_price : sort === 'price_desc' ? b.purchase_price - a.purchase_price
    : Number(b.favorite_yn === 'Y') - Number(a.favorite_yn === 'Y') || Number(b.usual_ingredient_ids.length > 0) - Number(a.usual_ingredient_ids.length > 0))
  const shown = sorted.slice(0, limit)
  return <TouchLayout title="발주하기" subtitle="상품 검색" aside={aside}>
    {methodBar}
    <form className="t-card po-filters" onSubmit={submit}>
      <label className="po-field">재고에 넣을 식재료<TouchSelect disabled={p.busy || p.locked} value={p.source} onChange={e => p.chooseSource(e.target.value)}>
        <option value="">상품마다 자동</option>{p.ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}
      </TouchSelect></label>
      <label className="po-field">공급사 · 사업장<TouchSelect disabled={p.busy} value={p.site} onChange={e => { p.setSite(e.target.value); setLimit(PAGE) }}>
        <option value="">전체</option>{p.sites.map(s => <option key={s.supplier_account_site_id} value={s.supplier_account_site_id}>{s.supplier_name} · {s.external_site_name || s.external_site_code}</option>)}
      </TouchSelect></label>
      <label className="po-field">납품일<input type="date" disabled={p.busy} value={p.date} onChange={e => p.changeDate(e.target.value)} /></label>
      <label className="t-chip po-search"><TouchIcon name="search" /><input type="search" value={p.query} placeholder="상품명 · 코드 · 공급사" onChange={e => p.setQuery(e.target.value)} /></label>
      <button type="submit" className="t-btn is-primary" disabled={p.busy || !p.date || !accountId}>{p.busy && !p.locked ? '찾는 중…' : '상품 찾기'}</button>
      <button type="button" className={`t-btn${p.favoriteMode ? ' is-primary' : ' is-soft'}`} disabled={p.busy || !p.date || !accountId} onClick={() => { setLimit(PAGE); void p.search(true) }}>♥ 나만의 식재료</button>
      <label className="po-field">정렬<TouchSelect value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
        <option value="recommend">추천순</option><option value="price_asc">가격 낮은 순</option><option value="price_desc">가격 높은 순</option>
      </TouchSelect></label>
      <div className="po-prep">
        {prep.result?.suppliers.map(s => <span key={s.supplier_code} className={`t-badge ${s.status === 'READY' ? 'is-ok' : 'is-warn'}`} title={s.message}>{s.supplier_name} {preparationLabel(s.status)}</span>)}
        {prep.needsRetry && <button type="button" className="t-btn is-small is-soft" onClick={prep.retry}>상품 준비 다시 확인</button>}
      </div>
    </form>

    {p.message && <p className="t-msg is-warn" role="status">{p.message}</p>}
    {!p.busy && p.offers.length === 0 && <p className="t-msg">{p.favoriteMode ? '나만의 식재료가 없습니다. 상품의 ♡를 눌러 지정하면 여기서 바로 발주할 수 있습니다.' : "찾을 상품 이름을 넣고 '상품 찾기'를 누르세요."}</p>}
    {p.filtered.length > 0 && <p className="po-count">{p.filtered.length}개 상품</p>}

    <div className="po-grid">
      {shown.map(o => {
        const blocked = o.orderable_yn !== 'Y' || o.minimum_order_qty <= 0
        const added = p.cart.some(l => l.offer.supplier_offer_id === o.supplier_offer_id && l.date === p.date)
        return <article key={o.supplier_offer_id} className={`t-card po-offer${added ? ' is-selected' : ''}`}>
          <span className="po-offer__top"><span className="t-dot">{o.supplier_name.slice(0, 1)}</span><small>{o.supplier_name}<br />{o.external_site_name || o.external_site_code}</small>
            <button type="button" className="po-offer__heart" aria-pressed={o.favorite_yn === 'Y'} aria-label={`${o.product_name} 나만의 식재료${o.favorite_yn === 'Y' ? ' 해제' : ' 지정'}`} onClick={() => void p.toggleFavorite(o)}>{o.favorite_yn === 'Y' ? '♥' : '♡'}</button></span>
          <strong>{o.product_name}</strong>
          <small>{o.supplier_item_code} · {o.base_qty}{o.base_unit}/{o.order_unit}</small>
          <span className="po-offer__price">{won(o.purchase_price)}</span>
          {(o.orderability_reason || o.availability_reason) && <small className={blocked ? 'po-offer__warn' : ''}>{o.orderability_reason || o.availability_reason}</small>}
          <button type="button" className={`t-btn is-block ${added ? '' : 'is-soft'}`} disabled={!p.canAdd(o)} onClick={() => p.addToCart(o)}>{added ? '담김' : blocked ? '주문 불가' : '담기'}</button>
        </article>
      })}
    </div>
    {p.filtered.length > limit && <button type="button" className="t-btn is-soft is-block po-more" onClick={() => setLimit(v => v + PAGE)}>더 보기 ({p.filtered.length - limit}개 남음)</button>}
  </TouchLayout>
}
