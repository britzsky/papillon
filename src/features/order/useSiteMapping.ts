import { useEffect, useMemo, useState } from 'react'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import {
  assignSite, getMasterSites, getSiteMappings, nameScore, setMasterSiteUse, SharedSiteError, syncMasterSites,
  type SupplierCode, type SupplierMasterSite, type SupplierSiteMapping,
} from '../../api/supplierSites'

export const SITE_SUPPLIERS: { code: SupplierCode; label: string }[] = [{ code: 'WELSTORY', label: '웰스토리' }, { code: 'OURHOME', label: '아워홈' }]
const RECOMMEND_MIN = 0.55

export type SiteCandidate = { site: SupplierMasterSite; score: number }
export type SiteSuggestion = { best?: SiteCandidate; close: number }

export const siteLabel = (site: SupplierMasterSite) =>
  `${site.external_site_name || site.external_site_code} · ${site.external_site_code}${site.center_name || site.center_code ? ` · ${site.center_name || site.center_code}` : ''}`

/** 이름이 비슷한 순으로 후보를 정렬하고, 1위가 뚜렷할 때만 추천한다. */
export function rankSites(account: AccountOption, sites: SupplierMasterSite[]): { ordered: SiteCandidate[]; suggestion: SiteSuggestion } {
  const ordered = sites.map(site => ({ site, score: nameScore(account.text, site.external_site_name) }))
    .sort((a, b) => b.score - a.score || a.site.external_site_name.localeCompare(b.site.external_site_name, 'ko'))
  const top = ordered[0]
  const close = ordered.filter(item => top && item.score >= RECOMMEND_MIN && top.score - item.score < 0.15).length
  return { ordered, suggestion: { best: top && top.score >= RECOMMEND_MIN ? top : undefined, close } }
}

/**
 * 거래처별 공급사 사업장 매핑(PC·터치 공용): 조회·지정/해제(같이 쓰는 사업장 확인)·공급사 목록 갱신·매핑 제외.
 * 확인 창은 window.confirm(두 화면 같은 문구).
 */
export function useSiteMapping() {
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
    Promise.all([getAccountOptions(), getMasterSites(), getSiteMappings()])
      .then(([nextAccounts, nextSites, nextMappings]) => {
        if (!active) return
        setAccounts(nextAccounts.filter(item => item.value).sort((a, b) => a.text.localeCompare(b.text, 'ko')))
        setSites(nextSites); setMappings(nextMappings); setError('')
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reloadKey])
  const reload = () => { setLoading(true); setReloadKey(value => value + 1) }

  const accountName = useMemo(() => new Map(accounts.map(item => [item.value, item.text])), [accounts])
  const mappingOf = (accountId: string, supplier: SupplierCode) =>
    mappings.find(item => item.account_id === accountId && item.supplier_code === supplier)
  const selectable = (supplier: SupplierCode) => sites.filter(site => site.supplier_code === supplier && site.use_yn === 'Y')
  const names = (ids: string[]) => ids.map(id => accountName.get(id) || id).join(', ')
  const isDone = (accountId: string) => SITE_SUPPLIERS.every(({ code }) => mappings.some(m => m.account_id === accountId && m.supplier_code === code))

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return accounts.filter(account => {
      if (keyword && !account.text.toLowerCase().includes(keyword)) return false
      const done = SITE_SUPPLIERS.every(({ code }) => mappings.some(m => m.account_id === account.value && m.supplier_code === code))
      return filter === 'all' || (filter === 'done' ? done : !done)
    })
  }, [accounts, mappings, search, filter])

  const unassigned = sites.filter(site => site.use_yn === 'Y' && !site.assigned_account_ids.length)
  const excluded = sites.filter(site => site.use_yn === 'N')

  const save = async (account: AccountOption, supplier: SupplierCode, siteCode: string) => {
    const label = SITE_SUPPLIERS.find(item => item.code === supplier)?.label
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
      reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '저장에 실패했습니다.')
    } finally { setSaving('') }
  }

  const sync = async (supplier: SupplierCode) => {
    setSyncing(supplier); setMessage(''); setError('')
    try {
      const count = await syncMasterSites(supplier)
      setMessage(`${SITE_SUPPLIERS.find(item => item.code === supplier)?.label} 사업장 ${count}곳을 갱신했습니다. 거래처 지정은 바뀌지 않습니다.`)
      reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '사업장 목록 갱신에 실패했습니다.') }
    finally { setSyncing('') }
  }

  const toggleUse = async (site: SupplierMasterSite) => {
    setError('')
    try { await setMasterSiteUse(site.supplier_site_id, site.use_yn === 'Y' ? 'N' : 'Y'); reload() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '저장에 실패했습니다.') }
  }

  const busy = loading || Boolean(syncing) || Boolean(saving)

  return {
    accounts, sites, mappings, loading, syncing, saving, error, message, search, setSearch, filter, setFilter,
    mappingOf, selectable, names, isDone, rows, unassigned, excluded, save, sync, toggleUse, busy,
  }
}
