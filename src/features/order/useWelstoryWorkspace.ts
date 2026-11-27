import { useEffect, useState } from 'react'
import {
  getSupplierOfferPage, getSupplierSites, getSupplierSyncStatus,
  syncWelstoryAuto, syncWelstoryCatalog, syncWelstoryReceipts, syncWelstorySites,
  type SupplierOffer, type WelstoryCycleResult, type SupplierSite, type SupplierSyncStatus,
} from '../../api/supplierIntegration'

const today = () => new Date().toISOString().slice(0, 10)
/** 상품·판가 표 한 페이지 줄 수. 웰스토리 사업장 판가가 2만여 건이라 전체를 그리면 화면이 멈췄다(2026-11-27). */
export const OFFER_PAGE_SIZE = 100

/**
 * 공급사 통합 연동 — 웰스토리 업무(PC·터치 공용): 거래처에 지정된 사업장, 납품일별 상품·가격, 동기화 상태,
 * 사업장 목록 갱신·순기 자동 동기화·전체 판가 동기화·입고 반영.
 * 상품·판가는 서버에서 한 페이지(OFFER_PAGE_SIZE줄)씩 받는다 — 검색·주문 불가만 보기도 서버에서, 건수는 전체 기준.
 */
export function useWelstoryWorkspace(accountId: string) {
  const [siteSearch, setSiteSearch] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [sites, setSites] = useState<SupplierSite[]>([])
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [statuses, setStatuses] = useState<SupplierSyncStatus[]>([])
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [unavailableOnly, setUnavailableOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [allCount, setAllCount] = useState(0)
  const [unavailableCount, setUnavailableCount] = useState(0)
  const [offersLoading, setOffersLoading] = useState(false)
  const [baseLoading, setBaseLoading] = useState(false)
  const [actionLoading, setLoading] = useState(false)
  const loading = baseLoading || offersLoading || actionLoading
  const [error, setError] = useState(accountId ? '' : '로그인한 고객사 정보가 없습니다.')
  const [periodYear, setPeriodYear] = useState(() => localStorage.getItem('welstory_period_year') || String(new Date().getFullYear()))
  const [periodGroup, setPeriodGroup] = useState(() => localStorage.getItem('welstory_period_group') || '')
  const [chosenSite, setSelectedSite] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  // 고르지 않았으면 첫 웰스토리 사업장(이전에는 effect로 채웠다)
  const selectedSite = chosenSite || sites.find((site) => site.supplier_code === 'WELSTORY')?.external_site_code || ''

  // 사업장·동기화 상태
  useEffect(() => {
    if (!accountId) return
    let active = true
    setBaseLoading(true); setError('')
    Promise.all([getSupplierSites(accountId), getSupplierSyncStatus(accountId)])
      .then(([nextSites, nextStatuses]) => {
        if (active) { setSites(nextSites.filter(site => site.supplier_code === 'WELSTORY')); setStatuses(nextStatuses) }
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.') })
      .finally(() => { if (active) setBaseLoading(false) })
    return () => { active = false }
  }, [accountId, reloadKey])

  // 검색어는 입력이 멈추면(0.3초) 서버로, 조건이 바뀌면 1페이지부터
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])
  // 렌더 중에 바로 1페이지로(effect로 하면 예전 페이지 번호로 한 번 더 조회한다)
  const filterKey = [accountId, deliveryDate, selectedSite, keyword, unavailableOnly].join('|')
  const [pageFilterKey, setPageFilterKey] = useState(filterKey)
  if (pageFilterKey !== filterKey) { setPageFilterKey(filterKey); setPage(1) }

  // 상품·판가 한 페이지
  useEffect(() => {
    if (!accountId || !selectedSite) { setOffers([]); setTotalCount(0); setAllCount(0); setUnavailableCount(0); return }
    let active = true
    setOffersLoading(true)
    getSupplierOfferPage(accountId, deliveryDate, selectedSite, { page, size: OFFER_PAGE_SIZE, keyword, unavailableOnly })
      .then((result) => {
        if (!active) return
        setOffers(result.rows); setTotalCount(result.totalCount); setAllCount(result.allCount); setUnavailableCount(result.unavailableCount)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '상품 조회에 실패했습니다.') })
      .finally(() => { if (active) setOffersLoading(false) })
    return () => { active = false }
  }, [accountId, deliveryDate, selectedSite, page, keyword, unavailableOnly, reloadKey])

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

  // 검색·주문 불가만 보기는 서버가 이미 걸렀다 — 지금 페이지 줄
  const filtered = offers
  const pageCount = Math.max(1, Math.ceil(totalCount / OFFER_PAGE_SIZE))
  const selected = sites.find(site => site.external_site_code === selectedSite)
  const visibleSites = sites.filter(site => `${site.external_site_name} ${site.external_site_code}`.toLowerCase().includes(siteSearch.trim().toLowerCase()))

  return {
    siteSearch, setSiteSearch, deliveryDate, setDeliveryDate, sites, offers, statuses, search, setSearch, loading, error,
    periodYear, setPeriodYear, periodGroup, setPeriodGroup, selectedSite, setSelectedSite, syncMessage, setSyncMessage, reload,
    runSiteSync, runCatalogSync, runAutoSync, runReceiptSync, filtered, selected, visibleSites, unavailableCount,
    page, setPage, pageCount, totalCount, allCount, unavailableOnly, setUnavailableOnly, searching: search.trim() !== keyword,
  }
}
