import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { useWelstoryWorkspace } from '../../features/order/useWelstoryWorkspace'
import OurhomeSitesPanel from '../../pages/order/OurhomeSitesPanel'
import '../../pages/order/SupplierIntegrationDashboard.css'
import './SupplierTouch.css'

type Task = 'products' | 'receipts' | 'integration'
const TASKS: { key: Task; label: string; icon: TouchIconName }[] = [
  { key: 'products', label: '상품·가격', icon: 'order' },
  { key: 'receipts', label: '입고 반영', icon: 'truck' },
  { key: 'integration', label: '판가 동기화', icon: 'refresh' },
]
const won = (value: number) => `${Number(value || 0).toLocaleString('ko-KR')}원`

/**
 * 공급사 통합 연동(태블릿·휴대폰). 웰스토리: 사업장 칸 → 업무(상품·가격 / 입고 반영 / 판가 동기화), 오른쪽에 사업장 정보와 실행 버튼.
 * 웰스토리 로직은 PC와 같은 useWelstoryWorkspace. 아워홈은 PC 패널(OurhomeSitesPanel)을 터치 겉모양(t-pc-embed)으로 넣는다.
 */
export default function SupplierTouch() {
  const [params] = useSearchParams()
  const [accountId, setAccountId] = useState(() => (params.get('account_id') || localStorage.getItem('account_id') || '').trim())
  const [supplier, setSupplier] = useState<'WELSTORY' | 'OURHOME'>('WELSTORY')
  const toolbar = <div className="t-segment" role="tablist" aria-label="공급사">
    <button type="button" className={supplier === 'WELSTORY' ? 'is-active' : ''} onClick={() => setSupplier('WELSTORY')}>웰스토리</button>
    <button type="button" className={supplier === 'OURHOME' ? 'is-active' : ''} onClick={() => setSupplier('OURHOME')}>아워홈</button>
  </div>
  return supplier === 'WELSTORY'
    ? <Welstory key={accountId} accountId={accountId} toolbar={toolbar} onAccountChange={setAccountId} />
    : <TouchLayout title="공급사 연동" subtitle="아워홈" toolbar={toolbar} onAccountChange={setAccountId}>
      <div className="t-card t-pc-embed su-ourhome"><OurhomeSitesPanel key={accountId} accountId={accountId} /></div>
    </TouchLayout>
}

