import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import LoadingScreen from '../../components/LoadingScreen'
import { useWelstoryWorkspace } from '../../features/order/useWelstoryWorkspace'
import { useOurhomeSite } from '../../features/order/useOurhomeSite'
import type { SupplierSyncStatus } from '../../api/supplierIntegration'
import { OurhomeSiteBar, OurhomeWork } from './OurhomeSitesPanel'
import SupplierSiteBar from './SupplierSiteBar'
import './SupplierIntegrationDashboard.css'

export default function SupplierIntegrationDashboard() {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params).trim()
  return <SupplierWorkspace key={accountId} accountId={accountId} />
}

const syncTypeLabel = (type: string) => {
  const [, kind, value] = /^(PREPARE|CYCLE|CHANGED)_(.+)$/.exec(type) || []
  if (kind === 'PREPARE') return `납품일 상품 준비 · ${value}`
  const cycle = /^(\d{4})-(\d{2})$/.exec(value || '')
  if (kind && cycle) return `${kind === 'CYCLE' ? '순기 전체 판가' : '순기 변경 판가'} · ${cycle[1]}년 ${Number(cycle[2])}순기`
  return type === 'FULL_CATALOG' ? '전체 판가(직접 지정)' : type
}
type SyncState = 'bad' | 'ok' | 'running' | 'idle'
const syncState = (status: SupplierSyncStatus): SyncState =>
  status.consecutive_failures > 0 || ['FAILED', 'REVIEW_REQUIRED'].includes(status.last_result_code) ? 'bad'
    : ['SUCCESS', 'READY'].includes(status.last_result_code) ? 'ok'
    : ['RUNNING', 'PREPARING'].includes(status.last_result_code) ? 'running' : 'idle'
const SYNC_STATE_LABEL: Record<SyncState, string> = { bad: '확인 필요', ok: '정상', running: '진행 중', idle: '대기' }
const lastActivity = (status: SupplierSyncStatus) => [status.last_succeeded_at, status.last_failed_at].filter(Boolean).sort().at(-1) || ''
const shortTime = (value: string) => value ? value.replace('T', ' ').slice(0, 16) : '-'

/** 거래처 동기화 상태(왼쪽 목록). 처음에는 지금 고른 공급사만, 확인 필요를 먼저 그다음 최근 처리 순. */
function SyncStatusPanel({ statuses, loading, supplierName }: { statuses: SupplierSyncStatus[]; loading: boolean; supplierName: string }) {
  const [filter, setFilter] = useState<string>(supplierName)
  const bad = statuses.filter(s => syncState(s) === 'bad').length
  const latest = statuses.map(s => s.last_succeeded_at).filter(Boolean).sort().at(-1) || ''
  const rows = statuses
    .filter(s => filter === 'all' || (filter === 'bad' ? syncState(s) === 'bad' : s.supplier_name === filter))
    .sort((a, b) => Number(syncState(b) === 'bad') - Number(syncState(a) === 'bad') || lastActivity(b).localeCompare(lastActivity(a)))
  return <section className="supplier-sync-status" aria-label="거래처 동기화 상태">
    <header>
      <h2>동기화 상태</h2>
      <small>최근 성공 {shortTime(latest)}</small>
    </header>
    <nav className="supplier-sync-filter" aria-label="동기화 상태 필터">
      {[[supplierName, supplierName], ['bad', `확인 필요 ${bad}`], ['all', `전체 ${statuses.length}`]].map(([value, label]) =>
        <button type="button" key={value} aria-pressed={filter === value} className={value === 'bad' && bad ? 'is-alert' : undefined} onClick={() => setFilter(value)}>{label}</button>)}
    </nav>
    <ul className="supplier-sync-list">
      {rows.map(s => { const state = syncState(s); return <li key={s.supplier_sync_checkpoint_id} data-state={state}>
        <div className="supplier-sync-list__head"><span className={`supplier-sync-badge is-${state}`}>{SYNC_STATE_LABEL[state]}</span><strong title={syncTypeLabel(s.sync_type)}>{syncTypeLabel(s.sync_type)}</strong><time>{shortTime(lastActivity(s))}</time></div>
        <div className="supplier-sync-list__meta">{s.supplier_name} · {s.external_site_name || '-'}{s.consecutive_failures > 1 && <b> · 연속 {s.consecutive_failures}회 실패</b>}</div>
        {s.last_result_message && <p>{s.last_result_message}</p>}
      </li> })}
      {!rows.length && <li className="supplier-sync-list__empty">{loading ? '불러오는 중입니다.' : statuses.length ? '조건에 맞는 내역이 없습니다.' : '아직 동기화 내역이 없습니다.'}</li>}
    </ul>
  </section>
}

