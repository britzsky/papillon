import { workspaceAccountId } from '../workspace/workspaceAccount'
import { useAccountMenuCache } from '../../pages/operations/useAccountMenuCache'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { type AppAlertState } from '../../components/AppAlert'
import { type RecipeActionMenuState } from '../../components/RecipeActionMenu'
import { type RecipeViewMode } from '../../components/RecipeViewModal'
import { type RecipeRequest } from '../../api/recipe'
import { getAccountOptions, getAccountMenuManagerList, getIngredientOptions, getLikeIngredientOptions, getLikeMenuManagerList, getMenuDetailList, getAccountMenuDetailList, getMenuManagerList, saveLikeMenu, saveLikeIngredient, saveAccountMenuManager, type AccountOption, type IngredientOption, type MenuManagerItem } from '../../api/operations'
import { MENU_PAGE_SIZE, toBaseQuantity, buildAccountMenuSavePayload, buildDetailSnapshotMap, buildMenuSnapshotMap, createEmptyIngredientItem, formatQtyRaw, getReviewFlag, matchesMenuFilters, parseNumber, qtyUnitOptions, recalculateQuantities, toEditableDetailItem, type EditableMenuIngredientItem } from '../../pages/operations/menuManagerShared'

/** 거래처 상품 기준 식자재 1인분 예상 원가(없으면 null) */
export function accountIngredientCost(item: EditableMenuIngredientItem): number | null {
  const qty = toBaseQuantity(item.qty_num ?? item.required_qty, item.qty_unit ?? '', item.cost_base_unit ?? '')
  if (!item.supplier_product_id || !item.ingredient_id || !Number.isFinite(qty) || qty <= 0
      || !(item.cost_unit_cost != null && item.cost_unit_cost > 0) || (item.review_flag && item.review_flag !== '0')) return null
  return qty * item.cost_unit_cost
}

/** 레시피 행 → 편집 행(비어 있는 이름·단위 등은 본사 식자재 목록에서 채움). 거래처 메뉴 관리·본사 메뉴 가져오기 공용 */
export function toAccountDetailItems(items: Awaited<ReturnType<typeof getMenuDetailList>>, ingredientOptions: IngredientOption[]): EditableMenuIngredientItem[] {
  return items.map((detail) => {
    const matchedOption = ingredientOptions.find((option) => option.ingredient_id === detail.ingredient_id)
    return toEditableDetailItem({
      ...detail,
      category_name: detail.category_name || matchedOption?.category_name || '',
      ingredient_name: detail.ingredient_name || matchedOption?.ingredient_name || '',
      ingredient_name_raw: detail.ingredient_name_raw || detail.ingredient_name || matchedOption?.ingredient_name || '',
      ingredient_name_std: detail.ingredient_name_std || matchedOption?.ingredient_name_std || detail.ingredient_name || matchedOption?.ingredient_name || '',
      base_unit: detail.base_unit || matchedOption?.base_unit || '',
      convert_value: detail.convert_value || matchedOption?.convert_value || 1,
      storage_type: detail.storage_type || matchedOption?.storage_type || '',
      menu_usage_count: detail.menu_usage_count ?? matchedOption?.menu_usage_count ?? 0,
      needs_review: detail.needs_review ?? matchedOption?.needs_review ?? 0,
      note: detail.note ?? matchedOption?.note ?? '',
      safe_stock_qty: detail.safe_stock_qty ?? matchedOption?.safe_stock_qty ?? 0,
      like: detail.like ?? matchedOption?.like ?? 'N',
      supplier_product_id: detail.supplier_product_id,
      supplier_id: detail.supplier_id,
      supplier_name: detail.supplier_name || '',
      supplier_item_code: detail.supplier_item_code || '',
      product_name: detail.product_name || '',
      order_unit: detail.order_unit || matchedOption?.order_unit || matchedOption?.base_unit || '',
      package_qty: detail.package_qty,
      package_unit: detail.package_unit || '',
      base_qty: detail.base_qty,
    })
  })
}

/**
 * 거래처 메뉴 관리(PC·터치 공용): 거래처 선택, 본사 메뉴 중 거래처에 쓸 메뉴 담기·빼기, 거래처별 메뉴 레시피 식자재·예상 원가,
 * 즐겨찾기(메뉴·식자재), 공급상품 새로고침, 바뀐 것만 저장, AI 레시피 보기·등록 상태.
 */
