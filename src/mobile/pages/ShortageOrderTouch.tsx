import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import BatchResultList from '../BatchResultList'
import FavoriteProductHeart from '../../components/FavoriteProductHeart'
import ProductImage from '../../components/ProductImage'
import { recoverMixedProcurement, startNewMixedProcurement } from '../../api/mixedProcurement'
import { blockedReasons, MANUAL_MAX_ORDER_QTY, shortageStockStatus, SHORTAGE_STOCK_LABELS, type ShortageRow, type ShortageStockFilter } from '../../api/shortageProcurement'
import { day, deliveryTerms, deliveryWarning, money, number, offerOptions, per100, taxLabel, useShortageOrder } from '../../features/order/useShortageOrder'
import { preparationLabel, useCatalogPreparation } from '../../features/order/useCatalogPreparation'
import './ShortageOrderTouch.css'
import TouchSelect from '../TouchSelect'

const FILTERS: { key: ShortageStockFilter; label: string; icon: TouchIconName }[] = [
  { key: '', label: '전체', icon: 'inventory' },
  { key: 'RED', label: '필요량 부족', icon: 'alert' },
  { key: 'YELLOW', label: '안전재고 미달', icon: 'box' },
  { key: 'CHECK', label: '확인 필요', icon: 'search' },
]
const SOURCE_HINT = {
  PLAN: '저장된 식단 필요량 + 안전재고 − 현재고 − 입고예정',
  STOCK: '현재고가 없거나 안전재고보다 적은 식자재. 사용 이력이 없으면 수량을 직접 넣습니다',
  INVENTORY: '최근 평균 사용량 × 확보일수 + 안전재고. 사용 확정 이력이 없으면 필요량 0',
  DRAFT: '저장하지 않은 식단의 메뉴·예정 식수로 계산',
  FAVORITE_MENU: '나만의 메뉴(♥)에 쓰이는 식재료. 수량을 직접 넣어 주문합니다',
} as const

/**
 * 부족량 기준 발주(식단 기준·현재 부족·사용량 예상, 태블릿·휴대폰). 조건 → 상태 칸 → 식재료 카드(상품 고르기·수량 −/+),
 * 오른쪽 요약에서 발주서 확인 → 미리보기 창에서 공급사 발주. 로직은 PC 발주하기 탭과 같은 useShortageOrder.
 */