const SUPPLIER_NAMES: Record<string, string> = { WELSTORY: '웰스토리', OURHOME: '아워홈' }

/** 공급사 통합 연동(PC). 상단: 거래처·공급사 선택 → 사업장 정보 줄 → 왼쪽 동기화 상태 / 오른쪽 업무(상품·판가 / 주문·입고 / 연동 관리).
 *  웰스토리·아워홈이 같은 틀(SupplierSiteBar, 업무 탭)을 쓴다. 웰스토리 로직은 useWelstoryWorkspace, 아워홈 사업장은 useOurhomeSite(터치와 공용). */
function SupplierWorkspace({ accountId }: { accountId: string }) {
  const [supplier, setSupplier] = useState('WELSTORY')
  const [tab, setTab] = useState('products')
  const {
    deliveryDate, setDeliveryDate, sites, offers, statuses, search, setSearch, loading, error,
    periodYear, setPeriodYear, periodGroup, setPeriodGroup, selectedSite, setSelectedSite, syncMessage, setSyncMessage, reload,
    runSiteSync, runCatalogSync, runAutoSync, runReceiptSync, filtered, selected, unavailableCount,
  } = useWelstoryWorkspace(accountId)
  const ourhome = useOurhomeSite(accountId)

  return <div className="supplier-integration-page"><SideMenuLayout header={<HeaderBar title="공급사 통합 연동" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주관리', to: '/order_manager' }, { label: '공급사 통합 연동' }]} />}>
    <div className="rd rd-page rd-sup">
    <header className="rd-page__head">
      <div>
        <h1 className="rd-sr-only">공급사 통합 연동</h1>
        <p className="rd-muted">공급사 사업장·상품·판가·입고를 받아 오고, 동기화 결과를 확인합니다.</p>
      </div>
      <DeadlineAlertSlot />
      <div className="rd-page__actions">
        <nav className="rd-seg" aria-label="공급사 선택">
          {Object.entries(SUPPLIER_NAMES).map(([code, name]) => <button type="button" key={code} className={supplier === code ? 'is-active' : ''} aria-pressed={supplier === code} onClick={() => setSupplier(code)}>{name}</button>)}
        </nav>
      </div>
    </header>

    <div hidden={supplier !== 'WELSTORY'}><SupplierSiteBar
      supplierName="웰스토리"
      sites={sites.map(site => ({ code: site.external_site_code, name: site.external_site_name }))}
      selected={selectedSite}
      onSelect={code => { setSelectedSite(code); setSyncMessage('') }}
      disabled={loading}
      emptyText="이 거래처에 지정된 사업장이 없습니다."
      facts={selected ? [['코드', selected.external_site_code], ['물류센터', selected.center_code || '-'], ['대표코드', selected.representative_site_code || '-']] : []}
      updated={`동기화 ${selected?.last_synced_at ? shortTime(selected.last_synced_at) : '전'}`}
      actions={<>
        <Link to="/order_manager/supplier-sites">공급사 사업장 매핑</Link>
        <button type="button" onClick={() => void runSiteSync()} disabled={loading}>사업장 목록 갱신</button>
      </>}
    /></div>
    <div hidden={supplier !== 'OURHOME'}><OurhomeSiteBar site={ourhome} /></div>

    <div className="supplier-split">
      {accountId ? <SyncStatusPanel key={supplier} statuses={statuses} loading={loading} supplierName={SUPPLIER_NAMES[supplier]} /> : <section className="supplier-sync-status"><p>거래처를 선택하세요.</p></section>}
      <section className="supplier-work-panel" aria-label={`${SUPPLIER_NAMES[supplier]} 업무`}>
        <div hidden={supplier !== 'OURHOME'}><OurhomeWork site={ourhome} /></div>
        <div hidden={supplier !== 'WELSTORY'}>
          <nav className="supplier-switch supplier-task-switch" aria-label="웰스토리 업무 선택">{[['products', '상품·판가'], ['receipts', '주문·입고'], ['integration', '연동 관리']].map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} disabled={loading} onClick={() => { setTab(value); setSyncMessage('') }}>{label}</button>)}</nav>
          <div className="supplier-integration-toolbar">
            {tab !== 'integration' && <label>{tab === 'receipts' ? '입고일' : '납품일'}<input type="date" disabled={loading} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>}
            {tab === 'products' && <label>상품 검색<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품명·코드" /></label>}
            {tab === 'products' && <button type="button" disabled={loading || !selectedSite || !deliveryDate} onClick={reload}>새로고침</button>}
            {tab === 'integration' && <>
              <button type="button" onClick={() => void runAutoSync()} disabled={loading || !sites.length}>순기 자동 동기화</button>
              <p>현재·다음 순기 판가를 받습니다(처음 받는 순기는 전체, 받은 순기는 변경분만). 매일 새벽 3:20 자동 실행 · 처음 받는 순기는 몇 분 걸릴 수 있습니다. 결과는 왼쪽 '동기화 상태'에 쌓입니다.</p>
              <details className="supplier-manual-sync"><summary>순기 직접 지정</summary><div>
                <label>판가 연도<input inputMode="numeric" maxLength={4} value={periodYear} onChange={(event) => setPeriodYear(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
                <label>순기<input inputMode="numeric" maxLength={2} placeholder="예: 12" value={periodGroup} onChange={(event) => setPeriodGroup(event.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
                <button type="button" onClick={() => void runCatalogSync()} disabled={loading || !selectedSite}>전체 판가 동기화</button>
                <p>웰스토리에서 안내받은 연도·순기 번호로 선택한 사업장의 전체 판가를 받습니다.</p></div></details></>}
            {tab === 'receipts' && <><button type="button" onClick={() => void runReceiptSync()} disabled={loading || !selectedSite || !deliveryDate}>선택일 입고를 재고에 반영</button><p>선택한 사업장과 입고일의 입고 정보를 받아 재고에 반영합니다. 주문·반품 현황은 <Link to="/order_manager/welstory">웰스토리 원문 조회</Link>에서 봅니다.</p></>}
          </div>
          {syncMessage ? <div role="status" className="supplier-integration-message">{syncMessage}</div> : null}
          {loading ? <LoadingScreen compact message="공급사 통합 정보를 불러오는 중입니다." /> : null}
          {error ? <div className="supplier-integration-error">{error}</div> : null}
          {!loading && !error && tab === 'products' && selectedSite ? <div className="supplier-work-result">
            <h3>상품·판가 {filtered.length}건 {unavailableCount > 0 && <small className="is-danger">· 주문 불가 {unavailableCount}건</small>}<span>납품일 {deliveryDate} · {selected?.external_site_name || selectedSite}</span></h3>
            <div className="supplier-work-table"><table><thead><tr><th>상품코드</th><th>상품명</th><th>가격</th><th>발주단위</th><th>최소/증가량</th><th>가용성</th><th>동기화</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.supplier_offer_id}><td>{item.supplier_item_code}</td><td>{item.product_name}</td><td>{item.purchase_price.toLocaleString('ko-KR')}원</td><td>{item.order_unit} ({item.base_qty}{item.base_unit})</td><td>{item.minimum_order_qty} / {item.order_increment_qty}</td><td className={item.orderable_yn === 'N' || item.product_status !== 'ACTIVE' ? 'is-danger' : 'is-success'}>{item.availability_reason || (item.orderable_yn === 'N' ? '주문 불가' : item.product_status === 'ACTIVE' ? '주문 가능' : item.product_status)}</td><td>{item.stale ? '확인 필요' : shortTime(item.last_synced_at)}</td></tr>)}{!filtered.length ? <tr><td colSpan={7} className="supplier-work-empty">{offers.length ? '검색어에 해당하는 상품이 없습니다. 검색어를 지우고 다시 확인해주세요.' : '선택한 사업장·납품일에 조회되는 상품/가격이 없습니다. 납품일이 동기화한 판가의 적용 기간에 포함되는지 확인해주세요.'}</td></tr> : null}</tbody></table></div>
          </div> : null}
        </div>
      </section>
    </div>
    </div>
  </SideMenuLayout></div>
}
