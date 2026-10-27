import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import CatalogPreparation from '../../components/CatalogPreparation'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import BatchOrderResults from '../../components/BatchOrderResults'
import ProductImage from '../../components/ProductImage'
import { money, orderDay as day, useQuickOrder } from '../../features/order/useQuickOrder'
import { blockedReasons } from '../../api/shortageProcurement'
import '../../components/DailyWork.css'

const dayLabel = (value: string) => { const d = new Date(`${value}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})` }

/**
 * 추천 발주안(PC, 2026-10-15 개편 — 시안 ④). 로직은 features/order/useQuickOrder(터치 발주하기와 공용).
 * 한 줄 요약(납품일·품목·금액) → 품목 목록 + 오른쪽(확인 필요 식재료 · 공급사별 발주서 · 한 번에 발주).
 * embedded: 발주하기(OrderWorkspace) 안에서 레이아웃 없이 내용만 그린다.
 */
export default function QuickOrder({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  const {
    date, changeDate, source, changeSource, result, preview, error, busy, attempted, batch, allowPartial, setAllowPartial,
    exceptions, submit, recover, refresh, reloadPreview,
  } = useQuickOrder(accountId)
  const groups = (preview?.items || []).reduce<Record<string, { code: string; name: string; site: string; count: number; amount: number }>>((acc, row) => {
    const key = row.offer.supplier_code + ':' + row.offer.external_site_code
    const group = acc[key] ||= { code: row.offer.supplier_code, name: row.offer.supplier_name, site: row.offer.external_site_name || row.offer.external_site_code, count: 0, amount: 0 }
    group.count += 1; group.amount += Number(row.item_amount) || 0
    return acc
  }, {})
  const sheetCount = Object.keys(groups).length

  const body = <div className="rd rd-order rd-quick">
    {!accountId && <p className="rd-alert" role="alert">홈에서 거래처를 선택해주세요.</p>}
    <section className="rd-card rd-quick__hero">
      <div className="rd-quick__hero-text">
        <span className="rd-muted rd-fs-sm">늘 쓰던 상품으로 미리 골라 뒀어요</span>
        <h1 className="rd-h1">{dayLabel(date)} 발주안{preview ? ` · ${preview.items.length}품목 · ${money(preview.item_amount)}원` : busy ? ' · 준비 중' : ''}</h1>
        <span className="rd-muted">{source === 'PLAN' ? '그날 식단에서 재고·입고예정을 빼고 계산' : '평균 사용량·안전재고 보충 기준'} · 바꿀 것만 직접 고치면 돼요</span>
      </div>
      <label className="rd-quick__field">납품일<input className="rd-input" type="date" min={day()} value={date} disabled={busy || attempted} onChange={e => changeDate(e.target.value)} /></label>
      <label className="rd-quick__field">계산 기준<select className="rd-input" value={source} disabled={busy || attempted} onChange={e => changeSource(e.target.value as 'PLAN' | 'INVENTORY')}><option value="PLAN">그날 식단</option><option value="INVENTORY">평균 사용량·안전재고 보충</option></select></label>
      <button type="button" className="rd-btn" disabled={busy} onClick={refresh}>다시 준비</button>
    </section>
    <div className="rd-fs-sm rd-muted"><CatalogPreparation key={accountId + date} accountId={accountId} date={date} onReady={reloadPreview} /></div>
    {error && <p className="rd-alert" role="alert">{error}</p>}

    <div className="rd-order__grid">
      <section className="rd-card rd-order__list" aria-label="발주안 품목">
        <div className="rd-quick__row is-head rd-fs-xs"><span>식재료 → 상품</span><span>공급사</span><span className="is-num">주문량</span><span className="is-num">금액</span></div>
        {preview?.items.map(row => <div key={row.ingredient_id} className="rd-quick__row">
          <div className="rd-quick__item">
            <ProductImage zoomable src={row.offer.thumbnail_url || row.offer.image_url || undefined} fullSrc={row.offer.image_url || undefined} name={row.offer.product_name} />
            <div><strong className="rd-fs-md">{row.ingredient_name}</strong><small className="rd-muted rd-fs-sm">{row.offer.product_name}</small></div>
          </div>
          <div><span className={`rd-supplier is-${row.offer.supplier_code}`}>{row.offer.supplier_name}</span><small className="rd-muted rd-fs-xs">{row.offer.external_site_name || row.offer.external_site_code}</small></div>
          <div className="is-num"><b>{row.order_qty} {row.offer.order_unit}</b></div>
          <div className="is-num"><b>{money(row.item_amount)}원</b></div>
        </div>)}
        {busy && !preview ? <p className="rd-order__empty">발주안을 준비하고 있어요.</p> : null}
        {!busy && result && !result.ingredients.length ? <p className="rd-order__empty">이 날짜에 발주할 모자란 재료가 없어요. 식단이 등록되어 있는지도 확인해 주세요.</p> : null}
        {preview ? <details className="rd-quick__basis rd-fs-sm"><summary>계산 근거 보기</summary>{preview.items.map(row => <p key={row.ingredient_id}>{row.ingredient_name}: 필요 {row.required_qty} + 안전 {row.safe_stock_qty} − 현재 {row.current_qty} − 확정 입고 {row.incoming_qty} {row.base_unit} → 부족 {row.shortage_qty} {row.base_unit} → {row.order_qty} {row.offer.order_unit}</p>)}</details> : null}
        <div className="rd-order__foot rd-fs-sm rd-quick__links">
          <Link to={`/order_manager/order?${new URLSearchParams({ tab: source === 'PLAN' ? 'plan' : 'usage', account_id: accountId, source })}`}>수량·상품 직접 고치기</Link>
          <Link to={`/order_manager/order?${new URLSearchParams({ tab: 'products', account_id: accountId })}`}>새 상품 추가</Link>
          <Link to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId })}`}>발주서·입고</Link>
        </div>
      </section>

      <aside className="rd-order__side" aria-label="발주 확정">
        {exceptions.length > 0 && <div className="rd-order__blocked rd-fs-sm">
          <strong className="rd-fs-md">확인이 필요한 식재료 {exceptions.length}개</strong>
          {exceptions.slice(0, 5).map(row => <span key={row.ingredient_id}>{row.ingredient_name} · {row.issues.join(' · ') || blockedReasons(row.offers.map(o => o.orderability_reason || o.availability_reason), ' · ') || '늘 쓰는 상품이 없거나 주문할 수 없음 · 상품·단위 확인 요망'}</span>)}
          {exceptions.length > 5 ? <span>외 {exceptions.length - 5}개</span> : null}
          {preview ? <label className="rd-quick__partial"><input type="checkbox" checked={allowPartial} disabled={busy || attempted} onChange={e => setAllowPartial(e.target.checked)} /> 이 {exceptions.length}개는 빼고 나머지만 발주</label> : null}
        </div>}
        <div className="rd-card rd-order__summary">
          <h2 className="rd-h2">{sheetCount ? `발주서 ${sheetCount}장` : '발주서'}</h2>
          {Object.entries(groups).map(([key, group]) => <div key={key} className="rd-quick__sheet">
            <span><span className={`rd-supplier is-${group.code}`}>{group.name}</span> <span className="rd-muted rd-fs-xs">{group.site}</span> · {group.count}품목</span><b>{money(group.amount)}원</b>
          </div>)}
          {!sheetCount && !busy ? <p className="rd-order__empty">발주할 품목이 없어요.</p> : null}
          <div className="rd-order__total"><span className="rd-muted">상품금액 합계</span><strong>{preview ? `${money(preview.item_amount)}원` : '—'}</strong></div>
          {batch ? <BatchOrderResults result={batch} accountId={accountId} />
            : <button type="button" className="rd-btn is-primary rd-order__confirm" disabled={!preview || busy || attempted || (exceptions.length > 0 && !allowPartial)} onClick={() => void submit()}>
              {attempted ? '이전 발주 결과를 확인해주세요' : preview ? `${preview.items.length}품목 한 번에 발주` : '발주'}</button>}
          <p className="rd-muted rd-fs-xs" style={{ textAlign: 'center', margin: 0 }}>보내기 전에 공급사 가격·발주 가능 여부를 다시 확인해요 · 과세 품목 세액은 별도</p>
          <div className="rd-order__side-actions"><button type="button" className="rd-btn is-ghost" onClick={() => void recover()} disabled={busy}>이전 발주 결과 확인</button></div>
        </div>
      </aside>
    </div>
  </div>
  return embedded ? body : <SideMenuLayout header={<HeaderBar title="준비된 발주안" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주안 확인' }]} />}>{body}</SideMenuLayout>
}
