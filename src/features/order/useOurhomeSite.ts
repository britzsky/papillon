import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupplierSites, type SupplierSite } from '../../api/supplierIntegration'
import { buildApiUrl } from '../../config/api'

export type OurhomeSite = {
  siteCode: string; siteName: string; headCode: string; headName: string
  centerCode: string; centerName: string; representativeCode: string; representativeName: string
  deliveryDates: string[]
}
type Result = { checkedAt: string; sites: OurhomeSite[] }

/**
 * 공급사 통합 연동 — 아워홈 사업장(PC·터치 공용): 이 거래처에 지정된 아워홈 사업장(사업장 매핑)과
 * 아워홈 실시간 사업장 정보(발주 가능일 포함).
 */
export function useOurhomeSite(accountId: string) {
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
  return { accountId, mapped, result, busy, error, load, detail }
}
export type OurhomeSiteState = ReturnType<typeof useOurhomeSite>
