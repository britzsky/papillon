import { useEffect, useMemo, useState } from 'react'
import {
  getSupplierOffers, getSupplierSites, getSupplierSyncStatus,
  syncWelstoryAuto, syncWelstoryCatalog, syncWelstoryReceipts, syncWelstorySites,
  type SupplierOffer, type WelstoryCycleResult, type SupplierSite, type SupplierSyncStatus,
} from '../../api/supplierIntegration'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * 공급사 통합 연동 — 웰스토리 업무(PC·터치 공용): 거래처에 지정된 사업장, 납품일별 상품·가격, 동기화 상태,
 * 사업장 목록 갱신·순기 자동 동기화·전체 판가 동기화·입고 반영.
 */
export function useWelstoryWorkspace(accountId: string) {
  const [siteSearch, setSiteSearch] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [sites, setSites] = useState<SupplierSite[]>([])
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [statuses, setStatuses] = useState<SupplierSyncStatus[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(accountId ? '' : '로그인한 고객사 정보가 없습니다.')
  const [periodYear, setPeriodYear] = useState(() => localStorage.getItem('welstory_period_year') || String(new Date().getFullYear()))
  const [periodGroup, setPeriodGroup] = useState(() => localStorage.getItem('welstory_period_group') || '')
  const [chosenSite, setSelectedSite] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  // 고르지 않았으면 첫 웰스토리 사업장(이전에는 effect로 채웠다)
  const selectedSite = chosenSite || sites.find((site) => site.supplier_code === 'WELSTORY')?.external_site_code || ''

  useEffect(() => {
    if (!accountId) return
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

  const reload = () => setReloadKey((value) => value + 1)

  const runSiteSync = async () => {
    if (!accountId) return setSyncMessage('로그인한 고객사 정보가 없습니다.')
    setLoading(true); setSyncMessage(''); setError('')
    try {
      const result = await syncWelstorySites(accountId)
      setSyncMessage(`웰스토리 사업장 목록 ${Number(result.saved_count) || 0}곳을 갱신했습니다. 이 거래처의 사업장 지정은 '공급사 사업장 매핑'에서 합니다.`)
      reload()
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
      reload()
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
      reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '순기 자동 동기화에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const runReceiptSync = async () => {
    if (!selectedSite) return setSyncMessage('먼저 웰스토리 사업장을 선택해 주세요.')
    setLoading(true); setSyncMessage(''); setError('')
    try {
      const result = await syncWelstoryReceipts(accountId, selectedSite, deliveryDate)
      setSyncMessage(`입고 ${Number(result.received_count) || 0}건 조회, 재고 ${Number(result.posted_count) || 0}건 반영, 주문 미연결 ${Number(result.unmatched_count) || 0}건`)
      reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '입고 동기화에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return keyword ? offers.filter((item) => `${item.product_name} ${item.supplier_item_code} ${item.supplier_name}`.toLowerCase().includes(keyword)) : offers
  }, [offers, search])
  const selected = sites.find(site => site.external_site_code === selectedSite)
  const visibleSites = sites.filter(site => `${site.external_site_name} ${site.external_site_code}`.toLowerCase().includes(siteSearch.trim().toLowerCase()))
  const unavailableCount = offers.filter((item) => item.orderable_yn === 'N' || item.product_status !== 'ACTIVE').length

  return {
    siteSearch, setSiteSearch, deliveryDate, setDeliveryDate, sites, offers, statuses, search, setSearch, loading, error,
    periodYear, setPeriodYear, periodGroup, setPeriodGroup, selectedSite, setSelectedSite, syncMessage, setSyncMessage, reload,
    runSiteSync, runCatalogSync, runAutoSync, runReceiptSync, filtered, selected, visibleSites, unavailableCount,
  }
}
