import { useMemo, useState, type ReactNode } from 'react'
import BatchResultList from '../BatchResultList'
import { Link, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import type { PreviewRow } from '../../api/shortageProcurement'
import { money, orderDay, useQuickOrder } from '../../features/order/useQuickOrder'
import { preparationLabel, useCatalogPreparation } from '../../features/order/useCatalogPreparation'
import './OrderTouch.css'

const qty = (value?: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const dateTile = (offset: number) => {
  const value = orderDay(offset)
  const d = new Date(`${value}T00:00:00`)
  return { value, weekday: '일월화수목금토'[d.getDay()], label: `${d.getMonth() + 1}.${d.getDate()}`, hint: offset === 0 ? '오늘' : offset === 1 ? '내일' : offset === 2 ? '모레' : '' }
}

/**
 * 발주하기(태블릿·휴대폰) = 추천 발주안. POS 배치: 위 납품일 칸 → 공급사별 품목 카드, 오른쪽 장바구니 패널에서 '공급사별 발주 확정'.
 * 로직은 PC 발주하기 첫 탭(QuickOrder)과 같은 useQuickOrder. 수량·상품 직접 조정과 상품 검색은 기존 상세 화면으로 간다.
 */
export function RecommendedOrder({ methodBar }: { methodBar: ReactNode }) {
  const [params] = useSearchParams()
  const [accountId, setAccountId] = useState(() => params.get('account_id') || localStorage.getItem('account_id') || '')
  const order = useQuickOrder(accountId)
  const prep = useCatalogPreparation(accountId, order.date, order.reloadPreview)
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => dateTile(i)), [])
  const groups = useMemo(() => {
    const map = new Map<string, PreviewRow[]>()
    for (const row of order.preview?.items || []) map.set(row.offer.supplier_name, [...(map.get(row.offer.supplier_name) || []), row])
    return [...map.entries()]
  }, [order.preview])
  const withAccount = (query: Record<string, string>) => `/order_manager/order?${new URLSearchParams({ ...query, account_id: accountId })}`

  const toolbar = <>
    <div className="t-segment" role="group" aria-label="계산 기준">
      <button type="button" className={order.source === 'PLAN' ? 'is-active' : ''} disabled={order.busy || order.attempted} onClick={() => order.changeSource('PLAN')}>식단 기준</button>
      <button type="button" className={order.source === 'INVENTORY' ? 'is-active' : ''} disabled={order.busy || order.attempted} onClick={() => order.changeSource('INVENTORY')}>평균 사용량 보충</button>
    </div>
    <button type="button" className="t-btn is-icon" aria-label="발주안 다시 준비" disabled={order.busy} onClick={order.refresh}><TouchIcon name="refresh" /></button>
  </>

  return <TouchLayout title="발주하기" subtitle="기존 사용상품으로 필요한 수량을 미리 골라 둔 발주안" toolbar={toolbar}
    aside={<CartPanel order={order} accountId={accountId} supplierCount={groups.length} />} onAccountChange={setAccountId}>
    {methodBar}
    <div className="t-tabs" role="tablist" aria-label="납품일">
      {dates.map(d => <button key={d.value} type="button" role="tab" aria-selected={order.date === d.value}
        className={`t-tab ot-date${order.date === d.value ? ' is-active' : ''}`} disabled={order.busy || order.attempted} onClick={() => order.changeDate(d.value)}>
        <TouchIcon name="truck" />
        <strong>{d.weekday}요일</strong>
        <small>{d.label} 납품</small>
        {d.hint && <span className="t-badge is-yellow ot-date__hint">{d.hint}</span>}
      </button>)}
    </div>

    {accountId && <div className="ot-prep" role="status" aria-label="납품일 상품 준비">
      {!prep.result && !prep.error && <span className="t-badge">상품·가격 준비 확인 중</span>}
      {prep.result?.suppliers.length === 0 && <span className="t-badge is-warn">공급사 사업장이 지정되지 않았습니다</span>}
      {prep.result?.suppliers.map(s => <span key={s.supplier_code} className={`t-badge ${s.status === 'READY' ? 'is-ok' : 'is-warn'}`} title={s.message}>{s.supplier_name} {preparationLabel(s.status)}</span>)}
      {prep.error && <span className="t-badge is-danger">{prep.error}</span>}
      {prep.needsRetry && <button type="button" className="t-btn is-small is-soft" onClick={prep.retry}>준비 상태 다시 확인</button>}
    </div>}

    {!accountId && <p className="t-msg">위에서 거래처를 고르면 발주안이 나옵니다.</p>}
    {order.error && <p className="t-msg is-error" role="alert">{order.error}</p>}
    {order.busy && !order.preview && <p className="t-msg" role="status">부족한 식재료와 발주안을 계산하고 있습니다…</p>}
    {!order.busy && order.result && !order.result.ingredients.length && <p className="t-msg">이 날짜에 발주할 부족 재료가 없습니다. 식단이 등록되어 있는지도 확인해주세요.</p>}

    {order.exceptions.length > 0 && <section className="ot-exceptions">
      <h2><TouchIcon name="alert" size={20} />확인이 필요한 식재료 {order.exceptions.length}개</h2>
      <ul>{order.exceptions.map(row => <li key={row.ingredient_id}>
        <strong>{row.ingredient_name}</strong>
        <span>{row.issues.join(' · ') || row.offers.map(o => o.orderability_reason || o.availability_reason).filter(Boolean).join(' · ') || '주상품이 없거나 주문할 수 없습니다. 상품·단위를 확인해주세요.'}</span>
      </li>)}</ul>
      <Link className="t-btn is-small" to={withAccount({ tab: order.source === 'PLAN' ? 'plan' : 'usage', source: order.source })}>상세 화면에서 상품 고르기</Link>
    </section>}

    {groups.map(([supplier, rows]) => <section key={supplier} className="ot-group">
      <h2 className="t-section-title"><span className="ot-group__title"><span className="t-dot">{supplier.slice(0, 1)}</span>{supplier}</span><small>{rows.length}품목 · {money(rows.reduce((sum, row) => sum + row.item_amount, 0))}원</small></h2>
      <div className="ot-grid">
        {rows.map(row => <article key={row.ingredient_id} className="t-card ot-item">
          <header>
            <strong>{row.ingredient_name}</strong>
            <small>{row.offer.product_name}</small>
          </header>
          {row.menu_names.length > 0 && <p className="ot-item__menus">{row.menu_names.slice(0, 3).join(', ')}{row.menu_names.length > 3 ? ` 외 ${row.menu_names.length - 3}` : ''}</p>}
          <div className="ot-item__qty">
            <span><b>{qty(row.order_qty)}</b> {row.offer.order_unit}</span>
            <strong>{money(row.item_amount)}원</strong>
          </div>
          <p className="ot-item__why">필요 {qty(row.required_qty)} + 안전 {qty(row.safe_stock_qty)} − 현재 {qty(row.current_qty)} − 입고예정 {qty(row.incoming_qty)} {row.base_unit}</p>
        </article>)}
      </div>
    </section>)}

    {accountId && <div className="ot-links">
      <Link className="t-btn is-soft" to={withAccount({ tab: order.source === 'PLAN' ? 'plan' : 'usage', source: order.source })}>수량·상품 직접 조정</Link>
      <Link className="t-btn is-soft" to={withAccount({ tab: 'products' })}>새 상품 찾아 주문</Link>
      <button type="button" className="t-btn is-soft" disabled={order.busy} onClick={() => void order.recover()}>이전 발주 결과 확인</button>
    </div>}
  </TouchLayout>
}

