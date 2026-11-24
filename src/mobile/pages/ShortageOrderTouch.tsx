import { useEffect, useMemo, useState, type ReactNode } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import BatchResultList from '../BatchResultList'
import FavoriteProductHeart from '../../components/FavoriteProductHeart'
import ProductImage from '../../components/ProductImage'
import { recoverMixedProcurement, startNewMixedProcurement } from '../../api/mixedProcurement'
import { blockedReasons, MANUAL_MAX_ORDER_QTY, shortageStockStatus, SHORTAGE_STOCK_LABELS, type ShortageRow, type ShortageStockFilter } from '../../api/shortageProcurement'
import { day, deliveryTerms, deliveryWarning, money, number, offerOptions, per100, useShortageOrder } from '../../features/order/useShortageOrder'
import { clearOrderCart, loadOrderCart, saveOrderCart } from '../../features/order/orderCart'
import { preparationLabel, useCatalogPreparation } from '../../features/order/useCatalogPreparation'
import './ShortageOrderTouch.css'
import TouchSelect from '../TouchSelect'
import { confirmDialog } from '../../utils/dialog'

const FILTERS: { key: ShortageStockFilter; label: string; icon: TouchIconName }[] = [
  { key: '', label: '전체', icon: 'inventory' },
  { key: 'RED', label: '필요량 부족', icon: 'alert' },
  { key: 'YELLOW', label: '안전재고 미달', icon: 'box' },
  { key: 'CHECK', label: '확인 필요', icon: 'search' },
]

/**
 * 부족량 기준 발주(식단 기준·현재 부족·사용량 예상, 태블릿·휴대폰). 로직은 PC 발주하기 탭과 같은 useShortageOrder.
 * 2026-11-23 시안: 상태 칩·방법 탭 → (접힌) 조회 조건 → 식재료 표(누르면 공급사 상품 펼침) → 아래 고정 띠 → 최종 검토 창(장바구니·발주하기).
 */
/** 추천 발주안(휴대폰도 PC와 같이 식단표 기준 화면 + 늘 쓰는 상품 미리 선택, 2026-11-23) */
const RECOMMENDED_OVERRIDE = { autoselect: '1', autoselect_mode: 'recommended' }

