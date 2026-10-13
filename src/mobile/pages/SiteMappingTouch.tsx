import { useState } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import type { AccountOption } from '../../api/operations'
import { SITE_SUPPLIERS, rankSites, siteLabel, useSiteMapping } from '../../features/order/useSiteMapping'
import './SiteMappingTouch.css'

type View = 'all' | 'missing' | 'done' | 'sites'
const VIEWS: { key: View; label: string; icon: TouchIconName }[] = [
  { key: 'all', label: '전체 거래처', icon: 'store' },
  { key: 'missing', label: '미지정 있음', icon: 'alert' },
  { key: 'done', label: '모두 지정됨', icon: 'check' },
  { key: 'sites', label: '남는 사업장', icon: 'box' },
]

/**
 * 공급사 사업장 매핑(태블릿·휴대폰): 거래처 카드(공급사별 지정 상태) → 오른쪽에서 공급사마다 사업장을 눌러 고른다.
 * 비슷한 이름 후보가 위에 오고 ★가 추천이지만 자동 저장은 하지 않는다. 로직은 PC와 같은 useSiteMapping.
 */
export default function SiteMappingTouch() {
  const m = useSiteMapping()
  const [view, setView] = useState<View>('all')
  const [selectedId, setSelectedId] = useState('')
  const selected = m.accounts.find(account => account.value === selectedId) || null
  const keyword = m.search.trim().toLowerCase()
  const searched = m.accounts.filter(account => !keyword || account.text.toLowerCase().includes(keyword))
  const counts: Record<View, number> = {
    all: searched.length,
    missing: searched.filter(a => !m.isDone(a.value)).length,
    done: searched.filter(a => m.isDone(a.value)).length,
    sites: m.unassigned.length + m.excluded.length,
  }
  const chooseView = (next: View) => { setView(next); if (next !== 'sites') m.setFilter(next) }

  const toolbar = <>
    <label className="t-chip sm-search">
      <TouchIcon name="search" />
      <input type="search" value={m.search} placeholder="거래처 검색" onChange={e => m.setSearch(e.target.value)} />
    </label>
    {SITE_SUPPLIERS.map(({ code, label }) => <button key={code} type="button" className="t-btn is-soft" disabled={m.busy} onClick={() => void m.sync(code)}>
      <TouchIcon name="refresh" size={18} />{m.syncing === code ? '받는 중…' : `${label} 목록 갱신`}
    </button>)}
  </>

  const aside = selected
    ? <AccountPanel account={selected} m={m} onClose={() => setSelectedId('')} />
    : <div className="sm-panel">
      <div className="sm-panel__head"><h2>사업장 지정</h2><p>거래처마다 공급사별 사업장을 한 번 정하면 상품 연결·판가·발주가 그 사업장 코드로 처리됩니다.</p></div>
      <div className="sm-panel__body">
        <div className="sm-stats">
          <div><span>거래처</span><strong>{m.accounts.length}</strong></div>
          {SITE_SUPPLIERS.map(({ code, label }) => <div key={code}><span>{label} 지정</span><strong>{new Set(m.mappings.filter(x => x.supplier_code === code).map(x => x.account_id)).size}</strong></div>)}
        </div>
        <p className="sm-hint">거래처를 누르면 공급사별 사업장 후보가 여기에 나옵니다.</p>
      </div>
    </div>

  return <TouchLayout title="공급사 사업장 매핑" subtitle={`거래처 ${m.accounts.length}곳`} toolbar={toolbar} aside={aside} hideAccount>
    <div className="t-tabs" role="tablist" aria-label="보기">
      {VIEWS.map(v => <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
        className={`t-tab${view === v.key ? ' is-active' : ''}${v.key === 'missing' && counts.missing ? ' sm-tab--alert' : ''}`} onClick={() => chooseView(v.key)}>
        <TouchIcon name={v.icon} /><strong>{v.label}</strong><small>{counts[v.key]}곳</small>
      </button>)}
    </div>

    {m.message && <p className="t-msg sm-ok" role="status">{m.message}</p>}
    {m.error && <p className="t-msg is-error" role="alert">{m.error}</p>}
    {m.loading && <p className="t-msg" role="status">거래처와 공급사 사업장을 불러오는 중…</p>}
    {!m.loading && !m.sites.length && <p className="t-msg is-warn">공급사 사업장 목록이 없습니다. 위의 '목록 갱신'을 먼저 눌러주세요.</p>}

    {view !== 'sites' && <div className="sm-grid">
      {m.rows.map(account => <button key={account.value} type="button" className={`t-card sm-card${account.value === selectedId ? ' is-selected' : ''}`} onClick={() => setSelectedId(account.value === selectedId ? '' : account.value)}>
        <span className="sm-card__head"><span className="t-dot">{account.text.slice(0, 1)}</span><span><strong>{account.text}</strong><small>{account.value}</small></span></span>
        {SITE_SUPPLIERS.map(({ code, label }) => {
          const current = m.mappingOf(account.value, code)
          return <span key={code} className={`sm-card__site${current ? '' : ' is-missing'}`}>
            <em>{label}</em>{current ? `${current.external_site_name} · ${current.external_site_code}` : '미지정'}
          </span>
        })}
      </button>)}
      {!m.loading && !m.rows.length && <p className="t-msg">조건에 맞는 거래처가 없습니다.</p>}
    </div>}

    {view === 'sites' && <>
      <p className="sm-hint sm-hint--top">본사·마감용처럼 발주에 쓰지 않는 사업장은 '매핑 제외'로 두면 후보와 이 목록에서 빠집니다.</p>
      <ul className="sm-sites">
        {[...m.unassigned, ...m.excluded].map(site => <li key={site.supplier_site_id} className={`t-card${site.use_yn === 'N' ? ' is-excluded' : ''}`}>
          <span className="t-dot">{site.supplier_name.slice(0, 1)}</span>
          <div><strong>{site.external_site_name}</strong><small>{site.supplier_name} · {site.external_site_code}{site.center_name || site.center_code ? ` · ${site.center_name || site.center_code}` : ''}</small></div>
          <span className={`t-badge ${site.use_yn === 'N' ? '' : 'is-warn'}`}>{site.use_yn === 'N' ? '매핑 제외' : site.provider_listed_yn === 'N' ? '공급사 목록에서 빠짐' : '미지정'}</span>
          <button type="button" className="t-btn is-small" disabled={m.busy} onClick={() => void m.toggleUse(site)}>{site.use_yn === 'Y' ? '매핑 제외' : '복원'}</button>
        </li>)}
        {!m.unassigned.length && !m.excluded.length && <p className="t-msg">모든 공급사 사업장이 거래처에 지정되어 있습니다.</p>}
      </ul>
    </>}
  </TouchLayout>
}

