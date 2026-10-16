import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import LoadingScreen from '../../components/LoadingScreen'
import { SITE_SUPPLIERS as SUPPLIERS, rankSites as rank, siteLabel, useSiteMapping } from '../../features/order/useSiteMapping'
import './SupplierIntegrationDashboard.css'
import './SupplierSiteMapping.css'

/** 공급사 사업장 매핑(PC). 로직은 features/order/useSiteMapping(터치 화면과 공용). */
export default function SupplierSiteMapping() {
  const {
    accounts, sites, mappings, loading, syncing, saving, error, message, search, setSearch, filter, setFilter,
    mappingOf, selectable, names, rows, unassigned, excluded, save, sync, toggleUse, busy,
  } = useSiteMapping()

  return <div className="supplier-integration-page"><SideMenuLayout header={<HeaderBar title="공급사 사업장 매핑" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주관리', to: '/order_manager' }, { label: '공급사 사업장 매핑' }]} />}>
    {syncing ? <LoadingScreen overlay message={`${SUPPLIERS.find(item => item.code === syncing)?.label} 사업장 목록을 받아오고 있습니다.`} /> : null}
    <div className="rd rd-page rd-sup rd-map">
    <header className="rd-page__head">
      <div>
        <h1 className="rd-h1">공급사 사업장 매핑</h1>
        <p className="rd-muted">거래처마다 공급사별 사업장을 한 번 지정하면 상품 연결·판가 동기화·발주가 이 사업장 코드로 처리됩니다. 비슷한 이름 후보는 위에 보이지만 자동 저장하지 않습니다.</p>
      </div>
      <div className="rd-page__actions">
        {SUPPLIERS.map(({ code, label }) => <button type="button" className="rd-btn" key={code} disabled={busy} onClick={() => void sync(code)}>{label} 사업장 목록 갱신</button>)}
      </div>
    </header>
    <div className="rd-page__tiles">
      <button type="button" className={`rd-card rd-page__tile${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}><span>거래처</span><strong>{accounts.length}</strong><small>전체 보기</small></button>
      {SUPPLIERS.map(({ code, label }) => <div key={code} className="rd-card rd-page__tile is-ok"><span>{label} 지정</span><strong>{new Set(mappings.filter(m => m.supplier_code === code).map(m => m.account_id)).size}</strong><small>거래처 수</small></div>)}
      <div className={`rd-card rd-page__tile${unassigned.length ? ' is-warn' : ' is-ok'}`}><span>거래처 없는 사업장</span><strong>{unassigned.length}</strong><small>아래 목록에서 지정·매핑 제외</small></div>
    </div>
    <section className="rd-card rd-page__filters">
      <input className="rd-input" type="search" aria-label="거래처 검색" value={search} onChange={event => setSearch(event.target.value)} placeholder="거래처명" />
      <div className="rd-pills" role="group" aria-label="표시">
        {([['all', '전체'], ['missing', '미지정 공급사 있음'], ['done', '모두 지정됨']] as const).map(([value, label]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
    </section>
    {message ? <div role="status" className="supplier-integration-message">{message}</div> : null}
    {error ? <div role="alert" className="supplier-integration-error">{error}</div> : null}
    {loading ? <LoadingScreen compact message="거래처와 공급사 사업장을 불러오는 중입니다." /> : <>
      {!sites.length ? <div className="supplier-integration-message">공급사 사업장 목록이 없습니다. 위의 '웰스토리 사업장 목록 갱신', '아워홈 사업장 목록 갱신'을 먼저 실행하세요.</div> : null}
      <div className="supplier-integration-grid"><section className="rd-card rd-page__box">
        <h2 className="rd-h2">거래처별 공급사 사업장 ({rows.length})</h2>
        <div className="supplier-integration-table-wrap"><table className="site-mapping-table"><thead><tr><th>거래처</th>{SUPPLIERS.map(({ code, label }) => <th key={code}>{label} 사업장</th>)}</tr></thead><tbody>
          {rows.map(account => <tr key={account.value}><td><strong>{account.text}</strong><small>{account.value}</small></td>
            {SUPPLIERS.map(({ code }) => {
              const current = mappingOf(account.value, code)
              const { ordered, suggestion } = rank(account, selectable(code))
              const key = `${account.value}:${code}`
              const inactiveCurrent = current && !ordered.some(item => item.site.external_site_code === current.external_site_code)
              return <td key={code} className={current ? '' : 'site-mapping-missing'}>
                <select aria-label={`${account.text} ${code} 사업장`} value={current?.external_site_code || ''} disabled={busy} onChange={event => void save(account, code, event.target.value)}>
                  <option value="">{current ? '지정 해제' : '선택 안 함'}</option>
                  {inactiveCurrent ? <option value={current.external_site_code}>{current.external_site_name} · {current.external_site_code} (목록 제외됨)</option> : null}
                  {ordered.map(({ site }) => {
                    const others = site.assigned_account_ids.filter(id => id !== account.value)
                    return <option key={site.supplier_site_id} value={site.external_site_code}>{suggestion.best?.site === site ? '★ ' : ''}{siteLabel(site)}{others.length ? ` (사용 중: ${names(others)})` : ''}</option>
                  })}
                </select>
                {saving === key ? <small>저장 중…</small>
                  : current ? <small>지정됨 · {current.mod_at ? current.mod_at.slice(0, 16).replace('T', ' ') : ''}{current.user_id ? ` · ${current.user_id}` : ''}</small>
                  : suggestion.best ? <small className="site-mapping-hint">{suggestion.close > 1 ? `비슷한 후보 ${suggestion.close}개, 코드·센터 확인 필요` : `추천: ${siteLabel(suggestion.best.site)}`}{suggestion.close === 1 ? <button type="button" disabled={busy} onClick={() => void save(account, code, suggestion.best!.site.external_site_code)}>추천 적용</button> : null}</small>
                  : <small>이름이 비슷한 후보 없음</small>}
              </td>
            })}
          </tr>)}
          {!rows.length ? <tr><td colSpan={3}>조건에 맞는 거래처가 없습니다.</td></tr> : null}
        </tbody></table></div>
      </section>
      <section className="rd-card rd-page__box">
        <h2 className="rd-h2">어느 거래처에도 지정되지 않은 공급사 사업장 ({unassigned.length})</h2>
        <p>본사·마감용처럼 발주에 쓰지 않는 사업장은 '매핑 제외'로 표시하면 선택지와 이 목록에서 빠집니다.</p>
        <div className="supplier-integration-table-wrap"><table><thead><tr><th>공급사</th><th>사업장</th><th>코드</th><th>물류센터·영업소</th><th>상태</th><th /></tr></thead><tbody>
          {[...unassigned, ...excluded].map(site => <tr key={site.supplier_site_id} className={site.use_yn === 'N' ? 'site-mapping-excluded' : ''}>
            <td>{site.supplier_name}</td><td>{site.external_site_name}</td><td>{site.external_site_code}</td><td>{site.center_name || site.center_code || '-'}</td>
            <td>{site.use_yn === 'N' ? '매핑 제외' : site.provider_listed_yn === 'N' ? '공급사 목록에서 빠짐' : '미지정'}</td>
            <td><button type="button" disabled={busy} onClick={() => void toggleUse(site)}>{site.use_yn === 'Y' ? '매핑 제외' : '복원'}</button></td>
          </tr>)}
          {!unassigned.length && !excluded.length ? <tr><td colSpan={6}>모든 공급사 사업장이 거래처에 지정되어 있습니다.</td></tr> : null}
        </tbody></table></div>
      </section></div>
    </>}
    </div>
  </SideMenuLayout></div>
}
