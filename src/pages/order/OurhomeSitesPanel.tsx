import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupplierSites, type SupplierSite } from '../../api/supplierIntegration'
import { buildApiUrl } from '../../config/api'
import OurhomeWorkflow from './OurhomeWorkflow'

type Site = {
  siteCode: string; siteName: string; headCode: string; headName: string
  centerCode: string; centerName: string; representativeCode: string; representativeName: string
  deliveryDates: string[]
}
type Result = { checkedAt: string; sites: Site[] }

export default function OurhomeSitesPanel({ accountId }: { accountId: string }) {
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  // 웰스토리와 같이 이 거래처에 지정된 아워홈 사업장(사업장 매핑)만 보여준다. undefined = 확인 중
  const [mapped, setMapped] = useState<SupplierSite | null | undefined>(undefined)
  useEffect(() => {
    if (!accountId) { setMapped(null); return }
    let active = true
    getSupplierSites(accountId)
      .then(rows => { if (active) setMapped(rows.find(row => row.supplier_code === 'OURHOME') ?? null) })
      .catch(reason => { if (active) { setMapped(null); setError(reason instanceof Error ? reason.message : '거래처 사업장 정보를 불러오지 못했습니다.') } })
    return () => { active = false }
  }, [accountId])
  // 발주 가능일은 아워홈 실시간 정보라 사업장 목록 API로 받아온다.
  const load = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError('')
    try {
      const response = await fetch(buildApiUrl('/v2/supplier-integration/ourhome/sites'), { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || '아워홈 사업장 조회에 실패했습니다.')
      if (!Array.isArray(payload.sites)) throw new Error('아워홈 사업장 응답을 확인해 주세요.')
      setResult(payload as Result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '아워홈 사업장 조회에 실패했습니다.')
    } finally { pending.current = false; setBusy(false) }
  }, [])
  useEffect(() => { if (mapped) void load() }, [mapped, load])
  const detail = mapped ? result?.sites.find(site => site.siteCode === mapped.external_site_code) : undefined
  return <div className="supplier-workspace" aria-busy={busy}>
    <aside className="supplier-site-list" aria-label="아워홈 사업장">
      <h2>사업장 <small>{mapped ? 1 : 0}개</small></h2>
      <div className="supplier-site-options">
        {mapped ? <button type="button" aria-pressed="true"><strong>{mapped.external_site_name || mapped.external_site_code}</strong><small>{mapped.external_site_code}{detail?.centerName ? ` · ${detail.centerName}` : ''}</small></button>
          : <p>{mapped === undefined ? '거래처 사업장을 확인하는 중입니다.' : '이 거래처에 지정된 아워홈 사업장이 없습니다.'}</p>}
      </div>
      <Link to="/order_manager/supplier-sites">공급사 사업장 매핑</Link>
      {mapped ? <button type="button" disabled={busy} onClick={() => void load()}>{busy ? '조회 중…' : '발주 가능일 새로고침'}</button> : null}
    </aside>
    <section className="supplier-workspace-detail ourhome-sites">
      <header className="supplier-detail-heading"><h2>{detail?.siteName || mapped?.external_site_name || '지정된 사업장 없음'}</h2><p>아워홈 · 사업장 정보 및 발주 가능일</p><small>최근 조회: {result ? new Date(result.checkedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미조회'}</small></header>
      {error && <p role="alert" className="supplier-integration-error">{error}{result ? ' 아래는 이전 조회 결과입니다.' : ''}</p>}
      {mapped && result && !detail ? <p role="alert" className="supplier-integration-error">지정된 사업장({mapped.external_site_code})이 현재 아워홈 사업장 목록에 없습니다. 아워홈에 확인하거나 사업장 매핑을 변경해 주세요.</p> : null}
      <p className="supplier-integration-message">납품일별 상품·판가와 주문·입고 내역을 확인하세요. 조회 결과는 거래처 재고에 자동 반영되지 않습니다.</p>
      {detail ? <>
        <dl className="supplier-site-facts"><div><dt>사업장 코드</dt><dd>{detail.siteCode}</dd></div><div><dt>본부</dt><dd>{detail.headName || '-'} {detail.headCode}</dd></div><div><dt>물류센터</dt><dd>{detail.centerName || '-'} {detail.centerCode}</dd></div><div><dt>대표사업장</dt><dd>{detail.representativeName || '-'} {detail.representativeCode}</dd></div></dl>
        <OurhomeWorkflow accountId={accountId} key={`${detail.siteCode}:${result?.checkedAt}`} siteCode={detail.siteCode} siteName={detail.siteName} deliveryDates={detail.deliveryDates} disabled={busy || Boolean(error)} />
      </> : mapped === null ? <p>이 거래처에 지정된 아워홈 사업장이 없습니다. <Link to="/order_manager/supplier-sites">공급사 사업장 매핑</Link>에서 먼저 지정해 주세요.</p> : busy ? <p>아워홈 발주 가능일을 불러오는 중입니다.</p> : null}
    </section>
  </div>
}