/** 오른쪽 장바구니(레퍼런스의 주문 패널): 납품일 → 품목 목록 → 합계 → 공급사별 발주 확정 / 결과 */
function CartPanel({ order, accountId, supplierCount }: { order: ReturnType<typeof useQuickOrder>; accountId: string; supplierCount: number }) {
  const items = order.preview?.items || []
  const d = new Date(`${order.date}T00:00:00`)

  if (order.batch) return <div className="ot-panel">
    <div className="ot-panel__head"><h2>발주 결과</h2><p>공급사별로 나눠 보냈습니다. 접수된 발주서는 다시 보내지 않습니다.</p></div>
    <div className="ot-panel__body">
      <BatchResultList result={order.batch} accountId={accountId} />
    </div>
    <div className="ot-panel__actions">
      <button type="button" className="t-btn is-primary is-large is-block" disabled={order.busy} onClick={order.refresh}>새 발주안 준비</button>
    </div>
  </div>

  return <div className="ot-panel">
    <div className="ot-panel__head">
      <h2>발주 확정</h2>
      <p>{d.getMonth() + 1}월 {d.getDate()}일 ({'일월화수목금토'[d.getDay()]}) 납품 · {order.source === 'PLAN' ? '식단 기준' : '평균 사용량 보충'}</p>
    </div>
    <div className="ot-panel__body">
      {items.length === 0 && <p className="ot-panel__empty">{order.busy ? '발주안을 준비하고 있습니다.' : '담긴 품목이 없습니다.'}</p>}
      <ul className="ot-cart">{items.map(row => <li key={row.ingredient_id}>
        <div><strong>{row.ingredient_name}</strong><small>{row.offer.supplier_name} · {qty(row.order_qty)} {row.offer.order_unit}</small></div>
        <span>{money(row.item_amount)}원</span>
      </li>)}</ul>
    </div>
    <div className="ot-panel__actions">
      {order.exceptions.length > 0 && order.preview && <button type="button" className={`ot-partial${order.allowPartial ? ' is-on' : ''}`} disabled={order.busy || order.attempted}
        aria-pressed={order.allowPartial} onClick={() => order.setAllowPartial(!order.allowPartial)}>
        <span className="ot-partial__box">{order.allowPartial && <TouchIcon name="check" size={16} />}</span>
        확인 필요 {order.exceptions.length}개는 빼고 준비된 {items.length}품목만 먼저 발주
      </button>}
      <div className="t-summary">
        <div><span>품목</span><span>{items.length}개</span></div>
        <div><span>공급사</span><span>{supplierCount}곳</span></div>
        <div className="is-total"><span>상품 금액</span><span>{money(order.preview?.item_amount || 0)}원</span></div>
      </div>
      <button type="button" className="t-btn is-primary is-large is-block" disabled={!order.canSubmit} onClick={() => void order.submit()}>
        {order.attempted ? '이전 발주 결과를 확인해주세요' : order.busy && order.preview ? '확인 중…' : '공급사별 발주 확정'}
      </button>
      <p className="ot-panel__note">상품금액 기준 · 과세 항목의 세액은 별도입니다.</p>
    </div>
  </div>
}
