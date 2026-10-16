import { workspaceAccountId } from '../workspace/workspaceAccount'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { type AppAlertState } from '../../components/AppAlert'
import { getAccountMenuManagerList, getAccountOptions, getIngredientOptions, getMenuDetailList, getMenuManagerList, saveAccountMenuManager, type AccountOption, type IngredientOption, type MenuManagerItem } from '../../api/operations'
import { buildAccountMenuSavePayload, matchesMenuFilters, type EditableMenuIngredientItem } from '../../pages/operations/menuManagerShared'
import { toAccountDetailItems } from './useAccountMenuManager'

export const IMPORT_PAGE_SIZE = 30

/**
 * 본사 메뉴 가져오기: 본사 메뉴 마스터를 읽기만 하고, 고른 메뉴를 본사 레시피 그대로 거래처 메뉴로 등록한다.
 * 마스터 정보는 고치지 않는다(분류·레시피 수정은 거래처 메뉴 관리에서 거래처 것만).
 * 저장은 거래처 메뉴 관리와 같은 /Menu/AccountMenuSave — 새 메뉴만 보내고 기존 거래처 메뉴는 건드리지 않는다.
 */
export function useAccountMenuImport() {
  const [searchParams] = useSearchParams()
  const [selectedAccountId, setSelectedAccountId] = useState(workspaceAccountId(searchParams))
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([])
  const [menuItems, setMenuItems] = useState<MenuManagerItem[]>([])
  const [menuError, setMenuError] = useState('')
  const [isMenuLoading, setIsMenuLoading] = useState(true)
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set())
  const [isRegisteredLoading, setIsRegisteredLoading] = useState(false)
  const [mealCategory, setMealCategory] = useState('')
  const [menuType, setMenuType] = useState('')
  const [menuGubun, setMenuGubun] = useState('')
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')
  const [hideRegistered, setHideRegistered] = useState(true)
  const [likedOnly, setLikedOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [previewMenuId, setPreviewMenuId] = useState<string | null>(null)
  const [detailsByMenuId, setDetailsByMenuId] = useState<Record<string, EditableMenuIngredientItem[]>>({})
  const [detailError, setDetailError] = useState('')
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [alert, setAlert] = useState<AppAlertState | null>(null)

  useEffect(() => {
    let alive = true
    getAccountOptions().then((items) => { if (alive) setAccountOptions(items) }).catch(() => { if (alive) setAccountOptions([]) })
    getIngredientOptions().then((items) => { if (alive) setIngredientOptions(items) }).catch(() => { if (alive) setIngredientOptions([]) })
    getMenuManagerList()
      .then((items) => { if (alive) { setMenuItems(items); setMenuError('') } })
      .catch((error) => { if (alive) { setMenuItems([]); setMenuError(error instanceof Error ? error.message : '본사 메뉴 목록을 불러오지 못했습니다.') } })
      .finally(() => { if (alive) setIsMenuLoading(false) })
    return () => { alive = false }
  }, [])

  const [registeredVersion, setRegisteredVersion] = useState(0)
  useEffect(() => {
    let alive = true
    setSelectedIds([])
    if (!selectedAccountId) { setRegisteredIds(new Set()); return }
    setIsRegisteredLoading(true)
    getAccountMenuManagerList(selectedAccountId)
      .then((items) => { if (alive) setRegisteredIds(new Set(items.map((item) => item.menu_id).filter(Boolean))) })
      .catch((error) => {
        if (!alive) return
        setRegisteredIds(new Set())
        setAlert({ type: 'error', title: '조회 실패', message: error instanceof Error ? error.message : '거래처 메뉴를 불러오지 못했습니다.' })
      })
      .finally(() => { if (alive) setIsRegisteredLoading(false) })
    return () => { alive = false }
  }, [selectedAccountId, registeredVersion])

  const filteredItems = useMemo(() => menuItems.filter((item) =>
    matchesMenuFilters(item, { mealCategory, keyword, menuType, menuGubun })
    && !(likedOnly && item.like !== 'Y')
    && !(hideRegistered && registeredIds.has(item.menu_id))), [likedOnly, hideRegistered, keyword, mealCategory, menuGubun, menuItems, menuType, registeredIds])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / IMPORT_PAGE_SIZE))
  useEffect(() => { setCurrentPage(1) }, [keyword, mealCategory, menuType, menuGubun, hideRegistered, likedOnly])
  useEffect(() => { setCurrentPage((page) => Math.min(page, totalPages)) }, [totalPages])
  const pagedItems = useMemo(() => filteredItems.slice((currentPage - 1) * IMPORT_PAGE_SIZE, currentPage * IMPORT_PAGE_SIZE), [currentPage, filteredItems])

  const selectableOnPage = pagedItems.filter((item) => !registeredIds.has(item.menu_id)).map((item) => item.menu_id)
  const isPageChecked = selectableOnPage.length > 0 && selectableOnPage.every((id) => selectedIds.includes(id))
  const isPageIndeterminate = !isPageChecked && selectableOnPage.some((id) => selectedIds.includes(id))
  const selectedMenus = useMemo(() => selectedIds.map((id) => menuItems.find((item) => item.menu_id === id)).filter((item): item is MenuManagerItem => Boolean(item)), [menuItems, selectedIds])

  const toggleSelect = (menuId: string) => {
    if (!selectedAccountId || registeredIds.has(menuId)) return
    setSelectedIds((current) => current.includes(menuId) ? current.filter((id) => id !== menuId) : [...current, menuId])
  }
  const togglePage = () => {
    if (!selectedAccountId || selectableOnPage.length === 0) return
    setSelectedIds((current) => isPageChecked
      ? current.filter((id) => !selectableOnPage.includes(id))
      : Array.from(new Set([...current, ...selectableOnPage])))
  }

  const loadDetails = async (menuId: string) => {
    if (detailsByMenuId[menuId]) return detailsByMenuId[menuId]
    const items = toAccountDetailItems(await getMenuDetailList(menuId), ingredientOptions)
    setDetailsByMenuId((current) => ({ ...current, [menuId]: items }))
    return items
  }

  const previewMenu = previewMenuId ? menuItems.find((item) => item.menu_id === previewMenuId) ?? null : null
  useEffect(() => {
    if (!previewMenuId || detailsByMenuId[previewMenuId]) { setDetailError(''); return }
    let alive = true
    setIsDetailLoading(true)
    setDetailError('')
    getMenuDetailList(previewMenuId)
      .then((items) => { if (alive) setDetailsByMenuId((current) => ({ ...current, [previewMenuId]: toAccountDetailItems(items, ingredientOptions) })) })
      .catch((error) => { if (alive) setDetailError(error instanceof Error ? error.message : '본사 레시피를 불러오지 못했습니다.') })
      .finally(() => { if (alive) setIsDetailLoading(false) })
    return () => { alive = false }
  }, [detailsByMenuId, ingredientOptions, previewMenuId])
  const previewDetails = previewMenuId ? detailsByMenuId[previewMenuId] ?? [] : []

  const selectedAccountName = accountOptions.find((item) => item.value === selectedAccountId)?.text ?? ''

  /** 고른 메뉴를 본사 분류·레시피 그대로 거래처 메뉴로 등록(기존 거래처 메뉴는 그대로) */
  const register = async () => {
    if (!selectedAccountId || selectedMenus.length === 0 || isSaving) return
    const invalid = selectedMenus.find((item) => item.menu_type === '' || item.menu_gubun === '')
    if (invalid) {
      setAlert({ type: 'error', title: '등록 확인', message: `${invalid.menu_name || invalid.menu_id}은(는) 본사 메뉴에 메뉴유형·메뉴구분이 없습니다. 본사 메뉴 관리에서 먼저 정해주세요.` })
      return
    }
    setIsSaving(true)
    setAlert(null)
    try {
      const entries = await Promise.all(selectedMenus.map(async (menu) => [menu.menu_id, await loadDetails(menu.menu_id)] as const))
      const payload = buildAccountMenuSavePayload(selectedAccountId, selectedAccountName, '', selectedMenus, menuItems, Object.fromEntries(entries), [], {})
      await saveAccountMenuManager(payload)
      const count = selectedMenus.length
      setSelectedIds([])
      setRegisteredVersion((v) => v + 1)
      setAlert({ type: 'success', title: '등록 완료', message: `${selectedAccountName || '거래처'}에 메뉴 ${count}개를 등록했습니다. 레시피·분류는 거래처 메뉴 관리에서 거래처 것만 고칠 수 있습니다.` })
    } catch (error) {
      setAlert({ type: 'error', title: '등록 실패', message: error instanceof Error ? error.message : '거래처 메뉴 등록에 실패했습니다.' })
    } finally {
      setIsSaving(false)
    }
  }

  return {
    selectedAccountId, setSelectedAccountId, selectedAccountName, accountOptions,
    menuItems, menuError, isMenuLoading, registeredIds, isRegisteredLoading,
    mealCategory, setMealCategory, menuType, setMenuType, menuGubun, setMenuGubun, keyword, setKeyword, hideRegistered, setHideRegistered, likedOnly, setLikedOnly,
    filteredItems, pagedItems, currentPage, setCurrentPage, totalPages,
    selectedIds, setSelectedIds, selectedMenus, toggleSelect, togglePage, isPageChecked, isPageIndeterminate, selectableOnPage,
    previewMenuId, setPreviewMenuId, previewMenu, previewDetails, detailError, isDetailLoading,
    isSaving, register, alert, setAlert,
  }
}
