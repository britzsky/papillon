import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import LoadingScreen from '../../components/LoadingScreen'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import {
  assignSite, getMasterSites, getSiteMappings, nameScore, setMasterSiteUse, SharedSiteError, syncMasterSites,
  type SupplierCode, type SupplierMasterSite, type SupplierSiteMapping,
} from '../../api/supplierSites'
import './SupplierIntegrationDashboard.css'
import './SupplierSiteMapping.css'

const SUPPLIERS: { code: SupplierCode; label: string }[] = [{ code: 'WELSTORY', label: '웰스토리' }, { code: 'OURHOME', label: '아워홈' }]
const RECOMMEND_MIN = 0.55

type Candidate = { site: SupplierMasterSite; score: number }
type Suggestion = { best?: Candidate; close: number }

const siteLabel = (site: SupplierMasterSite) =>
  `${site.external_site_name || site.external_site_code} · ${site.external_site_code}${site.center_name || site.center_code ? ` · ${site.center_name || site.center_code}` : ''}`

/** 이름이 비슷한 순으로 후보를 정렬하고, 1위가 뚜렷할 때만 추천한다. */
function rank(account: AccountOption, sites: SupplierMasterSite[]): { ordered: Candidate[]; suggestion: Suggestion } {
  const ordered = sites.map(site => ({ site, score: nameScore(account.text, site.external_site_name) }))
    .sort((a, b) => b.score - a.score || a.site.external_site_name.localeCompare(b.site.external_site_name, 'ko'))
  const top = ordered[0]
  const close = ordered.filter(item => top && item.score >= RECOMMEND_MIN && top.score - item.score < 0.15).length
  return { ordered, suggestion: { best: top && top.score >= RECOMMEND_MIN ? top : undefined, close } }
}

