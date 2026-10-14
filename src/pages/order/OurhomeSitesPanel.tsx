import { Link } from 'react-router-dom'
import { useOurhomeSite, type OurhomeSiteState } from '../../features/order/useOurhomeSite'
import SupplierSiteBar from './SupplierSiteBar'
import OurhomeWorkflow from './OurhomeWorkflow'

/** 아워홈 사업장 정보 줄(웰스토리와 같은 SupplierSiteBar 틀). */
export function OurhomeSiteBar({ site }: { site: OurhomeSiteState }) {
  const { mapped, result, busy, error, load, detail } = site
  return <SupplierSiteBar
    supplierName="아워홈"
    sites={mapped ? [{ code: mapped.external_site_code, name: mapped.external_site_name, sub: detail?.centerName }] : []}
    selected={mapped?.external_site_code || ''}
    emptyText={mapped === undefined ? '거래처 사업장을 확인하는 중입니다.' : '이 거래처에 지정된 아워홈 사업장이 없습니다.'}
    facts={detail ? [['코드', detail.siteCode], ['물류센터', detail.centerName || detail.centerCode || '-'], ['대표사업장', detail.representativeName || detail.representativeCode || '-'],
      ['발주 가능일', detail.deliveryDates.length ? `${detail.deliveryDates.length}일 · ${detail.deliveryDates[0]}~` : '없음']] : []}
    updated={`조회 ${result ? new Date(result.checkedAt).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16) : '전'}`}
    notice={<>
      {error && <p role="alert" className="supplier-integration-error">{error}{result ? ' 아래는 이전 조회 결과입니다.' : ''}</p>}
      {mapped && result && !detail ? <p role="alert" className="supplier-integration-error">지정된 사업장({mapped.external_site_code})이 현재 아워홈 사업장 목록에 없습니다. 아워홈에 확인하거나 사업장 매핑을 변경해 주세요.</p> : null}
    </>}
    actions={<>
      <Link to="/order_manager/supplier-sites">공급사 사업장 매핑</Link>
      {mapped ? <button type="button" disabled={busy} onClick={() => void load()}>{busy ? '조회 중…' : '새로고침'}</button> : null}
    </>}
  />
}

/** 아워홈 업무 영역(상품·판가 / 주문·입고 / 연동 관리). 사업장이 준비되지 않았으면 안내만. */
export function OurhomeWork({ site }: { site: OurhomeSiteState }) {
  const { accountId, mapped, result, busy, error, detail } = site
  if (detail) return <OurhomeWorkflow accountId={accountId} key={`${detail.siteCode}:${result?.checkedAt}`} siteCode={detail.siteCode} siteName={detail.siteName} deliveryDates={detail.deliveryDates} disabled={busy || Boolean(error)} />
  return <p className="supplier-integration-message">{mapped === null ? <>이 거래처에 지정된 아워홈 사업장이 없습니다. <Link to="/order_manager/supplier-sites">공급사 사업장 매핑</Link>에서 먼저 지정해 주세요.</> : busy || mapped === undefined ? '아워홈 발주 가능일을 불러오는 중입니다.' : '사업장 정보를 확인한 뒤 계속해 주세요.'}</p>
}

/** 터치 화면용 묶음(사업장 정보 + 업무). PC 공급사 통합 연동은 둘을 따로 배치한다. */
export default function OurhomeSitesPanel({ accountId }: { accountId: string }) {
  const site = useOurhomeSite(accountId)
  return <div className="ourhome-sites-stack" aria-busy={site.busy}><OurhomeSiteBar site={site} /><OurhomeWork site={site} /></div>
}