export default function ShortageOrderTouch({ methodBar, fixedSource, title }: { methodBar: ReactNode; fixedSource: 'PLAN' | 'STOCK' | 'INVENTORY' | 'FAVORITE_MENU'; title: string }) {
  const o = useShortageOrder(fixedSource)
  const prep = useCatalogPreparation(o.accountId, o.criteria.delivery_date, () => o.setRevision(n => n + 1))
  const busy = o.loading || o.previewing

  const choose = (row: ShortageRow, offerId: number) => {
    const next = row.offers.find(item => item.supplier_offer_id === offerId && item.orderable)
    if (!next) return
    if (next.orderability_status !== 'AVAILABLE' && !window.confirm(next.product_name + ' · ' + o.criteria.delivery_date + '\n공급사에 납품 가능일과 마감 조건을 직접 확인하셨습니까? 확인한 경우에만 선택하세요.')) return
    o.setSelected(current => ({ ...current, [row.ingredient_id]: { ingredient_id: row.ingredient_id, supplier_offer_id: next.supplier_offer_id, order_qty: next.recommended_qty, delivery_terms_confirmed: next.orderability_status !== 'AVAILABLE' } }))
  }
  const unselect = (row: ShortageRow) => o.setSelected(current => { const next = { ...current }; delete next[row.ingredient_id]; return next })
  const setQty = (row: ShortageRow, qty: number) => o.setSelected(current => {
    const selection = current[row.ingredient_id]
    return selection ? { ...current, [row.ingredient_id]: { ...selection, order_qty: Math.max(0, Math.round(qty * 1000) / 1000) } } : current
  })
  const selectEligible = () => o.setSelected(current => ({ ...(o.stockFilter || o.keyword ? current : {}), ...Object.fromEntries(o.rows.flatMap(row => {
    const offer = row.offers.find(item => item.orderable && item.orderability_status === 'AVAILABLE')
    return offer ? [[row.ingredient_id, { ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, order_qty: offer.recommended_qty }]] : []
  })) }))
  const newOrder = () => { try { startNewMixedProcurement(o.accountId); o.setBatchResult(null); o.setCompleted(false); o.setSelected({}); o.setPreview(null); o.setRevision(v => v + 1); o.setError('') } catch (e) { o.setError(e instanceof Error ? e.message : '기존 발주 확인 필요') } }
  const recover = () => { o.setSubmitting(true); void recoverMixedProcurement(o.accountId).then(o.setBatchResult).catch(e => o.setError(e.message)).finally(() => o.setSubmitting(false)) }

  const aside = <div className="so-panel">
    <div className="so-panel__head"><h2>발주 요약</h2><p>공급사·사업장·납품일별로 발주서가 나뉩니다.</p></div>
    <div className="so-panel__body">
      {o.batchResult && !o.preview && <><h3 className="so-sub">최근 발주 결과</h3><BatchResultList result={o.batchResult} accountId={o.accountId} /></>}
      <div className="t-summary">
        <div><span>선택 품목</span><span>{o.selectionCount}개</span></div>
        <div><span>공급사</span><span>{o.selectedSuppliers.join(' · ') || '-'}</span></div>
        <div><span>납품일</span><span>{o.criteria.delivery_date || '미선택'}</span></div>
        <div className="is-total"><span>예상 상품금액</span><span>{o.loading ? '조회 중…' : `${money(o.selectedAmount)}원`}</span></div>
      </div>
      <div className="so-row">
        <button type="button" className="t-btn is-soft is-block" disabled={o.loading} onClick={selectEligible}>조건 만족 품목 모두 담기</button>
        <button type="button" className="t-btn is-block" disabled={!o.selectionCount} onClick={() => o.setSelected({})}>선택 해제</button>
      </div>
      <p className="so-hint">판가 × 발주수량입니다. 최종 금액과 발주 가능 여부는 발주서 확인 때 다시 검증합니다. 납품·마감 확인이 필요한 상품은 일괄 담기에서 빠집니다.</p>
      <div className="so-row">
        <button type="button" className="t-btn is-small is-ghost" disabled={o.submitting || o.previewing} onClick={newOrder}>새 발주 작성</button>
        <button type="button" className="t-btn is-small is-ghost" disabled={o.submitting} onClick={recover}>이전 요청 결과 확인</button>
      </div>
    </div>
    <div className="so-panel__actions">
      <button type="button" className="t-btn is-primary is-large is-block" disabled={!o.selectionCount || busy} onClick={() => void o.makePreview()}>{o.previewing ? '서버 검증 중…' : `발주서 확인 · ${o.selectionCount}개`}</button>
    </div>
  </div>

  const c = o.criteria
  return <TouchLayout title="발주하기" subtitle={title} aside={aside}>
    {methodBar}
    <section className="t-card so-filters" aria-label="조회 조건">
      {c.source === 'PLAN' && <label className="so-field so-field--wide">식단표<TouchSelect value={c.table_id} disabled={busy} onChange={e => o.update({ table_id: e.target.value })}>
        <option value="">기간 안의 모든 식단표</option>{o.plans.map(plan => <option key={plan.table_id} value={plan.table_id}>{plan.table_name}</option>)}
      </TouchSelect></label>}
      {c.source === 'INVENTORY' && <>
        <label className="so-field">사용량 조회일수<input type="number" inputMode="numeric" min="1" max="365" value={c.average_days} onChange={e => o.update({ average_days: Number(e.target.value) })} /></label>
        <label className="so-field">확보일수<input type="number" inputMode="numeric" min="1" max="30" value={c.coverage_days} onChange={e => o.update({ coverage_days: Number(e.target.value) })} /></label>
      </>}
      <label className="so-field">조회 시작일<input type="date" value={c.date_from} onChange={e => o.update({ date_from: e.target.value })} /></label>
      <label className="so-field">조회 종료일<input type="date" value={c.date_to} onChange={e => o.update({ date_to: e.target.value })} /></label>
      <label className="so-field">납품일<input type="date" min={day()} max={c.date_to} value={c.delivery_date} onChange={e => o.update({ delivery_date: e.target.value })} /></label>
      <label className="so-field so-field--wide">공급사 사업장<TouchSelect value={c.sold_to ? (c.supplier_code || 'WELSTORY') + ':' + c.sold_to : ''} onChange={e => { const [supplier_code = '', sold_to = ''] = e.target.value.split(':'); o.update({ sold_to, supplier_code }) }}>
        <option value="">전체 공급사·사업장</option>{o.sites.map(site => <option key={site.supplier_account_site_id} value={site.supplier_code + ':' + site.external_site_code}>{site.supplier_name} · {site.external_site_name} ({site.external_site_code})</option>)}
      </TouchSelect></label>
      <label className="t-chip so-search"><TouchIcon name="search" /><input type="search" value={o.keyword} placeholder="식재료 검색" onChange={e => o.setKeyword(e.target.value)} /></label>
      <div className="so-filters__actions">
        <button type="button" className="t-btn is-primary" disabled={busy} onClick={() => o.setRevision(v => v + 1)}><TouchIcon name="refresh" size={18} />{o.loading ? '조회 중…' : '부족재고 조회'}</button>
        <button type="button" className={`t-btn${o.autoRefresh ? ' is-soft' : ''}`} aria-pressed={o.autoRefresh} onClick={() => o.setAutoRefresh(!o.autoRefresh)}>{o.autoRefresh ? '60초마다 새로고침 중' : '60초마다 새로고침'}</button>
      </div>
      <p className="so-hint so-filters__hint"><b>기준</b> {SOURCE_HINT[c.source as keyof typeof SOURCE_HINT] || ''}{c.source === 'DRAFT' ? <> (<Link to={`/operations/table-meals?account_id=${encodeURIComponent(o.accountId)}`}>식단 구성으로</Link>)</> : null}</p>
      <div className="so-prep">
        {prep.result?.suppliers.map(s => <span key={s.supplier_code} className={`t-badge ${s.status === 'READY' ? 'is-ok' : 'is-warn'}`} title={s.message}>{s.supplier_name} {preparationLabel(s.status)}</span>)}
        {prep.result?.suppliers.length === 0 && <span className="t-badge is-warn">공급사 사업장 미지정</span>}
        {prep.needsRetry && <button type="button" className="t-btn is-small is-soft" onClick={prep.retry}>상품 준비 다시 확인</button>}
        {c.delivery_date === o.guidanceNow.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) && <span className="t-badge is-danger">당일 납품 · D-1 이상 품목 납품일자 변경 요망</span>}
      </div>
    </section>

    <div className="t-tabs so-tabs" role="tablist" aria-label="재고 상태">
      {FILTERS.map(f => <button key={f.key || 'all'} type="button" role="tab" aria-selected={o.stockFilter === f.key}
        className={`t-tab${o.stockFilter === f.key ? ' is-active' : ''}`} onClick={() => o.setStockFilter(f.key)}>
        <TouchIcon name={f.icon} /><strong>{f.label}</strong><small>{o.stockCounts[f.key]}개</small>
      </button>)}
    </div>

    {o.error && <p className="t-msg is-error" role="alert">{o.error}</p>}
    {o.loading && !o.rows.length && <p className="t-msg" role="status">부족량을 조회하고 있습니다…</p>}
    {!o.loading && !o.rows.length && <p className="t-msg">{o.stockFilter && o.result?.ingredients.length ? '고른 재고 상태에 해당하는 식재료가 없습니다.' : '이 기준에 해당하는 부족 식재료가 없습니다.'}</p>}

    <div className="so-grid">
      {o.rows.map(row => {
        const selection = o.selected[row.ingredient_id]
        const offer = row.offers.find(item => item.supplier_offer_id === selection?.supplier_offer_id) || row.offers.find(item => item.orderable)
        const status = shortageStockStatus(row)
        const qty = selection?.order_qty ?? offer?.recommended_qty ?? 0
        const step = offer?.order_increment_qty || 1
        const warning = offer ? deliveryWarning(offer, c.delivery_date, o.guidanceNow) : ''
        return <article key={row.ingredient_id} className={`t-card so-item${selection ? ' is-selected' : ''}${row.ingredient_id === o.focusIngredient ? ' is-focused' : ''}`}>
          <header>
            <div>
              <strong>{row.ingredient_name}</strong>
              {row.quantity_basis === 'MANUAL' ? <span className="t-badge is-danger">현재고 없음 · 수량 직접 입력</span> : status !== 'GREEN' ? <span className={`t-badge ${status === 'RED' ? 'is-danger' : 'is-warn'}`}>{SHORTAGE_STOCK_LABELS[status]}</span> : null}
            </div>
            <button type="button" className={`so-check${selection ? ' is-on' : ''}`} aria-pressed={Boolean(selection)} aria-label={`${row.ingredient_name} 선택`} disabled={!offer || o.loading}
              onClick={() => selection ? unselect(row) : offer && choose(row, offer.supplier_offer_id)}>{selection ? <TouchIcon name="check" size={20} /> : null}</button>
          </header>
          {row.menu_names.filter(Boolean).length > 0 && <p className="so-item__menus">{row.menu_names.filter(Boolean).join(', ')}</p>}
          {row.issues.map(issue => <p key={issue} className="so-item__issue">{issue}</p>)}
          <dl className="so-nums">
            <div><dt>필요</dt><dd>{number(row.required_qty)}</dd></div>
            <div><dt>안전</dt><dd>{number(row.safe_stock_qty)}</dd></div>
            <div><dt>현재</dt><dd>{number(row.current_qty)}</dd></div>
            <div><dt>입고예정</dt><dd>{number(row.incoming_qty)}</dd></div>
            <div className="is-short"><dt>부족</dt><dd>{number(row.shortage_qty)} <small>{row.base_unit}</small></dd></div>
          </dl>
          {offer ? <div className="so-offer">
            <ProductImage zoomable src={offer.thumbnail_url || offer.image_url || undefined} fullSrc={offer.image_url || undefined} name={offer.product_name} />
            <div>
              <TouchSelect aria-label={`${row.ingredient_name} 공급상품`} value={offer.supplier_offer_id} disabled={o.loading || row.offers.filter(item => item.orderable).length < 2} onChange={e => choose(row, Number(e.target.value))}>
                {offerOptions(row).map(item => <option key={item.supplier_offer_id} value={item.supplier_offer_id} disabled={!item.orderable}>{item.supplier_offer_id === row.recommended_offer_id ? '★ ' : ''}{item.product_name} ({item.supplier_name}) · {item.orderable ? `${money(item.purchase_price)}원/${item.order_unit}` : item.availability_reason || '발주 불가'}</option>)}
              </TouchSelect>
              <small>{offer.supplier_name} · {offer.external_site_name || offer.external_site_code}{row.offers.filter(item => item.orderable).length > 1 ? ` · 다른 상품 ${row.offers.filter(item => item.orderable).length - 1}개` : ''}</small>
              <span>{money(offer.purchase_price)}원/{offer.order_unit}{per100(offer, row.base_unit) ? <small> · {per100(offer, row.base_unit)}</small> : null}</span>
            </div>
          </div> : <p className="so-item__issue">{blockedReasons(row.offers.map(item => item.availability_reason), ' · ') || '주문 가능한 공급사 상품이 없습니다. 상품 검색에서 직접 골라주세요.'}</p>}
          {offer && <p className="so-item__terms">1 {offer.order_unit} = {number(offer.package_base_qty)} {row.base_unit} · {taxLabel(offer.tax_type)} · {deliveryTerms(offer)}
            <FavoriteProductHeart key={offer.supplier_product_id} accountId={o.accountId} supplierProductId={offer.supplier_product_id} productName={offer.product_name} favorite={offer.favorite_yn === 'Y'} /></p>}
          {warning && <p className="so-item__issue">{warning}</p>}
          {offer && <div className="so-qty">
            <button type="button" className="t-round" aria-label="줄이기" disabled={!selection || o.loading} onClick={() => setQty(row, qty - step)}>−</button>
            <input type="text" inputMode="decimal" aria-label={`${row.ingredient_name} 발주수량`} disabled={!selection || o.loading} value={qty}
              onChange={e => setQty(row, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} />
            <button type="button" className="t-round" aria-label="늘리기" disabled={!selection || o.loading || qty + step > (offer.quantity_basis === 'MANUAL' ? MANUAL_MAX_ORDER_QTY : offer.recommended_qty)} onClick={() => setQty(row, qty + step)}>+</button>
            <span className="so-qty__unit">{offer.order_unit}<small>{offer.quantity_basis === 'MANUAL' ? '직접 입력' : `권장 ${number(offer.recommended_qty)}`}</small></span>
            <strong className="so-qty__amount">{money(qty * offer.purchase_price)}원</strong>
          </div>}
        </article>
      })}
    </div>
    {o.result && <p className="so-hint so-checked">조회 시각 {o.result.checked_at.replace('T', ' ').slice(0, 19)}{o.result.unconfigured_count ? ` · 필요량 기준 없는 품목 ${o.result.unconfigured_count}건` : ''}</p>}

    {o.preview && <div className="t-sheet-backdrop" role="presentation" onClick={o.closePreview}>
      <section className="t-sheet so-sheet" role="dialog" aria-modal="true" aria-labelledby="so-sheet-title" onClick={e => e.stopPropagation()}>
        <header className="t-sheet__head">
          <h2 id="so-sheet-title">발주서 확인</h2>
          <p>납품일 {o.preview.criteria.delivery_date} · 발주서 {new Set(o.preview.items.map(row => row.offer.supplier_code + ':' + row.offer.external_site_code)).size}건(공급사·사업장별)</p>
        </header>
        <div className="t-sheet__body">
          <ul className="so-preview">{o.preview.items.map(row => <li key={row.ingredient_id}>
            <div><strong>{row.ingredient_name}</strong><small>{row.offer.supplier_name} · {row.offer.product_name}<FavoriteProductHeart accountId={o.accountId} supplierProductId={row.offer.supplier_product_id} productName={row.offer.product_name} favorite={row.offer.favorite_yn === 'Y'} /></small>
              {deliveryWarning(row.offer, o.preview!.criteria.delivery_date, o.guidanceNow) && <small className="so-item__issue">{deliveryWarning(row.offer, o.preview!.criteria.delivery_date, o.guidanceNow)}</small>}</div>
            <span>{number(row.order_qty)} {row.offer.order_unit}</span>
            <strong>{money(row.item_amount)}원</strong>
          </li>)}</ul>
          <div className="t-summary so-preview__total"><div className="is-total"><span>상품금액 합계</span><span>{money(o.preview.item_amount)}원</span></div></div>
          <p className="so-hint">과세 품목의 세액은 따로 더하지 않습니다. 주문 직전에 판매상태·실시간 가격·최소수량·발주배수와 최신 부족량을 다시 검증합니다.</p>
          {o.message && <p className="t-msg is-warn" role="status">{o.message}</p>}
          {o.batchResult && <BatchResultList result={o.batchResult} accountId={o.accountId} />}
        </div>
        <footer className="t-sheet__actions">
          <button type="button" className="t-btn is-large" disabled={o.submitting} onClick={o.closePreview}>닫기</button>
          <button type="button" className="t-btn is-primary is-large" disabled={o.submitting || o.completed} onClick={() => void o.submit()}>{o.submitting ? '발주 중…' : o.completed ? '발주 결과 확인됨' : '공급사에 발주'}</button>
        </footer>
      </section>
    </div>}
  </TouchLayout>
}