function Welstory({ accountId, toolbar, onAccountChange }: { accountId: string; toolbar: ReactNode; onAccountChange: (value: string) => void }) {
  const w = useWelstoryWorkspace(accountId)
  const [task, setTask] = useState<Task>('products')
  const [limit, setLimit] = useState(60)

  const aside = <div className="su-panel">
    <div className="su-panel__head">
      <h2>{w.selected?.external_site_name || w.selectedSite || '사업장 없음'}</h2>
      <p>웰스토리 · 코드 {w.selectedSite || '-'}</p>
    </div>
    <div className="su-panel__body">
      <div className="t-summary">
        <div><span>물류센터</span><span>{w.selected?.center_code || '-'}</span></div>
        <div><span>대표코드</span><span>{w.selected?.representative_site_code || '-'}</span></div>
        <div><span>사업장 동기화</span><span>{w.selected?.last_synced_at?.slice(0, 16) || '미동기화'}</span></div>
        <div className="is-total"><span>조회 상품</span><span>{w.offers.length}개</span></div>
      </div>
      {w.unavailableCount > 0 && <p className="t-msg is-warn">주문할 수 없는 상품 {w.unavailableCount}개</p>}
      <div className="su-links">
        <Link className="t-btn is-soft is-block" to="/order_manager/supplier-sites">사업장 매핑</Link>
        <Link className="t-btn is-soft is-block" to="/order_manager/welstory">웰스토리 원문 조회</Link>
      </div>
    </div>
    <div className="su-panel__actions">
      <button type="button" className="t-btn is-large is-block" disabled={w.loading} onClick={() => void w.runSiteSync()}><TouchIcon name="refresh" />웰스토리 사업장 목록 갱신</button>
    </div>
  </div>

  return <TouchLayout title="공급사 연동" subtitle="웰스토리" toolbar={toolbar} aside={aside} onAccountChange={onAccountChange}>
    <div className="t-tabs" role="tablist" aria-label="웰스토리 사업장">
      {w.visibleSites.map(site => <button key={site.supplier_account_site_id} type="button" role="tab" aria-selected={w.selectedSite === site.external_site_code}
        className={`t-tab su-site${w.selectedSite === site.external_site_code ? ' is-active' : ''}`} disabled={w.loading} onClick={() => { w.setSelectedSite(site.external_site_code); w.setSyncMessage('') }}>
        <TouchIcon name="store" /><strong>{site.external_site_name || site.external_site_code}</strong><small>{site.external_site_code}</small>
      </button>)}
      {!w.sites.length && !w.loading && <p className="t-msg su-nosite">이 거래처에 지정된 웰스토리 사업장이 없습니다. <Link to="/order_manager/supplier-sites">사업장 매핑</Link>에서 먼저 지정하세요.</p>}
    </div>

    <div className="t-segment su-tasks" role="tablist" aria-label="업무">
      {TASKS.map(t => <button key={t.key} type="button" className={task === t.key ? 'is-active' : ''} disabled={w.loading} onClick={() => { setTask(t.key); w.setSyncMessage('') }}>{t.label}</button>)}
    </div>

    {w.syncMessage && <p className="t-msg su-ok" role="status">{w.syncMessage}</p>}
    {w.error && <p className="t-msg is-error" role="alert">{w.error}</p>}
    {w.loading && <p className="t-msg" role="status">공급사 정보를 불러오는 중…</p>}

    {task === 'products' && <>
      <div className="su-filters">
        <label className="su-field">납품일<input type="date" value={w.deliveryDate} disabled={w.loading} onChange={e => w.setDeliveryDate(e.target.value)} /></label>
        <label className="t-chip su-search"><TouchIcon name="search" /><input type="search" value={w.search} placeholder="상품명 · 코드" onChange={e => w.setSearch(e.target.value)} /></label>
        <button type="button" className="t-btn is-icon" aria-label="새로고침" disabled={w.loading || !w.selectedSite} onClick={w.reload}><TouchIcon name="refresh" /></button>
      </div>
      {!w.loading && w.selectedSite && w.filtered.length === 0 && <p className="t-msg">{w.offers.length ? '검색어에 맞는 상품이 없습니다.' : '이 사업장·납품일에 조회되는 상품/가격이 없습니다. 납품일이 동기화한 판가 기간에 들어가는지 확인해주세요.'}</p>}
      <div className="su-grid">
        {w.filtered.slice(0, limit).map(item => {
          const blocked = item.orderable_yn === 'N' || item.product_status !== 'ACTIVE'
          return <article key={item.supplier_offer_id} className="t-card su-offer">
            <span className={`t-badge ${blocked ? 'is-danger' : 'is-ok'}`}>{item.availability_reason || (item.orderable_yn === 'N' ? '주문 불가' : item.product_status === 'ACTIVE' ? '주문 가능' : item.product_status)}</span>
            <strong>{item.product_name}</strong>
            <small>{item.supplier_item_code} · {item.order_unit} ({item.base_qty}{item.base_unit})</small>
            <span className="su-offer__price">{won(item.purchase_price)}</span>
            <small>최소 {item.minimum_order_qty} / 증가 {item.order_increment_qty}{item.stale ? ' · 확인 필요' : ''}</small>
          </article>
        })}
      </div>
      {w.filtered.length > limit && <button type="button" className="t-btn is-soft is-block su-more" onClick={() => setLimit(v => v + 60)}>더 보기 ({w.filtered.length - limit}개 남음)</button>}
    </>}

    {task === 'receipts' && <section className="t-card su-action">
      <h2>웰스토리 입고를 재고에 반영</h2>
      <p>고른 사업장과 입고일의 입고 정보를 받아 재고에 넣습니다. 처리 건수와 주문에 연결되지 않은 건수가 위에 나옵니다.</p>
      <label className="su-field">입고일<input type="date" value={w.deliveryDate} disabled={w.loading} onChange={e => w.setDeliveryDate(e.target.value)} /></label>
      <button type="button" className="t-btn is-primary is-large" disabled={w.loading || !w.selectedSite || !w.deliveryDate} onClick={() => void w.runReceiptSync()}>선택일 입고 반영</button>
    </section>}

    {task === 'integration' && <>
      <section className="t-card su-action">
        <h2>순기 자동 동기화</h2>
        <p>순기 번호를 몰라도 됩니다. 오늘이 든 순기와 다음 순기를 확인해, 처음 받는 순기는 전체 판가를, 이미 받은 순기는 오늘 바뀐 판가만 받습니다. 처음 받는 순기는 몇 분 걸릴 수 있습니다.</p>
        <button type="button" className="t-btn is-primary is-large" disabled={w.loading || !w.sites.length} onClick={() => void w.runAutoSync()}>순기 자동 동기화</button>
      </section>
      <section className="t-card su-action">
        <h2>순기 직접 지정</h2>
        <p>웰스토리에서 안내받은 연도·순기 번호로 고른 사업장의 전체 판가를 받습니다.</p>
        <div className="su-filters">
          <label className="su-field">판가 연도<input inputMode="numeric" maxLength={4} value={w.periodYear} onChange={e => w.setPeriodYear(e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
          <label className="su-field">순기<input inputMode="numeric" maxLength={2} placeholder="예: 12" value={w.periodGroup} onChange={e => w.setPeriodGroup(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
        </div>
        <button type="button" className="t-btn is-soft is-large" disabled={w.loading || !w.selectedSite} onClick={() => void w.runCatalogSync()}>전체 판가 동기화</button>
      </section>
      <h2 className="t-section-title">거래처 전체 동기화 상태</h2>
      <ul className="su-status">{w.statuses.map(status => <li key={status.supplier_sync_checkpoint_id} className="t-card">
        <div><strong>{status.supplier_name} · {status.sync_type}</strong><small>{status.external_site_name || '-'} · 마지막 성공 {status.last_succeeded_at || '-'}</small></div>
        <span className={`t-badge ${status.consecutive_failures ? 'is-danger' : 'is-ok'}`}>{status.consecutive_failures ? status.last_result_message || '실패' : status.last_result_code || '정상'}</span>
      </li>)}</ul>
    </>}
  </TouchLayout>
}