export function useAccountMenuManager() {
  const [searchParams] = useSearchParams()
  const initialSearchType = searchParams.get('type')
  const initialSearchId = searchParams.get('account_id') ?? searchParams.get('id') ?? ''
  const initialKeywordFilter = initialSearchType === 'vendor' ? '' : searchParams.get('q') ?? ''
  const initialAccountId = workspaceAccountId(searchParams)
  const [selectedMealCategory, setSelectedMealCategory] = useState('')
  const [keywordFilter, setKeywordFilter] = useState(initialKeywordFilter)
  const [selectedMenuType, setSelectedMenuType] = useState('')
  const [selectedMenuGubun, setSelectedMenuGubun] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId)
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [accountError, setAccountError] = useState('')
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([])
  const [ingredientError, setIngredientError] = useState('')
  const [menuItems, setMenuItems] = useState<MenuManagerItem[]>([])
  const [originalMenusById, setOriginalMenusById] = useState<Record<string, MenuManagerItem>>({})
  const [menuError, setMenuError] = useState('')
  const [isMenuLoading, setIsMenuLoading] = useState(true)
  const [favoriteMenuItems, setFavoriteMenuItems] = useState<MenuManagerItem[]>([])
  const [isFavoriteMenuModalOpen, setIsFavoriteMenuModalOpen] = useState(false)
  const [isFavoriteMenuLoading, setIsFavoriteMenuLoading] = useState(false)
  const [favoriteIngredientItems, setFavoriteIngredientItems] = useState<IngredientOption[]>([])
  const [isFavoriteIngredientModalOpen, setIsFavoriteIngredientModalOpen] = useState(false)
  const [isFavoriteIngredientLoading, setIsFavoriteIngredientLoading] = useState(false)
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null)
  const [selectedAvailableMenuIds, setSelectedAvailableMenuIds] = useState<string[]>([])
  const [detailItemsByMenuId, setDetailItemsByMenuId] = useAccountMenuCache<EditableMenuIngredientItem[]>(selectedAccountId)
  const [originalDetailsByMenuId, setOriginalDetailsByMenuId] = useAccountMenuCache<Record<string, EditableMenuIngredientItem>>(selectedAccountId)
  const [detailLoadedByMenuId, setDetailLoadedByMenuId] = useAccountMenuCache<boolean>(selectedAccountId)
  const [detailError, setDetailError] = useState('')
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [assignedMenuIdsByAccount, setAssignedMenuIdsByAccount] = useState<Record<string, string[]>>({})
  const [originalAssignedMenuIdsByAccount, setOriginalAssignedMenuIdsByAccount] = useState<Record<string, string[]>>({})
  const [assignedMenuEditsByAccount, setAssignedMenuEditsByAccount] = useState<
    Record<string, Record<string, Partial<Pick<MenuManagerItem, 'menu_type' | 'menu_gubun' | 'meal_plan_type' | 'calories_per_serving'>>>>
  >({})
  const [originalAssignedMenuItemsByAccount, setOriginalAssignedMenuItemsByAccount] = useState<
    Record<string, Record<string, MenuManagerItem>>
  >({})
  const [accountMenuError, setAccountMenuError] = useState('')
  const [isAccountMenuLoading, setIsAccountMenuLoading] = useState(false)
  const [alert, setAlert] = useState<AppAlertState | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isDragActive, setIsDragActive] = useState(false)
  const [likeTargetMenuId, setLikeTargetMenuId] = useState<string | null>(null)
  const [likeTargetIngredientId, setLikeTargetIngredientId] = useState<string | null>(null)
  const [isSavingLike, setIsSavingLike] = useState(false)
  const [recipeMenuState, setRecipeMenuState] = useState<RecipeActionMenuState | null>(null)
  const [recipeViewRequest, setRecipeViewRequest] = useState<RecipeRequest | null>(null)
  const [recipeViewMode, setRecipeViewMode] = useState<RecipeViewMode>('ai')
  const [recipeRegisterRequest, setRecipeRegisterRequest] = useState<RecipeRequest | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadAccounts = async () => {
      try {
        setAccountError('')
        const accounts = await getAccountOptions()
        if (!isMounted) return
        setAccountOptions(accounts)
      } catch (error) {
        if (!isMounted) return
        setAccountOptions([])
        setAccountError(error instanceof Error ? error.message : '거래처 목록을 불러오지 못했습니다.')
      }
    }

    void loadAccounts()
    return () => {
      isMounted = false
    }
  }, [])

  const handleOpenFavoriteMenuModal = async () => {
    try {
      setIsFavoriteMenuModalOpen(true)
      setIsFavoriteMenuLoading(true)
      setAlert(null)
      const items = await getLikeMenuManagerList()
      setFavoriteMenuItems(items)
    } catch (error) {
      const message = error instanceof Error ? error.message : '메뉴 목록을 불러오지 못했습니다.'
      setAlert({ type: 'error', title: '조회 실패', message })
    } finally {
      setIsFavoriteMenuLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    const loadMenus = async () => {
      try {
        setIsMenuLoading(true)
        setMenuError('')
        const items = await getMenuManagerList()
        if (!isMounted) return
        setMenuItems(items)
        setOriginalMenusById(buildMenuSnapshotMap(items))
      } catch (error) {
        if (!isMounted) return
        setMenuItems([])
        setOriginalMenusById({})
        setMenuError(error instanceof Error ? error.message : '메뉴 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) setIsMenuLoading(false)
      }
    }

    void loadMenus()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadAccountMenus = async () => {
      if (!selectedAccountId) {
        setAccountMenuError('')
        setIsAccountMenuLoading(false)
        setIsDragActive(false)
        return
      }

      try {
        setIsAccountMenuLoading(true)
        setAccountMenuError('')
        setAlert(null)
        const items = await getAccountMenuManagerList(selectedAccountId)
        if (!isMounted) return

        const nextAssignedMenuIds = items
          .map((item) => item.menu_id)
          .filter((menuId, index, menuIds) => menuId !== '' && menuIds.indexOf(menuId) === index)

        setMenuItems((current) => {
          const mergedItems = new Map(current.map((item) => [item.menu_id, item]))
          items.forEach((item) => {
            if (item.menu_id) {
              mergedItems.set(item.menu_id, { ...mergedItems.get(item.menu_id), ...item })
            }
          })
          const nextItems = Array.from(mergedItems.values())
          setOriginalMenusById(buildMenuSnapshotMap(nextItems))
          return nextItems
        })
        setAssignedMenuIdsByAccount((current) => ({
          ...current,
          [selectedAccountId]: nextAssignedMenuIds,
        }))
        setOriginalAssignedMenuIdsByAccount((current) => ({
          ...current,
          [selectedAccountId]: nextAssignedMenuIds,
        }))
        setAssignedMenuEditsByAccount((current) => ({
          ...current,
          [selectedAccountId]: {},
        }))
        setOriginalAssignedMenuItemsByAccount((current) => ({
          ...current,
          [selectedAccountId]: buildMenuSnapshotMap(items),
        }))
      } catch (error) {
        if (!isMounted) return
        setAssignedMenuIdsByAccount((current) => ({
          ...current,
          [selectedAccountId]: [],
        }))
        setOriginalAssignedMenuIdsByAccount((current) => ({
          ...current,
          [selectedAccountId]: [],
        }))
        setAssignedMenuEditsByAccount((current) => ({
          ...current,
          [selectedAccountId]: {},
        }))
        setOriginalAssignedMenuItemsByAccount((current) => ({
          ...current,
          [selectedAccountId]: {},
        }))
        setAccountMenuError(error instanceof Error ? error.message : 'Failed to load account menu list.')
      } finally {
        if (isMounted) setIsAccountMenuLoading(false)
      }
    }

    void loadAccountMenus()
    return () => {
      isMounted = false
    }
  }, [selectedAccountId])

  useEffect(() => {
    let isMounted = true

    const loadIngredients = async () => {
      try {
        setIngredientError('')
        const items = await getIngredientOptions()
        if (!isMounted) return
        setIngredientOptions(items)
      } catch (error) {
        if (!isMounted) return
        setIngredientOptions([])
        setIngredientError(error instanceof Error ? error.message : '식자재 목록을 불러오지 못했습니다.')
      }
    }

    void loadIngredients()
    return () => {
      isMounted = false
    }
  }, [])




  const filteredMenuItems = useMemo(
    () =>
      menuItems.filter((item) =>
        matchesMenuFilters(item, {
          mealCategory: selectedMealCategory,
          keyword: keywordFilter,
          menuType: selectedMenuType,
          menuGubun: selectedMenuGubun,
        }),
      ),
    [keywordFilter, menuItems, selectedMealCategory, selectedMenuGubun, selectedMenuType],
  )

  const assignedMenuIds = useMemo(
    () => (selectedAccountId ? assignedMenuIdsByAccount[selectedAccountId] ?? [] : []),
    [assignedMenuIdsByAccount, selectedAccountId],
  )
  
  const originalAssignedMenuIds = useMemo(
    () => (selectedAccountId ? originalAssignedMenuIdsByAccount[selectedAccountId] ?? [] : []),
    [originalAssignedMenuIdsByAccount, selectedAccountId],
  )
  
  const assignedMenuEdits = useMemo(
    () => (selectedAccountId ? assignedMenuEditsByAccount[selectedAccountId] ?? {} : {}),
    [assignedMenuEditsByAccount, selectedAccountId],
  )
  
  const originalAssignedMenusById = useMemo(
    () => (selectedAccountId ? originalAssignedMenuItemsByAccount[selectedAccountId] ?? {} : {}),
    [originalAssignedMenuItemsByAccount, selectedAccountId],
  )

  const assignedMenus = useMemo(
    () =>
      assignedMenuIds
        .map((menuId) => {
          const baseItem = menuItems.find((item) => item.menu_id === menuId)
          return baseItem ? { ...baseItem, ...assignedMenuEdits[menuId] } : undefined
        })
        .filter((item): item is MenuManagerItem => item !== undefined),
    [assignedMenuEdits, assignedMenuIds, menuItems],
  )

  const removedAssignedMenus = useMemo(
    () =>
      originalAssignedMenuIds
        .filter((menuId) => !assignedMenuIds.includes(menuId))
        .map(
          (menuId) =>
            menuItems.find((item) => item.menu_id === menuId) ??
            ({
              menu_id: menuId,
              menu_name: menuId,
              meal_category: '',
              menu_type: '',
              menu_gubun: '',
              account_id: '',
              account_name: '',
            } as MenuManagerItem),
        ),
    [assignedMenuIds, menuItems, originalAssignedMenuIds],
  )

  const selectedAccountName = useMemo(
    () => accountOptions.find((item) => item.value === selectedAccountId)?.text ?? '',
    [accountOptions, selectedAccountId],
  )

  const ingredientCategoryOptions = useMemo(
    () => Array.from(new Set(ingredientOptions.map((item) => item.category_name).filter(Boolean))).sort(),
    [ingredientOptions],
  )

  const totalMenuPages = Math.max(1, Math.ceil(filteredMenuItems.length / MENU_PAGE_SIZE))

  const pagedMenuItems = useMemo(() => {
    const startIndex = (currentPage - 1) * MENU_PAGE_SIZE
    return filteredMenuItems.slice(startIndex, startIndex + MENU_PAGE_SIZE)
  }, [currentPage, filteredMenuItems])

  const selectedAvailableAssignableMenuIds = useMemo(
    () => selectedAvailableMenuIds.filter((menuId) => filteredMenuItems.some((item) => item.menu_id === menuId) && !assignedMenuIds.includes(menuId)),
    [assignedMenuIds, filteredMenuItems, selectedAvailableMenuIds],
  )

  const pageSelectableMenuIds = useMemo(
    () => pagedMenuItems.filter((item) => !assignedMenuIds.includes(item.menu_id)).map((item) => item.menu_id),
    [assignedMenuIds, pagedMenuItems],
  )

  const isPageSelectionChecked =
    pageSelectableMenuIds.length > 0 && pageSelectableMenuIds.every((menuId) => selectedAvailableMenuIds.includes(menuId))
  const isPageSelectionIndeterminate =
    !isPageSelectionChecked && pageSelectableMenuIds.some((menuId) => selectedAvailableMenuIds.includes(menuId))

  useEffect(() => {
    setCurrentPage(1)
  }, [keywordFilter, selectedMealCategory, selectedMenuGubun, selectedMenuType])

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalMenuPages))
  }, [totalMenuPages])

  useEffect(() => {
    if (!selectedAccountId) {
      setSelectedAvailableMenuIds((current) => {
        if (current.length === 0) return current
        return []
      })
      return
    }
  
    const filteredIds = new Set(filteredMenuItems.map((item) => item.menu_id))
  
    setSelectedAvailableMenuIds((current) => {
      const next = current.filter(
        (menuId) => filteredIds.has(menuId) && !assignedMenuIds.includes(menuId),
      )
  
      const isSame =
        next.length === current.length &&
        next.every((menuId, index) => menuId === current[index])
  
      return isSame ? current : next
    })
  }, [assignedMenuIds, filteredMenuItems, selectedAccountId])

  useEffect(() => {
    setSelectedMenuId((current) => {
      const assignedMenu = assignedMenus.find((item) => item.menu_id === current)
      const availableMenu = filteredMenuItems.find((item) => item.menu_id === current)
      const nextMenu = assignedMenu ?? availableMenu ?? assignedMenus[0] ?? filteredMenuItems[0] ?? null
      const nextMenuId = nextMenu?.menu_id ?? null
  
      return current === nextMenuId ? current : nextMenuId
    })
  }, [assignedMenus, filteredMenuItems])

  const activeMenu =
    assignedMenus.find((item) => item.menu_id === selectedMenuId) ??
    filteredMenuItems.find((item) => item.menu_id === selectedMenuId) ??
    null

  const likeTargetMenu = likeTargetMenuId ? menuItems.find((item) => item.menu_id === likeTargetMenuId) ?? null : null
  const likeTargetIngredient = likeTargetIngredientId
    ? Object.values(detailItemsByMenuId)
        .flat()
        .find((item) => item.ingredient_id === likeTargetIngredientId) ??
      ingredientOptions.find((item) => item.ingredient_id === likeTargetIngredientId) ??
      null
    : null
  const activeDetailItems = activeMenu ? detailItemsByMenuId[activeMenu.menu_id] ?? [] : []
  const activeMenuCost = useMemo(() => {
    let total = 0
    let missingCount = 0
    activeDetailItems.forEach((item) => {
      const cost = accountIngredientCost(item)
      if (cost == null) missingCount += 1
      else total += cost
    })
    return { total, missingCount }
  }, [activeDetailItems])

  const toAccountEditableDetailItems = (items: Awaited<ReturnType<typeof getMenuDetailList>>) => toAccountDetailItems(items, ingredientOptions)

  useEffect(() => {
    let isMounted = true

    const loadDetails = async () => {
      if (isAccountMenuLoading) return
      if (!activeMenu?.menu_id) {
        setDetailError('')
        setIsDetailLoading(false)
        return
      }

      if (detailLoadedByMenuId[activeMenu.menu_id]) {
        setDetailError('')
        return
      }

      try {
        setIsDetailLoading(true)
        setDetailError('')
        const isExistingAccountMenu = originalAssignedMenuIds.includes(activeMenu.menu_id)
        const accountItems = isExistingAccountMenu
          ? await getAccountMenuDetailList(activeMenu.menu_id, selectedAccountId)
          : []
        const items = isExistingAccountMenu ? accountItems : await getMenuDetailList(activeMenu.menu_id)
        if (!isMounted) return

        const editableItems = toAccountEditableDetailItems(items)

        setDetailItemsByMenuId((current) => ({ ...current, [activeMenu.menu_id]: editableItems }))
        setOriginalDetailsByMenuId((current) => ({
          ...current,
          [activeMenu.menu_id]: buildDetailSnapshotMap(editableItems),
        }))
        setDetailLoadedByMenuId((current) => ({ ...current, [activeMenu.menu_id]: true }))
      } catch (error) {
        if (!isMounted) return
        setDetailItemsByMenuId((current) => ({ ...current, [activeMenu.menu_id]: current[activeMenu.menu_id] ?? [] }))
        setDetailLoadedByMenuId((current) => ({ ...current, [activeMenu.menu_id]: true }))
        setDetailError(error instanceof Error ? error.message : '식자재 상세 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) setIsDetailLoading(false)
      }
    }

    void loadDetails()
    return () => {
      isMounted = false
    }
  }, [activeMenu?.menu_id, isAccountMenuLoading, detailLoadedByMenuId, ingredientOptions, originalAssignedMenuIds, selectedAccountId, setDetailItemsByMenuId, setDetailLoadedByMenuId, setOriginalDetailsByMenuId])

  const handleAssignMenus = (menuIds: string[]) => {
    if (!selectedAccountId) return

    const nextMenuIds = menuIds.filter((menuId, index) => menuId && menuIds.indexOf(menuId) === index)
    if (nextMenuIds.length === 0) return

    setAssignedMenuIdsByAccount((current) => {
      const currentIds = current[selectedAccountId] ?? []
      const appendMenuIds = nextMenuIds.filter((menuId) => !currentIds.includes(menuId))
      if (appendMenuIds.length === 0) return current

      return {
        ...current,
        [selectedAccountId]: [...currentIds, ...appendMenuIds],
      }
    })

    setSelectedMenuId(nextMenuIds[nextMenuIds.length - 1] ?? null)
    setSelectedAvailableMenuIds((current) => current.filter((menuId) => !nextMenuIds.includes(menuId)))
    setIsDragActive(false)
  }

  const handleAssignMenu = (menuId: string) => {
    handleAssignMenus([menuId])
  }

  const handleAssignSelectedMenus = () => {
    handleAssignMenus(selectedAvailableAssignableMenuIds)
  }

  const handleToggleAvailableMenu = (menuId: string) => {
    if (!selectedAccountId || assignedMenuIds.includes(menuId)) return

    setSelectedAvailableMenuIds((current) =>
      current.includes(menuId) ? current.filter((id) => id !== menuId) : [...current, menuId],
    )
  }

  const handleTogglePageSelection = () => {
    if (!selectedAccountId || pageSelectableMenuIds.length === 0) return

    setSelectedAvailableMenuIds((current) => {
      if (pageSelectableMenuIds.every((menuId) => current.includes(menuId))) {
        return current.filter((menuId) => !pageSelectableMenuIds.includes(menuId))
      }

      return Array.from(new Set([...current, ...pageSelectableMenuIds]))
    })
  }

  const handleRemoveAssignedMenu = (menuId: string) => {
    if (!selectedAccountId) return

    setAssignedMenuIdsByAccount((current) => ({
      ...current,
      [selectedAccountId]: (current[selectedAccountId] ?? []).filter((id) => id !== menuId),
    }))

    setSelectedMenuId((current) => (current === menuId ? null : current))
  }

  const handleAssignedMenuChange = (
    menuId: string,
    field: keyof Pick<MenuManagerItem, 'menu_type' | 'menu_gubun' | 'meal_plan_type' | 'calories_per_serving'>,
    value: string | number,
  ) => {
    if (!selectedAccountId) return

    setAssignedMenuEditsByAccount((current) => ({
      ...current,
      [selectedAccountId]: {
        ...(current[selectedAccountId] ?? {}),
        [menuId]: {
          ...(current[selectedAccountId]?.[menuId] ?? {}),
          [field]: value,
        },
      },
    }))
  }

  const handleRestoreRemovedMenu = (menuId: string) => {
    if (!selectedAccountId) return

    setAssignedMenuIdsByAccount((current) => {
      const currentIds = current[selectedAccountId] ?? []
      if (currentIds.includes(menuId)) return current

      return {
        ...current,
        [selectedAccountId]: [...currentIds, menuId],
      }
    })

    setSelectedMenuId(menuId)
  }

  const handleLikeMenu = async () => {
    if (!likeTargetMenu) return

    const nextLike = likeTargetMenu.like === 'Y' ? 'N' : 'Y'
    setIsSavingLike(true)
    try {
      await saveLikeMenu(likeTargetMenu.menu_id, nextLike)
      setMenuItems((current) => current.map((item) => (item.menu_id === likeTargetMenu.menu_id ? { ...item, like: nextLike } : item)))
      setLikeTargetMenuId(null)
    } catch (error) {
      setAlert({
        type: 'error',
        title: '저장 실패',
        message: error instanceof Error ? error.message : '나만의 메뉴 저장에 실패했습니다.',
      })
    } finally {
      setIsSavingLike(false)
    }
  }

  const handleOpenFavoriteIngredientModal = async () => {
    try {
      setIsFavoriteIngredientModalOpen(true)
      setIsFavoriteIngredientLoading(true)
      setAlert(null)
      const items = await getLikeIngredientOptions()
      setFavoriteIngredientItems(items)
    } catch (error) {
      const message = error instanceof Error ? error.message : '식자재 목록을 불러오지 못했습니다.'
      setAlert({ type: 'error', title: '조회 실패', message })
    } finally {
      setIsFavoriteIngredientLoading(false)
    }
  }

  const handleSelectFavoriteMenu = (item: MenuManagerItem) => {
    setMenuItems((current) => {
      if (current.some((menu) => menu.menu_id === item.menu_id)) return current
      return [...current, item]
    })
    setOriginalMenusById((current) => (current[item.menu_id] ? current : { ...current, [item.menu_id]: item }))
    setSelectedMenuId(item.menu_id)
    setIsFavoriteMenuModalOpen(false)
  }

  const handleSelectFavoriteIngredient = (item: IngredientOption) => {
    setIngredientOptions((current) => {
      if (current.some((ingredient) => ingredient.ingredient_id === item.ingredient_id)) return current
      return [...current, item].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name))
    })
    setIsFavoriteIngredientModalOpen(false)
  }

  const handleLikeIngredient = async () => {
    if (!likeTargetIngredient) return

    const nextLike = likeTargetIngredient.like === 'Y' ? 'N' : 'Y'
    setIsSavingLike(true)
    try {
      await saveLikeIngredient(likeTargetIngredient.ingredient_id, nextLike)
      setIngredientOptions((current) =>
        current.map((item) => (item.ingredient_id === likeTargetIngredient.ingredient_id ? { ...item, like: nextLike } : item)),
      )
      setDetailItemsByMenuId((current) =>
        Object.fromEntries(
          Object.entries(current).map(([menuId, items]) => [
            menuId,
            items.map((item) =>
              item.ingredient_id === likeTargetIngredient.ingredient_id ? { ...item, like: nextLike } : item,
            ),
          ]),
        ),
      )
      setLikeTargetIngredientId(null)
    } catch (error) {
      setAlert({
        type: 'error',
        title: '저장 실패',
        message: error instanceof Error ? error.message : '나만의 식자재 저장에 실패했습니다.',
      })
    } finally {
      setIsSavingLike(false)
    }
  }

  const handleDragStart = (event: DragEvent<HTMLElement>, menuId: string) => {
    if (!selectedAccountId) return
    const dragMenuIds = selectedAvailableAssignableMenuIds.includes(menuId) ? selectedAvailableAssignableMenuIds : [menuId]
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/menu-id', menuId)
    event.dataTransfer.setData('application/menu-ids', JSON.stringify(dragMenuIds))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const menuIdsPayload = event.dataTransfer.getData('application/menu-ids')
    if (menuIdsPayload) {
      try {
        const menuIds = JSON.parse(menuIdsPayload)
        if (Array.isArray(menuIds)) {
          handleAssignMenus(menuIds.filter((menuId): menuId is string => typeof menuId === 'string'))
          return
        }
      } catch {
        // Fall back to the single menu id payload below.
      }
    }

    const menuId = event.dataTransfer.getData('text/menu-id')
    if (menuId) {
      handleAssignMenu(menuId)
    }
  }

  const handleAddIngredient = () => {
    if (!activeMenu) return

    setDetailItemsByMenuId((current) => ({
      ...current,
      [activeMenu.menu_id]: [...(current[activeMenu.menu_id] ?? []), createEmptyIngredientItem(activeMenu.menu_id)],
    }))
    setDetailLoadedByMenuId((current) => ({ ...current, [activeMenu.menu_id]: true }))
  }

  const handleIngredientCategoryChange = (menuId: string, rowId: string, categoryName: string) => {
    setDetailItemsByMenuId((current) => ({
      ...current,
      [menuId]: (current[menuId] ?? []).map((item) => {
        if (item.row_id !== rowId) return item

        const canKeepCurrentIngredient = ingredientOptions.some(
          (option) => option.ingredient_id === item.ingredient_id && option.category_name === categoryName,
        )

        return {
          ...item,
          category_name: categoryName,
          ingredient_id: canKeepCurrentIngredient ? item.ingredient_id : '',
          ingredient_name: canKeepCurrentIngredient ? item.ingredient_name : '',
          ingredient_name_raw: canKeepCurrentIngredient ? item.ingredient_name_raw : '',
          ingredient_name_std: canKeepCurrentIngredient ? item.ingredient_name_std : '',
        }
      }),
    }))
  }

  const handleIngredientSelect = (menuId: string, rowId: string, ingredientId: string) => {
    const matchedIngredient = ingredientOptions.find((item) => item.ingredient_id === ingredientId)

    setDetailItemsByMenuId((current) => ({
      ...current,
      [menuId]: (current[menuId] ?? []).map((item) => {
        if (item.row_id !== rowId) return item

        return {
          ...item,
          ingredient_id: ingredientId,
          ingredient_name: matchedIngredient?.ingredient_name ?? '',
          ingredient_name_raw: matchedIngredient?.ingredient_name ?? '',
          ingredient_name_std: matchedIngredient?.ingredient_name_std ?? matchedIngredient?.ingredient_name ?? '',
          category_name: matchedIngredient?.category_name ?? item.category_name,
          base_unit: matchedIngredient?.base_unit ?? item.base_unit,
          order_unit: matchedIngredient?.order_unit ?? matchedIngredient?.base_unit ?? item.order_unit,
          convert_value: matchedIngredient?.convert_value ?? item.convert_value ?? 1,
          storage_type: matchedIngredient?.storage_type ?? item.storage_type ?? '',
          qty_unit:
            item.qty_unit && qtyUnitOptions.includes(item.qty_unit as (typeof qtyUnitOptions)[number])
              ? item.qty_unit
              : matchedIngredient?.base_unit && qtyUnitOptions.includes(matchedIngredient.base_unit as (typeof qtyUnitOptions)[number])
                ? matchedIngredient.base_unit
                : item.qty_unit ?? '',
          menu_usage_count: matchedIngredient?.menu_usage_count ?? item.menu_usage_count ?? 0,
          needs_review: matchedIngredient?.needs_review ?? item.needs_review ?? 0,
          note: matchedIngredient?.note ?? item.note ?? '',
          safe_stock_qty: matchedIngredient?.safe_stock_qty ?? item.safe_stock_qty ?? 0,
          like: matchedIngredient?.like ?? item.like ?? 'N',
          cost_unit_cost: undefined, cost_base_unit: '', cost_source: '', cost_source_date: '', cost_reason: '상품 단가 재조회 필요',
          supplier_product_id: undefined,
          supplier_id: undefined,
          supplier_name: '',
          supplier_item_code: '',
          product_name: '',
          package_qty: undefined,
          package_unit: '',
          base_qty: undefined,
        }
      }),
    }))
  }

  const handleIngredientQtyChange = (menuId: string, rowId: string, value: string) => {
    const parsedValue = parseNumber(value)

    setDetailItemsByMenuId((current) => ({
      ...current,
      [menuId]: (current[menuId] ?? []).map((item) => {
        if (item.row_id !== rowId) return item
        const nextItem = recalculateQuantities({ ...item, required_qty: parsedValue, qty_num: parsedValue })
        return {
          ...nextItem,
          qty_raw: formatQtyRaw(parsedValue, nextItem.qty_unit ?? ''),
          review_flag: getReviewFlag(nextItem.qty_unit ?? ''),
        }
      }),
    }))
  }

  const handleIngredientUnitChange = (menuId: string, rowId: string, value: string) => {
    setDetailItemsByMenuId((current) => ({
      ...current,
      [menuId]: (current[menuId] ?? []).map((item) =>
        item.row_id === rowId
          ? {
              ...item,
              qty_unit: value,
              qty_raw: formatQtyRaw(item.qty_num ?? item.required_qty, value),
              review_flag: getReviewFlag(value),
            }
          : item,
      ),
    }))
  }

  const [isRefreshingProducts, setIsRefreshingProducts] = useState(false)
  const refreshLinkedProducts = async () => {
    if (!activeMenu || !selectedAccountId || isRefreshingProducts) return
    const menuId = activeMenu.menu_id
    setIsRefreshingProducts(true)
    try {
      const latest = await getAccountMenuDetailList(menuId, selectedAccountId)
      const mergeProduct = (item: EditableMenuIngredientItem) => {
        const row = latest.find(candidate => candidate.ingredient_id === item.ingredient_id)
        if (!row) return item
        return { ...item, supplier_product_id: row.supplier_product_id, supplier_id: row.supplier_id,
          supplier_name: row.supplier_name, supplier_item_code: row.supplier_item_code,
          product_name: row.product_name, package_qty: row.package_qty, package_unit: row.package_unit,
          base_qty: row.base_qty, purchase_price: row.purchase_price, current_qty: row.current_qty,
          cost_unit_cost: row.cost_unit_cost, cost_base_unit: row.cost_base_unit, cost_source: row.cost_source, cost_source_date: row.cost_source_date, cost_reason: row.cost_reason, cost_per_person: row.cost_per_person }
      }
      setDetailItemsByMenuId(current => ({ ...current, [menuId]: (current[menuId] ?? []).map(mergeProduct) }))
      setOriginalDetailsByMenuId(current => ({ ...current,
        [menuId]: Object.fromEntries(Object.entries(current[menuId] ?? {}).map(([key, item]) => [key, mergeProduct(item)])) }))
    } catch (error) {
      setAlert({ type: 'error', title: '사용상품 조회 실패', message: error instanceof Error ? error.message : '사용상품을 불러오지 못했습니다.' })
    } finally { setIsRefreshingProducts(false) }
  }

  const handleSave = async () => {
    setAlert(null)

    const invalidAssignedMenu = assignedMenus.find((item) => item.menu_type === '' || item.menu_gubun === '')
    if (invalidAssignedMenu) {
      setSelectedMenuId(invalidAssignedMenu.menu_id)
      setAlert({
        type: 'error',
        title: '저장 확인',
        message: `${invalidAssignedMenu.menu_name || invalidAssignedMenu.menu_id}의 메뉴유형과 메뉴구분을 선택한 뒤 저장해주세요.`,
      })
      return
    }

    setIsSaving(true)

    try {
      const unloadedMenus = assignedMenus.filter((item) => !detailLoadedByMenuId[item.menu_id])
      let nextDetailItemsByMenuId = detailItemsByMenuId
      let nextOriginalDetailsByMenuId = originalDetailsByMenuId

      if (unloadedMenus.length > 0) {
        const loadedEntries = await Promise.all(
          unloadedMenus.map(async (menu) => {
            const items = originalAssignedMenuIds.includes(menu.menu_id)
              ? await getAccountMenuDetailList(menu.menu_id, selectedAccountId)
              : await getMenuDetailList(menu.menu_id)
            return [menu.menu_id, toAccountEditableDetailItems(items)] as const
          }),
        )

        nextDetailItemsByMenuId = {
          ...nextDetailItemsByMenuId,
          ...Object.fromEntries(loadedEntries),
        }
        nextOriginalDetailsByMenuId = {
          ...nextOriginalDetailsByMenuId,
          ...Object.fromEntries(loadedEntries.map(([menuId, items]) => [menuId, buildDetailSnapshotMap(items)])),
        }

        setDetailItemsByMenuId(nextDetailItemsByMenuId)
        setOriginalDetailsByMenuId(nextOriginalDetailsByMenuId)
        setDetailLoadedByMenuId((current) => ({
          ...current,
          ...Object.fromEntries(loadedEntries.map(([menuId]) => [menuId, true])),
        }))
      }

      const payload = buildAccountMenuSavePayload(
        selectedAccountId,
        selectedAccountName,
        selectedMealCategory,
        assignedMenus,
        menuItems,
        nextDetailItemsByMenuId,
        originalAssignedMenuIds,
        originalAssignedMenusById,
      )
      await saveAccountMenuManager(payload)
      setOriginalAssignedMenuIdsByAccount((current) => ({
        ...current,
        [selectedAccountId]: [...assignedMenuIds],
      }))
      setOriginalAssignedMenuItemsByAccount((current) => ({
        ...current,
        [selectedAccountId]: buildMenuSnapshotMap(assignedMenus),
      }))
      setOriginalDetailsByMenuId(
        Object.fromEntries(
          Object.entries(nextDetailItemsByMenuId).map(([menuId, items]) => [menuId, buildDetailSnapshotMap(items)]),
        ),
      )
      setAlert({ type: 'success', title: '저장 완료', message: '거래처 메뉴 정보가 저장되었습니다.' })
    } catch (error) {
      setAlert({
        type: 'error',
        title: '저장 실패',
        message: error instanceof Error ? error.message : '거래처 메뉴 저장에 실패했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const buildRecipeRequest = (menu: MenuManagerItem): RecipeRequest => ({
    menu_id: menu.menu_id,
    menu_name: menu.menu_name,
    account_id: selectedAccountId,
    account_name: selectedAccountName,
    source: 'account-menu-manager',
    ingredients: (detailItemsByMenuId[menu.menu_id] ?? []).map((item) => ({
      ingredient_id: item.ingredient_id,
      ingredient_name: item.ingredient_name || item.ingredient_name_raw || '',
      category_name: item.category_name,
      required_qty: item.required_qty,
      qty_num: item.qty_num,
      qty_unit: item.qty_unit,
      base_unit: item.base_unit,
    })),
  })

  return { searchParams, initialSearchType, initialSearchId, initialKeywordFilter, initialAccountId, selectedMealCategory, setSelectedMealCategory, keywordFilter, setKeywordFilter, selectedMenuType, setSelectedMenuType, selectedMenuGubun, setSelectedMenuGubun, selectedAccountId, setSelectedAccountId, accountOptions, setAccountOptions, accountError, setAccountError, ingredientOptions, setIngredientOptions, ingredientError, setIngredientError, menuItems, setMenuItems, originalMenusById, setOriginalMenusById, menuError, setMenuError, isMenuLoading, setIsMenuLoading, favoriteMenuItems, setFavoriteMenuItems, isFavoriteMenuModalOpen, setIsFavoriteMenuModalOpen, isFavoriteMenuLoading, setIsFavoriteMenuLoading, favoriteIngredientItems, setFavoriteIngredientItems, isFavoriteIngredientModalOpen, setIsFavoriteIngredientModalOpen, isFavoriteIngredientLoading, setIsFavoriteIngredientLoading, selectedMenuId, setSelectedMenuId, selectedAvailableMenuIds, setSelectedAvailableMenuIds, detailItemsByMenuId, setDetailItemsByMenuId, originalDetailsByMenuId, setOriginalDetailsByMenuId, detailLoadedByMenuId, setDetailLoadedByMenuId, detailError, setDetailError, isDetailLoading, setIsDetailLoading, assignedMenuIdsByAccount, setAssignedMenuIdsByAccount, originalAssignedMenuIdsByAccount, setOriginalAssignedMenuIdsByAccount, assignedMenuEditsByAccount, setAssignedMenuEditsByAccount, originalAssignedMenuItemsByAccount, setOriginalAssignedMenuItemsByAccount, accountMenuError, setAccountMenuError, isAccountMenuLoading, setIsAccountMenuLoading, alert, setAlert, isSaving, setIsSaving, currentPage, setCurrentPage, isDragActive, setIsDragActive, likeTargetMenuId, setLikeTargetMenuId, likeTargetIngredientId, setLikeTargetIngredientId, isSavingLike, setIsSavingLike, recipeMenuState, setRecipeMenuState, recipeViewRequest, setRecipeViewRequest, recipeViewMode, setRecipeViewMode, recipeRegisterRequest, setRecipeRegisterRequest, handleOpenFavoriteMenuModal, filteredMenuItems, assignedMenuIds, originalAssignedMenuIds, assignedMenuEdits, originalAssignedMenusById, assignedMenus, removedAssignedMenus, selectedAccountName, ingredientCategoryOptions, totalMenuPages, pagedMenuItems, selectedAvailableAssignableMenuIds, pageSelectableMenuIds, isPageSelectionChecked, isPageSelectionIndeterminate, activeMenu, likeTargetMenu, likeTargetIngredient, activeDetailItems, activeMenuCost, toAccountEditableDetailItems, handleAssignMenus, handleAssignMenu, handleAssignSelectedMenus, handleToggleAvailableMenu, handleTogglePageSelection, handleRemoveAssignedMenu, handleAssignedMenuChange, handleRestoreRemovedMenu, handleLikeMenu, handleOpenFavoriteIngredientModal, handleSelectFavoriteMenu, handleSelectFavoriteIngredient, handleLikeIngredient, handleDragStart, handleDrop, handleAddIngredient, handleIngredientCategoryChange, handleIngredientSelect, handleIngredientQtyChange, handleIngredientUnitChange, isRefreshingProducts, setIsRefreshingProducts, refreshLinkedProducts, handleSave, buildRecipeRequest }
}