export default function SupplierSiteMapping() {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [sites, setSites] = useState<SupplierMasterSite[]>([])
  const [mappings, setMappings] = useState<SupplierSiteMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<SupplierCode | ''>('')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'missing' | 'done'>('all')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    Promise.all([getAccountOptions(), getMasterSites(), getSiteMappings()])
      .then(([nextAccounts, nextSites, nextMappings]) => {
        if (!active) return
        setAccounts(nextAccounts.filter(item => item.value).sort((a, b) => a.text.localeCompare(b.text, 'ko')))
        setSites(nextSites); setMappings(nextMappings)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reloadKey])

  const accountName = useMemo(() => new Map(accounts.map(item => [item.value, item.text])), [accounts])
  const mappingOf = (accountId: string, supplier: SupplierCode) =>
    mappings.find(item => item.account_id === accountId && item.supplier_code === supplier)
  const selectable = (supplier: SupplierCode) => sites.filter(site => site.supplier_code === supplier && site.use_yn === 'Y')
  const names = (ids: string[]) => ids.map(id => accountName.get(id) || id).join(', ')

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return accounts.filter(account => {
      if (keyword && !account.text.toLowerCase().includes(keyword)) return false
      const done = SUPPLIERS.every(({ code }) => mappings.some(m => m.account_id === account.value && m.supplier_code === code))
      return filter === 'all' || (filter === 'done' ? done : !done)
    })
  }, [accounts, mappings, search, filter])

  const unassigned = sites.filter(site => site.use_yn === 'Y' && !site.assigned_account_ids.length)
  const excluded = sites.filter(site => site.use_yn === 'N')

  const save = async (account: AccountOption, supplier: SupplierCode, siteCode: string) => {
    const label = SUPPLIERS.find(item => item.code === supplier)?.label
    const previous = mappingOf(account.value, supplier)
    if (previous && previous.external_site_code !== siteCode) {
      const next = siteCode ? `'${sites.find(s => s.supplier_code === supplier && s.external_site_code === siteCode)?.external_site_name || siteCode}'(으)로 바꿉니다` : '지정을 해제합니다'
      if (!window.confirm(`${account.text}의 ${label} 사업장 '${previous.external_site_name}'을(를) ${next}.\n기존 사업장으로 저장된 상품·판가는 이 거래처에서 더 이상 보이지 않습니다. 계속할까요?`)) return
    }
    const key = `${account.value}:${supplier}`
    setSaving(key); setMessage(''); setError('')
    try {
      try { await assignSite(account.value, supplier, siteCode) }
      catch (reason) {
        if (!(reason instanceof SharedSiteError)) throw reason
        if (!window.confirm(`이 ${label} 사업장은 이미 [${names(reason.accountIds)}]에 지정되어 있습니다.\n본원과 주간보호처럼 같은 사업장으로 발주하는 경우에만 함께 사용하세요. 함께 사용할까요?`)) return
        await assignSite(account.value, supplier, siteCode, true)
      }
      setMessage(`${account.text} · ${label} 사업장을 ${siteCode ? '저장' : '해제'}했습니다.`)
      setReloadKey(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '저장에 실패했습니다.')
    } finally { setSaving('') }
  }

  const sync = async (supplier: SupplierCode) => {
    setSyncing(supplier); setMessage(''); setError('')
    try {
      const count = await syncMasterSites(supplier)
      setMessage(`${SUPPLIERS.find(item => item.code === supplier)?.label} 사업장 ${count}곳을 갱신했습니다. 거래처 지정은 바뀌지 않습니다.`)
      setReloadKey(value => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '사업장 목록 갱신에 실패했습니다.') }
    finally { setSyncing('') }
  }

  const toggleUse = async (site: SupplierMasterSite) => {
    setError('')
    try { await setMasterSiteUse(site.supplier_site_id, site.use_yn === 'Y' ? 'N' : 'Y'); setReloadKey(value => value + 1) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '저장에 실패했습니다.') }
  }

  const busy = loading || Boolean(syncing) || Boolean(saving)

  return <div className="supplier-integration-page"><SideMenuLayout header={<HeaderBar title="공급사 사업장 매핑" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리', to: '/order_manager' }, { label: '공급사 사업장 매핑' }]} />}>
    {syncing ? <LoadingScreen overlay message={`${SUPPLIERS.find(item => item.code === syncing)?.label} 사업장 목록을 받아오고 있습니다.`} /> : null}
    <section className="supplier-integration-toolbar site-mapping-toolbar">
      <label>거래처 검색<input value={search} onChange={event => setSearch(event.target.value)} placeholder="거래처명" /></label>
      <label>표시<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">전체</option><option value="missing">미지정 공급사 있음</option><option value="done">모두 지정됨</option></select></label>
      {SUPPLIERS.map(({ code, label }) => <button type="button" key={code} disabled={busy} onClick={() => void sync(code)}>{label} 사업장 목록 갱신</button>)}
      <p>거래처마다 공급사별 사업장을 한 번 지정하면, 상품 연결·판가 동기화·발주가 이 사업장 코드로 처리됩니다. 이름이 비슷한 후보는 위에 보이지만 자동으로 저장하지 않습니다. 코드와 물류센터·영업소를 확인하고 선택하세요.</p>
    </section>
    <section className="supplier-integration-summary">
      <article><span>거래처</span><strong>{accounts.length}</strong></article>
      {SUPPLIERS.map(({ code, label }) => <article key={code}><span>{label} 지정</span><strong>{new Set(mappings.filter(m => m.supplier_code === code).map(m => m.account_id)).size}</strong></article>)}
    </section>
    {message ? <div role="status" className="supplier-integration-message">{message}</div> : null}
    {error ? <div role="alert" className="supplier-integration-error">{error}</div> : null}
    {loading ? <LoadingScreen compact message="거래처와 공급사 사업장을 불러오는 중입니다." /> : <>
      {!sites.length ? <div className="supplier-integration-message">공급사 사업장 목록이 없습니다. 위의 '웰스토리 사업장 목록 갱신', '아워홈 사업장 목록 갱신'을 먼저 실행하세요.</div> : null}
      <div className="supplier-integration-grid"><section>
        <h2>거래처별 공급사 사업장 ({rows.length})</h2>
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
      <section>
        <h2>어느 거래처에도 지정되지 않은 공급사 사업장 ({unassigned.length})</h2>
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
  </SideMenuLayout></div>
}
