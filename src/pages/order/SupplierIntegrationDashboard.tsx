import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import LoadingScreen from '../../components/LoadingScreen'
import {
  getSupplierOffers, getSupplierSites, getSupplierSyncStatus,
  syncWelstoryAuto, syncWelstoryCatalog, syncWelstoryReceipts, syncWelstorySites,
  type SupplierOffer, type WelstoryCycleResult, type SupplierSite, type SupplierSyncStatus,
} from '../../api/supplierIntegration'
import OurhomeSitesPanel from './OurhomeSitesPanel'
import './SupplierIntegrationDashboard.css'

const today = () => new Date().toISOString().slice(0, 10)

export default function SupplierIntegrationDashboard() {
  const [params] = useSearchParams()
  const accountId = (params.get('account_id') || localStorage.getItem('account_id') || '').trim()
  return <SupplierWorkspace key={accountId} accountId={accountId} />
}

function SupplierWorkspace({ accountId }: { accountId: string }) {
  const [supplier, setSupplier] = useState('WELSTORY')
  const [tab, setTab] = useState('products')
  const [siteSearch, setSiteSearch] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [sites, setSites] = useState<SupplierSite[]>([])
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [statuses, setStatuses] = useState<SupplierSyncStatus[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [periodYear, setPeriodYear] = useState(() => localStorage.getItem('welstory_period_year') || String(new Date().getFullYear()))
  const [periodGroup, setPeriodGroup] = useState(() => localStorage.getItem('welstory_period_group') || '')
  const [selectedSite, setSelectedSite] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!accountId) { setError('로그인한 고객사 정보가 없습니다.'); return }
    let active = true
    setLoading(true); setError('')
    Promise.all([getSupplierSites(accountId), getSupplierOffers(accountId, deliveryDate, undefined, selectedSite || undefined), getSupplierSyncStatus(accountId)])
      .then(([nextSites, nextOffers, nextStatuses]) => {
        if (active) { setSites(nextSites.filter(site => site.supplier_code === 'WELSTORY')); setOffers(nextOffers.filter(offer => offer.supplier_code === 'WELSTORY')); setStatuses(nextStatuses) }
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accountId, deliveryDate, selectedSite, reloadKey])

  useEffect(() => {
    if (!selectedSite) setSelectedSite(sites.find((site) => site.supplier_code === 'WELSTORY')?.external_site_code || '')
  }, [selectedSite, sites])

  const runSiteSync = async () => {
    if (!accountId) return setSyncMessage('로그인한 고객사 정보가 없습니다.')
    setLoading(true); setSyncMessage(''); setError('')
    try {
      const result = await syncWelstorySites(accountId)
      setSyncMessage(`웰스토리 사업장 목록 ${Number(result.saved_count) || 0}곳을 갱신했습니다. 이 거래처의 사업장 지정은 '공급사 사업장 매핑'에서 합니다.`)
      setReloadKey((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '사업장 동기화에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const runCatalogSync = async () => {
    if (!selectedSite) return setSyncMessage('이 거래처에 지정된 웰스토리 사업장이 없습니다. 공급사 사업장 매핑에서 먼저 지정해 주세요.')
    if (!/^\d{4}$/.test(periodYear) || !/^\d{2}$/.test(periodGroup)) return setSyncMessage('판가 연도 4자리와 순기 2자리를 입력해 주세요.')
    setLoading(true); setSyncMessage(''); setError('')
    try {
      localStorage.setItem('welstory_period_year', periodYear); localStorage.setItem('welstory_period_group', periodGroup)
      const result = await syncWelstoryCatalog(accountId, selectedSite, periodYear, periodGroup)
      setSyncMessage(`전체 판가 수신 ${Number(result.received_count) || 0}건, 저장 ${Number(result.saved_count) || 0}건을 완료했습니다.`)
      setReloadKey((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '전체 판가 동기화에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const runAutoSync = async () => {
    if (!accountId) return setSyncMessage('로그인한 고객사 정보가 없습니다.')
    setLoading(true); setSyncMessage(''); setError('')
    const label = (name: string, cycle?: WelstoryCycleResult) => {
      if (!cycle || cycle.status === 'NOT_OPEN') return `${name}: 아직 웰스토리가 판가를 열지 않음`
      const kind = cycle.status === 'FULL' ? `전체 판가 ${Number(cycle.result?.saved_count) || 0}건` : cycle.status === 'CHANGED' ? `변경 판가 ${Number(cycle.result?.saved_count) || 0}건` : '최신 상태'
      return `${name} ${cycle.cycle}(${cycle.from}~${cycle.to}): ${kind}`
    }
    try {
      const results = await syncWelstoryAuto(accountId)
      setSyncMessage(results.map(site => site.error ? `${site.sold_to} — ${site.error}` : `${site.sold_to} — ${label('현재 순기', site.current)} · ${label('다음 순기', site.next)}`).join('\n') || '처리할 웰스토리 사업장이 없습니다.')
      setReloadKey((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '순기 자동 동기화에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const runReceiptSync = async () => {
    if (!selectedSite) return setSyncMessage('먼저 웰스토리 사업장을 선택해 주세요.')
    setLoading(true); setSyncMessage(''); setError('')
    try {
      const result = await syncWelstoryReceipts(accountId, selectedSite, deliveryDate)
      setSyncMessage(`입고 ${Number(result.received_count) || 0}건 조회, 재고 ${Number(result.posted_count) || 0}건 반영, 주문 미연결 ${Number(result.unmatched_count) || 0}건`)
      setReloadKey((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '입고 동기화에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return keyword ? offers.filter((item) => `${item.product_name} ${item.supplier_item_code} ${item.supplier_name}`.toLowerCase().includes(keyword)) : offers
  }, [offers, search])
  const selected = sites.find(site => site.external_site_code === selectedSite)
  const visibleSites = sites.filter(site => `${site.external_site_name} ${site.external_site_code}`.toLowerCase().includes(siteSearch.trim().toLowerCase()))

  return <div className="supplier-integration-page"><SideMenuLayout header={<HeaderBar title="공급사 통합 연동" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리', to: '/order_manager' }, { label: '공급사 통합 연동' }]} />}>
    <nav className="supplier-switch" aria-label="공급사 선택">
      <button type="button" aria-pressed={supplier === 'WELSTORY'} disabled={loading} onClick={() => setSupplier('WELSTORY')}>웰스토리</button>
      <button type="button" aria-pressed={supplier === 'OURHOME'} disabled={loading} onClick={() => setSupplier('OURHOME')}>아워홈</button>
    </nav>
    <div hidden={supplier !== 'OURHOME'}><OurhomeSitesPanel accountId={accountId} /></div>
    <div hidden={supplier !== 'WELSTORY'}>
    <div className="supplier-workspace">
    <aside className="supplier-site-list" aria-label="웰스토리 사업장">
      <h2>사업장 <small>{sites.length}개</small></h2>
      <label>사업장 검색<input value={siteSearch} onChange={event => setSiteSearch(event.target.value)} placeholder="사업장명·코드" /></label>
      <div className="supplier-site-options">{visibleSites.map(site => <button type="button" key={site.supplier_account_site_id} aria-pressed={selectedSite === site.external_site_code} disabled={loading} onClick={() => { setSelectedSite(site.external_site_code); setSyncMessage('') }}><strong>{site.external_site_name || site.external_site_code}</strong><small>{site.external_site_code}</small></button>)}
      {!visibleSites.length && <p>{sites.length ? '검색 결과가 없습니다.' : '이 거래처에 지정된 웰스토리 사업장이 없습니다.'}</p>}</div>
      <Link to="/order_manager/supplier-sites">공급사 사업장 매핑</Link> <Link to="/order_manager/welstory">웰스토리 원문 조회(주문·입고·반품 현황)</Link>
      <button type="button" onClick={() => void runSiteSync()} disabled={loading}>웰스토리 사업장 목록 갱신</button>
    </aside>
    <main className="supplier-workspace-detail">
    <header className="supplier-detail-heading"><h2>{selected?.external_site_name || selectedSite || '사업장을 선택하세요'}</h2><p>웰스토리 · 사업장 코드 {selectedSite || '-'} · 물류센터 {selected?.center_code || '-'} · 대표코드 {selected?.representative_site_code || '-'}</p><small>최근 사업장 동기화: {selected?.last_synced_at || '미동기화'}</small></header>
    <nav className="supplier-switch supplier-task-switch" aria-label="웰스토리 업무 선택">{[['products', '상품·가격'], ['receipts', '입고·재고'], ['integration', '연동 관리']].map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} disabled={loading} onClick={() => { setTab(value); setSyncMessage('') }}>{label}</button>)}</nav>
    <section className="supplier-integration-summary" hidden={tab !== 'products' || !selectedSite}>
      <article><span>연결 사업장</span><strong>{sites.length}</strong></article>
      <article><span>조회 상품</span><strong>{offers.length}</strong></article>
      <article><span>주문 불가</span><strong>{offers.filter((item) => item.orderable_yn === 'N' || item.product_status !== 'ACTIVE').length}</strong></article>
    </section>
    <section className="supplier-integration-toolbar">
      {tab !== 'integration' && <label>{tab === 'receipts' ? '입고일' : '납품일'}<input type="date" disabled={loading} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>}
      {tab === 'products' && <label>상품 검색<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품명·코드" /></label>}
      {tab === 'products' && <button type="button" disabled={loading || !selectedSite || !deliveryDate} onClick={() => setReloadKey(value => value + 1)}>새로고침</button>}
      {tab === 'integration' && <>
      <button type="button" onClick={() => void runAutoSync()} disabled={loading || !sites.length}>순기 자동 동기화</button>
      <p>순기 번호를 몰라도 됩니다. 오늘이 속한 순기와 다음 순기를 웰스토리에서 확인해, 처음 받는 순기는 전체 판가를, 이미 받은 순기는 오늘 변경된 판가만 받습니다. 서버 설정 시 매일 새벽 3시 20분에도 자동 실행됩니다. 처음 받는 순기는 몇 분 걸릴 수 있습니다.</p>
      <label>판가 연도<input inputMode="numeric" maxLength={4} value={periodYear} onChange={(event) => setPeriodYear(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
      <label>순기<input inputMode="numeric" maxLength={2} placeholder="예: 12" value={periodGroup} onChange={(event) => setPeriodGroup(event.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
      <button type="button" onClick={() => void runCatalogSync()} disabled={loading || !selectedSite}>전체 판가 동기화</button>
      <p>직접 지정: 웰스토리에서 안내받은 연도·순기 번호로 선택한 사업장의 전체 판가를 받습니다.</p></>}
      {tab === 'receipts' && <><button type="button" onClick={() => void runReceiptSync()} disabled={loading || !selectedSite || !deliveryDate}>선택일 입고를 재고에 반영</button><p>선택한 사업장과 입고일의 입고 정보를 받아 재고에 반영합니다. 처리 건수와 주문 미연결 건수는 실행 후 표시됩니다.</p></>}
    </section>
    {syncMessage ? <div role="status" className="supplier-integration-message">{syncMessage}</div> : null}
    {loading ? <LoadingScreen compact message="공급사 통합 정보를 불러오는 중입니다." /> : null}
    {error ? <div className="supplier-integration-error">{error}</div> : null}
    {!loading && !error ? <div className="supplier-integration-grid" data-task={tab}>
      <section hidden={tab !== 'integration'}><h2>거래처 전체 동기화 상태</h2><p>공급사별 전체 사업장의 처리 결과입니다.</p><div className="supplier-integration-table-wrap"><table><thead><tr><th>공급사</th><th>사업장</th><th>구분</th><th>마지막 성공</th><th>상태</th></tr></thead><tbody>{statuses.map((status) => <tr key={status.supplier_sync_checkpoint_id}><td>{status.supplier_name}</td><td>{status.external_site_name || '-'}</td><td>{status.sync_type}</td><td>{status.last_succeeded_at || '-'}</td><td className={status.consecutive_failures ? 'is-danger' : 'is-success'}>{status.consecutive_failures ? status.last_result_message || '실패' : status.last_result_code || '정상'}</td></tr>)}</tbody></table></div></section>
      <section className="supplier-integration-products" hidden={tab !== 'products' || !selectedSite}><h2>사업장·납품일별 상품/가격 ({filtered.length}건)</h2><p>납품일 {deliveryDate} · {sites.find(site => site.external_site_code === selectedSite)?.external_site_name || selectedSite || '전체 사업장'}</p><div className="supplier-integration-table-wrap"><table><thead><tr><th>공급사</th><th>상품코드</th><th>상품명</th><th>가격</th><th>발주단위</th><th>최소/증가량</th><th>가용성</th><th>동기화</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.supplier_offer_id}><td>{item.supplier_name}</td><td>{item.supplier_item_code}</td><td>{item.product_name}</td><td>{item.purchase_price.toLocaleString('ko-KR')}원</td><td>{item.order_unit} ({item.base_qty}{item.base_unit})</td><td>{item.minimum_order_qty} / {item.order_increment_qty}</td><td className={item.orderable_yn === 'N' || item.product_status !== 'ACTIVE' ? 'is-danger' : 'is-success'}>{item.availability_reason || (item.orderable_yn === 'N' ? '주문 불가' : item.product_status)}</td><td>{item.stale ? '확인 필요' : item.last_synced_at}</td></tr>)}{!filtered.length ? <tr><td colSpan={8}>{offers.length ? '검색어에 해당하는 상품이 없습니다. 검색어를 지우고 다시 확인해주세요.' : '선택한 사업장·납품일에 조회되는 상품/가격이 없습니다. 동기화 저장 건수와 이 조회 건수는 다를 수 있습니다. 납품일이 동기화한 판가의 적용 기간에 포함되는지 확인해주세요.'}</td></tr> : null}</tbody></table></div></section>
    </div> : null}
    </main></div></div>
  </SideMenuLayout></div>
}