export default function ShortageOrderTouch({ methodBar, fixedSource, title, recommended = false }: { methodBar: ReactNode; fixedSource: 'PLAN' | 'STOCK' | 'INVENTORY' | 'FAVORITE_MENU'; title: string; recommended?: boolean }) {
  const o = useShortageOrder(fixedSource, recommended ? RECOMMENDED_OVERRIDE : undefined)
  const [reviewFilter, setReviewFilter] = useState<'' | 'OURHOME' | 'WELSTORY'>('')
  const prep = useCatalogPreparation(o.accountId, o.criteria.delivery_date, () => o.setRevision(n => n + 1))
  const busy = o.loading || o.previewing

  const choose = async (row: ShortageRow, offerId: number) => {
    const next = row.offers.find(item => item.supplier_offer_id === offerId && item.orderable)
    if (!next) return
    if (next.orderability_status !== 'AVAILABLE' && !(await confirmDialog(next.product_name + ' · ' + o.criteria.delivery_date + '\n공급사에 납품 가능일과 마감 조건을 직접 확인하셨습니까? 확인한 경우에만 선택하세요.'))) return
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

  // 2026-11-23 사용자 시안(태블릿): 식재료 줄 = 식재료 | 재고 > 필요 | 선택상품(100g당) | 주문수량, 줄을 누르면 아래에 아워홈(파랑)·웰스토리(주황) 상품 목록.
  // 오른쪽 요약 패널 대신 아래 고정 띠(선택·금액·담기·장바구니·최종 검토), 발주서 확인 창 = '최종 검토'(공급사별·전체 발주서 미리보기).
  const [cartVersion, setCartVersion] = useState(0)
  const [notice, setNotice] = useState('')
  // 발주를 마치면 장바구니를 비운다(저장소만 지우고, 화면은 completed로 숨긴다)
  useEffect(() => { if (o.completed) clearOrderCart(o.accountId, fixedSource) }, [o.completed, o.accountId, fixedSource])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cartVersion: 담기·지우기 뒤 다시 읽기
  const storedCart = useMemo(() => loadOrderCart(o.accountId, fixedSource), [o.accountId, fixedSource, cartVersion])
  const cart = o.completed ? null : storedCart
  const putInCart = () => {
    const saved = saveOrderCart(o.accountId, fixedSource, o.criteria.delivery_date, o.selected)
    setCartVersion(v => v + 1)
    setNotice(saved ? `장바구니에 ${saved.items.length}품목을 담아 두었어요. 이 기기에서 '장바구니 불러오기'로 다시 담을 수 있어요.` : '담은 품목이 없어 장바구니를 비웠어요.')
  }
  const restoreCart = () => {
    if (!cart) return
    const byId = new Map(o.rows.map(row => [row.ingredient_id, row]))
    const next: typeof o.selected = {}
    let skipped = 0
    for (const item of cart.items) {
      const row = byId.get(item.ingredient_id)
      const offer = row?.offers.find(x => x.supplier_offer_id === item.supplier_offer_id && x.orderable)
      if (!row || !offer) { skipped += 1; continue }
      next[item.ingredient_id] = { ...item }
    }
    o.setSelected(current => ({ ...current, ...next }))
    setNotice(`장바구니에서 ${Object.keys(next).length}품목을 다시 담았어요.${skipped ? ` ${skipped}품목은 지금 목록에 없거나 발주할 수 없어 빠졌어요.` : ''}${cart.delivery_date && cart.delivery_date !== o.criteria.delivery_date ? ` 담을 때 납품일은 ${cart.delivery_date}였어요.` : ''}`)
  }


  const c = o.criteria
  const previewBy = (code?: string) => (o.preview?.items || []).filter(row => !code || row.offer.supplier_code === code)
  const warnings = (o.preview?.items || []).map(row => ({ row, text: deliveryWarning(row.offer, o.preview!.criteria.delivery_date, o.guidanceNow) })).filter(w => w.text)

  const cartLink = <button type="button" className="mo-cartlink" disabled={!o.selectionCount || busy} onClick={() => void o.makePreview()}>{o.previewing ? '검증 중…' : `장바구니${o.selectionCount ? ` ${o.selectionCount}` : ''}`}</button>
  // 기준은 탭이 보여 주므로 부제는 추천 발주안 안내만(title은 화면 이름표용으로 aria에)
  return <TouchLayout title="발주하기" subtitle={recommended ? '늘 쓰는 상품을 미리 골라 뒀어요' : undefined} toolbar={cartLink}>
    <h2 className="t-sr-only">{title}</h2>
    <div className="mo-tabs">{methodBar}</div>
    <div className="mo-tools">
      <span className="mo-tools__sum"><b>{o.selectionCount}품목</b> · {o.loading ? '조회 중…' : `${money(o.selectedAmount)}원`}</span>
      <button type="button" className="mo-chipbtn" disabled={o.loading} onClick={selectEligible}>모두 담기</button>
      <button type="button" className="mo-chipbtn" disabled={!o.selectionCount} onClick={() => o.setSelected({})}>해제</button>
      {cart && <button type="button" className="mo-chipbtn is-cart" disabled={o.loading || !o.rows.length} onClick={restoreCart}>장바구니 불러오기 ({cart.items.length})</button>}
    </div>

    <details className="t-card so-filters-wrap" open={!c.delivery_date || undefined}>
      <summary>조회 조건 · 납품일 <b>{c.delivery_date || '미선택'}</b>{c.source === 'PLAN' ? ` · 식단 ${c.date_from} ~ ${c.date_to}` : ` · ${c.date_from} ~ ${c.date_to}`}{o.keyword ? ` · '${o.keyword}'` : ''}</summary>
      <section className="so-filters" aria-label="조회 조건">
        <div className="so-chips" role="tablist" aria-label="재고 상태">
          {FILTERS.map(f => <button key={f.key || 'all'} type="button" role="tab" aria-selected={o.stockFilter === f.key}
            className={`so-chip${o.stockFilter === f.key ? ' is-active' : ''}`} onClick={() => o.setStockFilter(f.key)}>{f.label} {o.stockCounts[f.key]}</button>)}
        </div>
        {c.source === 'PLAN' && <label className="so-field so-field--wide">식단표<TouchSelect value={c.table_id} disabled={busy} onChange={e => o.update({ table_id: e.target.value })}>
          <option value="">기간 안의 모든 식단표</option>{o.plans.map(plan => <option key={plan.table_id} value={plan.table_id}>{plan.table_name}</option>)}
        </TouchSelect></label>}
        {c.source === 'INVENTORY' && <>
          <label className="so-field">사용량 조회일수<input type="number" inputMode="numeric" min="1" max="365" value={c.average_days} onChange={e => o.update({ average_days: Number(e.target.value) })} /></label>
          <label className="so-field">확보일수<input type="number" inputMode="numeric" min="1" max="30" value={c.coverage_days} onChange={e => o.update({ coverage_days: Number(e.target.value) })} /></label>
        </>}
        <label className="so-field so-field--half">조회 시작일<input type="date" value={c.date_from} onChange={e => o.update({ date_from: e.target.value })} /></label>
        <label className="so-field so-field--half">조회 종료일<input type="date" value={c.date_to} onChange={e => o.update({ date_to: e.target.value })} /></label>
        <label className="so-field so-field--half">납품일<input type="date" min={day()} max={c.source === 'PLAN' ? undefined : c.date_to} value={c.delivery_date} onChange={e => o.chooseDelivery(e.target.value)} /></label>
        {/* 2026-11-24 사용자 요청: 휴대폰은 조회 시작·종료일 한 줄, 납품일·마지막 식단일 한 줄(설명 문구·'기준' 안내는 뺌) */}
        {c.source === 'PLAN' && <label className="so-field so-field--half">마지막 식단일<input type="date" min={c.date_from} value={c.date_to} onChange={e => o.chooseLastMealDay(e.target.value)} /></label>}
        <label className="so-field so-field--wide">공급사 사업장<TouchSelect value={c.sold_to ? (c.supplier_code || 'WELSTORY') + ':' + c.sold_to : ''} onChange={e => { const [supplier_code = '', sold_to = ''] = e.target.value.split(':'); o.update({ sold_to, supplier_code }) }}>
          <option value="">전체 공급사·사업장</option>{o.sites.map(site => <option key={site.supplier_account_site_id} value={site.supplier_code + ':' + site.external_site_code}>{site.supplier_name} · {site.external_site_name} ({site.external_site_code})</option>)}
        </TouchSelect></label>
        <label className="t-chip so-search"><TouchIcon name="search" /><input type="search" value={o.keyword} placeholder="식재료 검색" onChange={e => o.setKeyword(e.target.value)} /></label>
        <div className="so-filters__actions">
          <button type="button" className="t-btn is-primary" disabled={busy} onClick={() => o.setRevision(v => v + 1)}><TouchIcon name="refresh" size={18} />{o.loading ? '조회 중…' : '부족재고 조회'}</button>
          <button type="button" className={`t-btn${o.autoRefresh ? ' is-soft' : ''}`} aria-pressed={o.autoRefresh} onClick={() => o.setAutoRefresh(!o.autoRefresh)}>{o.autoRefresh ? '60초마다 새로고침 중' : '60초마다 새로고침'}</button>
          <button type="button" className="t-btn is-small is-ghost" disabled={o.submitting || o.previewing} onClick={newOrder}>새 발주 작성</button>
          <button type="button" className="t-btn is-small is-ghost" disabled={o.submitting} onClick={recover}>이전 요청 결과 확인</button>
        </div>
        <div className="so-prep">
          {prep.result?.suppliers.map(s => <span key={s.supplier_code} className={`t-badge ${s.status === 'READY' ? 'is-ok' : 'is-warn'}`} title={s.message}>{s.supplier_name} {preparationLabel(s.status)}</span>)}
          {prep.result?.suppliers.length === 0 && <span className="t-badge is-warn">공급사 사업장 미지정</span>}
          {prep.needsRetry && <button type="button" className="t-btn is-small is-soft" onClick={prep.retry}>상품 준비 다시 확인</button>}
        </div>
      </section>
    </details>
    {c.delivery_date === o.guidanceNow.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) && <p className="t-msg is-error">당일 납품 · D-1 이상 품목 납품일자 변경 요망</p>}

    {o.batchResult && !o.preview && <section className="t-card so-result"><h3 className="so-sub">최근 발주 결과</h3><BatchResultList result={o.batchResult} accountId={o.accountId} /></section>}
    {notice && <p className="t-msg" role="status" onClick={() => setNotice('')}>{notice}</p>}
    {o.error && <p className="t-msg is-error" role="alert">{o.error}</p>}
    {o.result?.missing_recipe_menus?.length ? <p className="t-msg is-warn" role="status">1인분 식재료(레시피)가 없어 필요량 계산에서 뺀 메뉴: {o.result.missing_recipe_menus.map(m => m.menu_name || m.menu_id).join(', ')} · 식단표에서 메뉴를 눌러 식재료를 넣거나 '완제품'·'레시피 없는 메뉴'로 정해 주세요.</p> : null}
    {o.loading && !o.rows.length && <p className="t-msg" role="status">부족량을 조회하고 있습니다…</p>}
    {!o.loading && !o.rows.length && <p className="t-msg">{o.stockFilter && o.result?.ingredients.length ? '고른 재고 상태에 해당하는 식재료가 없습니다.' : '이 기준에 해당하는 부족 식재료가 없습니다.'}</p>}

    {/* 2026-11-23 사용자 시안(휴대폰): 식재료 카드 = 이름·상태 → 재고 → 필요 → 주문 수량 −/+ → 선택 상품 → 추천 상품 비교(누르면 그 상품으로) */}
    <div className="mo-list">
      {o.rows.map(row => {
        const selection = o.selected[row.ingredient_id]
        const offer = row.offers.find(item => item.supplier_offer_id === selection?.supplier_offer_id) || row.offers.find(item => item.supplier_offer_id === row.recommended_offer_id && item.orderable) || row.offers.find(item => item.orderable)
        const status = shortageStockStatus(row)
        const qty = selection?.order_qty ?? offer?.recommended_qty ?? 0
        const step = offer?.order_increment_qty || 1
        const warning = offer ? deliveryWarning(offer, c.delivery_date, o.guidanceNow) : ''
        const compare = offerOptions(row).slice(0, 6)
        return <article key={row.ingredient_id} className={`t-card mo-item${selection ? ' is-selected' : ''}${row.ingredient_id === o.focusIngredient ? ' is-focused' : ''}`}>
          <header className="mo-item__head">
            <strong>{row.ingredient_name}</strong>
            {row.quantity_basis === 'MANUAL' ? <span className="mo-status is-danger">수량 직접 입력</span> : status !== 'GREEN' ? <span className={`mo-status${status === 'RED' ? ' is-warn' : ''}`}>{status === 'RED' ? '모자람' : SHORTAGE_STOCK_LABELS[status]}</span> : null}
            <button type="button" className={`mo-toggle${selection ? ' is-on' : ''}`} aria-pressed={Boolean(selection)} disabled={!offer || o.loading}
              onClick={() => { if (selection) unselect(row); else if (offer) void choose(row, offer.supplier_offer_id) }}>{selection ? '담김 ✓' : '담기'}</button>
          </header>
          <div className="mo-line"><span>재고 → 필요</span><b>{number(row.current_qty)} {row.base_unit} → {number(row.required_qty)} {row.base_unit}</b></div>
          {row.menu_names.filter(Boolean).length > 0 && <p className="mo-menus">포함 메뉴: {row.menu_names.filter(Boolean).join(', ')}</p>}
          {row.issues.map(issue => <p key={issue} className="mo-issue">{issue}</p>)}
          {offer && <div className="mo-qty">
            <div><b>주문 수량</b><small>{offer.order_unit} 단위 · {offer.quantity_basis === 'MANUAL' ? '직접 입력' : `권장 ${number(offer.recommended_qty)}`}{selection ? ` · ${money(qty * offer.purchase_price)}원` : ''}</small></div>
            <div className="mo-stepper">
              <button type="button" aria-label="줄이기" disabled={!selection || o.loading} onClick={() => setQty(row, qty - step)}>−</button>
              <input type="text" inputMode="decimal" aria-label={`${row.ingredient_name} 발주수량`} disabled={!selection || o.loading} value={qty} onChange={e => setQty(row, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} />
              <button type="button" aria-label="늘리기" disabled={!selection || o.loading || qty + step > (offer.quantity_basis === 'MANUAL' ? MANUAL_MAX_ORDER_QTY : offer.recommended_qty)} onClick={() => setQty(row, qty + step)}>+</button>
            </div>
          </div>}
          {offer ? <section className="mo-picked">
            <header><b>선택 상품</b>{offer.supplier_offer_id === row.recommended_offer_id ? <span>추천</span> : null}</header>
            <div className="mo-picked__row">
              <ProductImage zoomable src={offer.thumbnail_url || offer.image_url || undefined} fullSrc={offer.image_url || undefined} name={offer.product_name} />
              <div>
                <strong>{money(offer.purchase_price)}원 / {offer.order_unit}</strong>
                <small>{per100(offer, row.base_unit) || '-'} · {offer.orderability_status === 'AVAILABLE' ? '발주 가능' : '확인 필요'}{offer.lead_time_days ? ` D-${offer.lead_time_days}` : ''}</small>
                <small className="mo-picked__name"><i className={`mo-dot is-${offer.supplier_code}`} aria-hidden="true" />{offer.supplier_name} · {offer.product_name}
                  <FavoriteProductHeart key={offer.supplier_product_id} accountId={o.accountId} supplierProductId={offer.supplier_product_id} productName={offer.product_name} favorite={offer.favorite_yn === 'Y'} /></small>
              </div>
            </div>
            <p className="mo-deadline">{warning || deliveryTerms(offer)}</p>
          </section> : <p className="mo-issue">{blockedReasons(row.offers.map(item => item.availability_reason), ' · ') || '주문 가능한 공급사 상품이 없습니다. 상품 검색에서 직접 골라주세요.'}</p>}
          {compare.length > 1 && <section className="mo-compare">
            <h4>추천 상품 비교</h4>
            <ul>{compare.map(x => {
              const on = Boolean(selection) && x.supplier_offer_id === selection?.supplier_offer_id
              return <li key={x.supplier_offer_id} className={on ? 'is-on' : ''}>
                <ProductImage src={x.thumbnail_url || x.image_url || undefined} fullSrc={x.image_url || undefined} name={x.product_name} />
                <div><strong>{x.product_name}</strong><small><i className={`mo-dot is-${x.supplier_code}`} aria-hidden="true" />{x.orderable ? `${money(x.purchase_price)}원 / ${per100(x, row.base_unit) || x.order_unit}` : x.availability_reason || '발주 불가'}</small></div>
                <button type="button" className={`mo-pick${on ? ' is-on' : ''}`} disabled={!x.orderable || o.loading || on} onClick={() => void choose(row, x.supplier_offer_id)}>{on ? '선택됨' : '선택'}</button>
              </li>
            })}</ul>
          </section>}
        </article>
      })}
    </div>
    {o.result && <p className="so-hint so-checked">조회 시각 {o.result.checked_at.replace('T', ' ').slice(0, 19)}{o.result.unconfigured_count ? ` · 필요량 기준 없는 품목 ${o.result.unconfigured_count}건` : ''}</p>}

    {o.preview && <div className="t-sheet-backdrop mo-review-wrap" role="presentation" onClick={o.closePreview}>
      <section className="mo-review" role="dialog" aria-modal="true" aria-labelledby="mo-review-title" onClick={e => e.stopPropagation()}>
        <header className="mo-review__head">
          <div><small>발주관리</small><h2 id="mo-review-title">최종 검토 <span>장바구니</span></h2></div>
          <button type="button" className="mo-close" aria-label="닫기" disabled={o.submitting} onClick={o.closePreview}><TouchIcon name="close" size={18} /></button>
        </header>
        <p className="mo-review__sub">납품일 {o.preview.criteria.delivery_date} · 발주서 {new Set(o.preview.items.map(row => row.offer.supplier_code + ':' + row.offer.external_site_code)).size}건 · {o.preview.items.length}품목</p>
        <div className="mo-review__chips" role="tablist" aria-label="공급사">
          {([['', '전체'], ['OURHOME', '아워홈'], ['WELSTORY', '삼성웰스토리']] as const).map(([key, label]) => <button key={key || 'all'} type="button" role="tab" aria-selected={reviewFilter === key}
            className={`mo-rchip${key ? ` is-${key}` : ' is-all'}${reviewFilter === key ? ' is-active' : ''}`} onClick={() => setReviewFilter(key)}>{label}</button>)}
        </div>
        {(() => {
          const rows = previewBy(reviewFilter || undefined)
          const total = rows.reduce((sum, row) => sum + Number(row.item_amount || 0), 0)
          return <article className="t-card mo-review__card">
            <header><b>발주서 미리보기</b><span><em className="is-OURHOME">아워홈</em> · <em className="is-WELSTORY">삼성웰스토리</em></span></header>
            <ul>{rows.map(row => <li key={row.ingredient_id}><span>{row.ingredient_name}<small>{row.offer.product_name} · {number(row.order_qty)}{row.offer.order_unit}</small></span><i className={`mo-dot is-${row.offer.supplier_code}`} aria-hidden="true" /><b>{money(row.item_amount)}원</b></li>)}</ul>
            {!rows.length && <p className="mo-review__empty">이 공급사에 담은 품목이 없어요.</p>}
            <div className="mo-review__total"><span>총계</span><b>{money(total)}원</b></div>
          </article>
        })()}
        {warnings.length > 0 && <ul className="so-review__warn">{warnings.map(w => <li key={w.row.ingredient_id}>{w.row.ingredient_name}: {w.text}</li>)}</ul>}
        <p className="so-hint">과세 품목의 세액은 따로 더하지 않습니다. 주문 직전에 판매상태·실시간 가격·최소수량·발주배수와 최신 부족량을 다시 검증합니다.</p>
        {o.message && <p className="t-msg is-warn" role="status">{o.message}</p>}
        {notice && <p className="t-msg" role="status">{notice}</p>}
        {o.batchResult && <BatchResultList result={o.batchResult} accountId={o.accountId} />}
        <footer className="mo-review__actions">
          <button type="button" className="mo-btn is-orange" disabled={o.submitting || o.completed} onClick={putInCart}>장바구니 저장</button>
          <button type="button" className="mo-btn is-green" disabled={o.submitting || o.completed} onClick={() => void o.submit()}>{o.submitting ? '발주 중…' : o.completed ? '발주 결과 확인됨' : '발주하기'}</button>
        </footer>
      </section>
    </div>}
  </TouchLayout>
}