/** 오른쪽: 거래처 한 곳의 공급사별 사업장 고르기(후보를 누르면 바로 저장, 바꾸거나 해제할 때는 확인) */
function AccountPanel({ account, m, onClose }: { account: AccountOption; m: ReturnType<typeof useSiteMapping>; onClose: () => void }) {
  const [supplier, setSupplier] = useState(SITE_SUPPLIERS[0].code)
  const [all, setAll] = useState(false)
  const current = m.mappingOf(account.value, supplier)
  const { ordered, suggestion } = rankSites(account, m.selectable(supplier))
  const shown = all ? ordered : ordered.slice(0, 8)
  const savingHere = m.saving === `${account.value}:${supplier}`

  return <div className="sm-panel">
    <div className="sm-panel__head sm-panel__head--account">
      <span className="t-dot">{account.text.slice(0, 1)}</span>
      <div><h2>{account.text}</h2><p>{account.value}</p></div>
      <button type="button" className="t-btn is-icon is-ghost" aria-label="닫기" onClick={onClose}><TouchIcon name="close" /></button>
    </div>
    <div className="sm-panel__body">
      <div className="t-segment">{SITE_SUPPLIERS.map(({ code, label }) => <button key={code} type="button" className={supplier === code ? 'is-active' : ''} onClick={() => { setSupplier(code); setAll(false) }}>
        {label}{m.mappingOf(account.value, code) ? ' ✓' : ''}
      </button>)}</div>

      <div className={`sm-current${current ? ' is-set' : ''}`}>
        <span>지금 지정된 사업장</span>
        <strong>{current ? current.external_site_name : '미지정'}</strong>
        {current && <small>{current.external_site_code}{current.mod_at ? ` · ${current.mod_at.slice(0, 16).replace('T', ' ')}` : ''}{current.user_id ? ` · ${current.user_id}` : ''}</small>}
        {current && <button type="button" className="t-btn is-small is-danger" disabled={m.busy} onClick={() => void m.save(account, supplier, '')}>지정 해제</button>}
      </div>

      {suggestion.best && suggestion.close > 1 && <p className="sm-hint">이름이 비슷한 후보가 {suggestion.close}개입니다. 코드와 물류센터를 확인하고 고르세요.</p>}
      {savingHere && <p className="sm-hint" role="status">저장 중…</p>}
      <ul className="sm-candidates">
        {shown.map(({ site }) => {
          const others = site.assigned_account_ids.filter(id => id !== account.value)
          const isCurrent = current?.external_site_code === site.external_site_code
          const isBest = suggestion.best?.site === site
          return <li key={site.supplier_site_id}>
            <button type="button" className={isCurrent ? 'is-current' : ''} disabled={m.busy || isCurrent} onClick={() => void m.save(account, supplier, site.external_site_code)}>
              <span className="sm-candidates__name">{isBest && <span className="t-badge is-yellow">추천</span>}<strong>{site.external_site_name || site.external_site_code}</strong></span>
              <small>{siteLabel(site)}</small>
              {others.length > 0 && <small className="sm-candidates__shared">사용 중: {m.names(others)}</small>}
              {isCurrent && <span className="t-badge is-ok">지정됨</span>}
            </button>
          </li>
        })}
      </ul>
      {ordered.length > shown.length && <button type="button" className="t-btn is-soft is-block" onClick={() => setAll(true)}>후보 {ordered.length - shown.length}개 더 보기</button>}
      {!ordered.length && <p className="sm-hint">이 공급사의 사업장 목록이 없습니다. 위의 '목록 갱신'을 눌러주세요.</p>}
    </div>
  </div>
}
