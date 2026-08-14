import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import RecipeActionMenu from '../../components/RecipeActionMenu'
import type { RecipeActionMenuState } from '../../components/RecipeActionMenu'
import RecipeRegisterModal from '../../components/RecipeRegisterModal'
import RecipeViewModal, { type RecipeViewMode } from '../../components/RecipeViewModal'
import { createAiRecipeGestureHandlers } from '../../components/aiRecipeGesture'
import FavoriteListModal from './FavoriteListModal'
import IngredientSearchSelect from './IngredientSearchSelect'
import IngredientLikeConfirmModal from './IngredientLikeConfirmModal'
import MenuLikeButton from './MenuLikeButton'
import MenuLikeConfirmModal from './MenuLikeConfirmModal'
import MenuThumbnail from './MenuThumbnail'
import {
  getAccountOptions,
  getAccountMenuManagerList,
  getIngredientOptions,
  getLikeIngredientOptions,
  getLikeMenuManagerList,
  getMenuDetailList,
  getAccountMenuDetailList,
  getMenuManagerList,
  saveLikeMenu,
  saveLikeIngredient,
  saveAccountMenuManager,
  type AccountOption,
  type IngredientOption,
  type MenuManagerItem,
} from '../../api/operations'
import type { RecipeRequest } from '../../api/recipe'
import {
  MENU_PAGE_SIZE,
  buildAccountMenuSavePayload,
  buildDetailSnapshotMap,
  buildMenuSnapshotMap,
  createEmptyIngredientItem,
  formatQtyRaw,
  getReviewFlag,
  isIngredientFieldDirty,
  isMenuFieldDirty,
  matchesMenuFilters,
  mealCategoryOptions,
  menuGubunOptions,
  mealPlanTypeOptions,
  menuTypeOptions,
  parseNumber,
  qtyUnitOptions,
  recalculateQuantities,
  toEditableDetailItem,
  type EditableMenuIngredientItem,
} from './menuManagerShared'
import './MenuManager.css'

type AccountSearchSelectProps = {
  id: string
  options: AccountOption[]
  placeholder: string
  value: string
  onChange: (accountId: string) => void
}

function AccountSearchSelect({ id, options, placeholder, value, onChange }: AccountSearchSelectProps) {
  const searchInputId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
    }
  }, [isOpen, value])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus()
    }
  }, [isOpen])

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) =>
      `${option.text} ${option.value}`.toLowerCase().includes(normalizedQuery),
    )
  }, [options, query])

  const handleSelect = (accountId: string) => {
    onChange(accountId)
    setIsOpen(false)
    setQuery('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="menu-manager-search-select" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        id={id}
        type="button"
        className="menu-manager-cell-input menu-manager-search-select__trigger menu-manager-account-select__trigger"
        aria-controls={searchInputId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selectedOption?.text || placeholder}</span>
      </button>

      {isOpen ? (
        <div className="menu-manager-search-select__dropdown menu-manager-account-select__dropdown">
          <input
            id={searchInputId}
            ref={searchInputRef}
            className="menu-manager-search-select__input"
            placeholder="검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="menu-manager-search-select__options">
            <button
              type="button"
              className={`menu-manager-search-select__option${value === '' ? ' is-selected' : ''}`}
              onClick={() => handleSelect('')}
            >
              {placeholder}
            </button>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`menu-manager-search-select__option${option.value === value ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.text || option.value}
                </button>
              ))
            ) : (
              <div className="menu-manager-search-select__empty">검색 결과 없음</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AccountMenuManager() {
  const [searchParams] = useSearchParams()
  const initialSearchType = searchParams.get('type')
  const initialSearchId = searchParams.get('account_id') ?? searchParams.get('id') ?? ''
  const initialKeywordFilter = initialSearchType === 'vendor' ? '' : searchParams.get('q') ?? ''
  const initialAccountId = initialSearchType === 'vendor' ? initialSearchId : ''
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
  const [detailItemsByMenuId, setDetailItemsByMenuId] = useState<Record<string, EditableMenuIngredientItem[]>>({})
  const [originalDetailsByMenuId, setOriginalDetailsByMenuId] = useState<
    Record<string, Record<string, EditableMenuIngredientItem>>
  >({})
  const [detailLoadedByMenuId, setDetailLoadedByMenuId] = useState<Record<string, boolean>>({})
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

  const toAccountEditableDetailItems = (items: Awaited<ReturnType<typeof getMenuDetailList>>) =>
    items.map((detail) => {
      const matchedOption = ingredientOptions.find((option) => option.ingredient_id === detail.ingredient_id)

      return toEditableDetailItem({
        ...detail,
        category_name: detail.category_name || matchedOption?.category_name || '',
        ingredient_name: detail.ingredient_name || matchedOption?.ingredient_name || '',
        ingredient_name_raw: detail.ingredient_name_raw || detail.ingredient_name || matchedOption?.ingredient_name || '',
        ingredient_name_std: detail.ingredient_name_std || matchedOption?.ingredient_name_std || detail.ingredient_name || matchedOption?.ingredient_name || '',
        base_unit: detail.base_unit || matchedOption?.base_unit || '',
        order_unit: detail.order_unit || matchedOption?.order_unit || matchedOption?.base_unit || '',
        convert_value: detail.convert_value || matchedOption?.convert_value || 1,
        storage_type: detail.storage_type || matchedOption?.storage_type || '',
        menu_usage_count: detail.menu_usage_count ?? matchedOption?.menu_usage_count ?? 0,
        needs_review: detail.needs_review ?? matchedOption?.needs_review ?? 0,
        note: detail.note ?? matchedOption?.note ?? '',
        safe_stock_qty: detail.safe_stock_qty ?? matchedOption?.safe_stock_qty ?? 0,
        like: detail.like ?? matchedOption?.like ?? 'N',
      })
    })

  useEffect(() => {
    let isMounted = true

    const loadDetails = async () => {
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
        const items = await getAccountMenuDetailList(activeMenu.menu_id)
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
  }, [activeMenu?.menu_id, detailLoadedByMenuId, ingredientOptions])

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
            const items = await getMenuDetailList(menu.menu_id)
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
        nextOriginalDetailsByMenuId,
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

  return (
    <div className="menu-manager-page">
      <main className="menu-manager-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="거래처 메뉴 관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '운영관리', to: '/operations/menu' },
                { label: '거래처 메뉴 관리' },
              ]}
            />
          }
        >
          <section className="menu-manager-filters">
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field">
                <label htmlFor="account-menu-account-id">거래처</label>
                <AccountSearchSelect
                  id="account-menu-account-id"
                  options={accountOptions}
                  placeholder="전체"
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-meal-category">식사분류</label>
                <select
                  id="account-menu-meal-category"
                  value={selectedMealCategory}
                  onChange={(event) => setSelectedMealCategory(event.target.value)}
                >
                  <option value="">전체</option>
                  {mealCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-keyword">키워드</label>
                <input
                  id="account-menu-keyword"
                  type="search"
                  value={keywordFilter}
                  placeholder="메뉴명, 키워드"
                  onChange={(event) => setKeywordFilter(event.target.value)}
                />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-type-filter">메뉴유형</label>
                <select
                  id="account-menu-type-filter"
                  value={selectedMenuType}
                  onChange={(event) => setSelectedMenuType(event.target.value)}
                >
                  <option value="">전체</option>
                  {menuTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-gubun-filter">메뉴구분</label>
                <select
                  id="account-menu-gubun-filter"
                  value={selectedMenuGubun}
                  onChange={(event) => setSelectedMenuGubun(event.target.value)}
                >
                  <option value="">전체</option>
                  {menuGubunOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="menu-manager-filters__actions">
              <button
                type="button"
                className="menu-manager-select-button"
                onClick={() => void handleOpenFavoriteMenuModal()}
                disabled={isMenuLoading || isSaving}
              >
                나만의 메뉴
              </button>
              <button type="button" className="menu-manager-select-button" onClick={() => void handleOpenFavoriteIngredientModal()} disabled={isSaving}>
                나만의 식자재
              </button>
              <button
                type="button"
                className="menu-manager-save-button"
                onClick={() => void handleSave()}
                disabled={!selectedAccountId || isSaving}
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </section>

          <section className="account-menu-manager-layout">
            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>거래처 메뉴 배치</h2>
                  <span>{selectedAccountName || '거래처를 선택하세요.'}</span>
                </div>
              </div>
              {accountError ? <div className="menu-manager-notice">{accountError}</div> : null}
              {accountMenuError ? <div className="menu-manager-notice">{accountMenuError}</div> : null}
              <div
                className={`menu-manager-dropzone${isDragActive ? ' is-drag-active' : ''}`}
                onDragOver={(event) => {
                  if (!selectedAccountId) return
                  event.preventDefault()
                  setIsDragActive(true)
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
              >
                {selectedAccountId ? '오른쪽 메뉴 리스트에서 메뉴를 드래그해 이곳에 놓으세요.' : '거래처를 선택하면 메뉴를 배치할 수 있습니다.'}
              </div>
              {removedAssignedMenus.length > 0 ? (
                <div className="account-menu-removed-list" aria-live="polite">
                  <div className="account-menu-removed-list__header">
                    <strong>저장 시 제거될 메뉴</strong>
                    <span>{removedAssignedMenus.length}건</span>
                  </div>
                  <div className="account-menu-removed-list__items">
                    {removedAssignedMenus.map((item) => (
                      <div key={item.menu_id} className="account-menu-removed-item">
                        <span>{item.menu_name || item.menu_id}</span>
                        {item.meal_category ? <small>{item.meal_category}</small> : null}
                        <button
                          type="button"
                          className="account-menu-removed-item__restore"
                          onClick={() => handleRestoreRemovedMenu(item.menu_id)}
                        >
                          되돌리기
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="menu-manager-table-scroll">
                {isAccountMenuLoading ? <LoadingScreen compact message="거래처 메뉴 목록을 불러오는 중입니다." /> : null}
                {!isAccountMenuLoading && assignedMenus.length > 0 ? (
                  <table className="menu-manager-table">
                    <thead>
                      <tr>
                        <th>메뉴명</th>
                        <th>식사분류</th>
                        <th>메뉴유형</th>
                        <th>메뉴구분</th>
                        <th>식단 유형</th>
                        <th>칼로리(kcal)</th>
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedMenus.map((item) => (
                        <tr
                          key={item.menu_id}
                          className={item.menu_id === activeMenu?.menu_id ? 'is-active' : ''}
                          onClick={() => setSelectedMenuId(item.menu_id)}
                        >
                          <td>
                            <div className="menu-manager-readonly-cell">
                              <MenuLikeButton
                                isLiked={item.like === 'Y'}
                                menuName={item.menu_name}
                                onClick={() => setLikeTargetMenuId(item.menu_id)}
                              />
                              <MenuThumbnail src={item.image_url} name={item.menu_name} />
                              <span
                                title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                {...createAiRecipeGestureHandlers(buildRecipeRequest(item), setRecipeMenuState)}
                              >
                                {item.menu_name || '-'}
                              </span>
                            </div>
                          </td>
                          <td>{item.meal_category || '-'}</td>
                          <td>
                            <select
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'menu_type') ? ' is-dirty' : ''}`}
                              value={item.menu_type}
                              onClick={(event) => event.stopPropagation()}
                              onFocus={() => setSelectedMenuId(item.menu_id)}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'menu_type', event.target.value)}
                            >
                              <option value="">선택</option>
                              {menuTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.text}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'meal_plan_type') ? ' is-dirty' : ''}`}
                              value={item.meal_plan_type ?? 0}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'meal_plan_type', Number(event.target.value))}
                            >
                              {mealPlanTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'calories_per_serving') ? ' is-dirty' : ''}`}
                              type="number" min="0" step="0.01"
                              value={item.calories_per_serving ?? 0}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'calories_per_serving', Number(event.target.value))}
                            />
                          </td>
                          <td>
                            <select
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'menu_gubun') ? ' is-dirty' : ''}`}
                              value={item.menu_gubun}
                              onClick={(event) => event.stopPropagation()}
                              onFocus={() => setSelectedMenuId(item.menu_id)}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'menu_gubun', event.target.value)}
                            >
                              <option value="">선택</option>
                              {menuGubunOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.text}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="menu-manager-select-button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleRemoveAssignedMenu(item.menu_id)
                              }}
                            >
                              제거
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="menu-manager-empty">배치된 메뉴가 없습니다.</div>
                )}
              </div>
            </section>

            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>메뉴 리스트</h2>
                  <span>{filteredMenuItems.length}건</span>
                </div>
                <div className="account-menu-bulk-actions">
                  <span className="menu-manager-drag-hint">
                    {selectedAvailableAssignableMenuIds.length > 0
                      ? `${selectedAvailableAssignableMenuIds.length}건 선택`
                      : '읽기 전용 / 드래그 가능'}
                  </span>
                  <button
                    type="button"
                    className="menu-manager-select-button"
                    disabled={!selectedAccountId || selectedAvailableAssignableMenuIds.length === 0}
                    onClick={handleAssignSelectedMenus}
                  >
                    선택 배치
                  </button>
                </div>
              </div>
              {menuError ? <div className="menu-manager-notice">{menuError}</div> : null}
              <div className="menu-manager-table-scroll">
                {isMenuLoading ? <LoadingScreen compact message="메뉴 목록을 불러오는 중입니다." /> : null}
                {!isMenuLoading ? (
                  <>
                    <table className="menu-manager-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              className="account-menu-checkbox"
                              checked={isPageSelectionChecked}
                              disabled={!selectedAccountId || pageSelectableMenuIds.length === 0}
                              aria-label="현재 페이지 메뉴 전체 선택"
                              ref={(element) => {
                                if (element) element.indeterminate = isPageSelectionIndeterminate
                              }}
                              onChange={handleTogglePageSelection}
                            />
                          </th>
                          <th>메뉴명</th>
                          <th>식사분류</th>
                          <th>메뉴유형</th>
                          <th>메뉴구분</th>
                          <th>선택</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedMenuItems.map((item) => {
                          const isAssigned = assignedMenuIds.includes(item.menu_id)
                          const isSelected = selectedAvailableMenuIds.includes(item.menu_id)

                          return (
                            <tr
                              key={item.menu_id}
                              className={item.menu_id === activeMenu?.menu_id ? 'is-active' : ''}
                              onClick={() => setSelectedMenuId(item.menu_id)}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  className="account-menu-checkbox"
                                  checked={isSelected}
                                  disabled={!selectedAccountId || isAssigned}
                                  aria-label={`${item.menu_name || item.menu_id} 선택`}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => handleToggleAvailableMenu(item.menu_id)}
                                />
                              </td>
                              <td>
                                <div className="menu-manager-readonly-cell">
                                  <span
                                    className="menu-manager-row-handle"
                                    draggable={Boolean(selectedAccountId)}
                                    onDragStart={(event) => handleDragStart(event, item.menu_id)}
                                    onClick={(event) => event.stopPropagation()}
                                    title={selectedAccountId ? '드래그해서 거래처 메뉴에 배치' : undefined}
                                  >
                                    {selectedAccountId ? '::' : '-'}
                                  </span>
                                  <MenuLikeButton
                                    isLiked={item.like === 'Y'}
                                    menuName={item.menu_name}
                                    onClick={() => setLikeTargetMenuId(item.menu_id)}
                                  />
                                  <MenuThumbnail src={item.image_url} name={item.menu_name} />
                                  <span
                                    title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                    {...createAiRecipeGestureHandlers(buildRecipeRequest(item), setRecipeMenuState)}
                                  >
                                    {item.menu_name || '-'}
                                  </span>
                                </div>
                              </td>
                              <td>{item.meal_category || '-'}</td>
                              <td>
                                <select
                                  className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'menu_type') ? ' is-dirty' : ''}`}
                                  value={item.menu_type}
                                  onClick={(event) => event.stopPropagation()}
                                  disabled
                                >
                                  <option value="">선택</option>
                                  {menuTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.text}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'menu_gubun') ? ' is-dirty' : ''}`}
                                  value={item.menu_gubun}
                                  onClick={(event) => event.stopPropagation()}
                                  disabled
                                >
                                  <option value="">선택</option>
                                  {menuGubunOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.text}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="menu-manager-select-button"
                                  disabled={!selectedAccountId || isAssigned}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleAssignMenu(item.menu_id)
                                  }}
                                >
                                  {isAssigned ? '배치됨' : '선택'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {filteredMenuItems.length > 0 ? (
                      <div className="menu-manager-pagination">
                        <span className="menu-manager-pagination__summary">
                          {Math.min((currentPage - 1) * MENU_PAGE_SIZE + 1, filteredMenuItems.length)}-
                          {Math.min(currentPage * MENU_PAGE_SIZE, filteredMenuItems.length)} / {filteredMenuItems.length}
                        </span>
                        <div className="menu-manager-pagination__actions">
                          <button type="button" className="menu-manager-pagination__button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                            처음
                          </button>
                          <button
                            type="button"
                            className="menu-manager-pagination__button"
                            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                            disabled={currentPage === 1}
                          >
                            이전
                          </button>
                          <span className="menu-manager-pagination__page">
                            {currentPage} / {totalMenuPages}
                          </span>
                          <button
                            type="button"
                            className="menu-manager-pagination__button"
                            onClick={() => setCurrentPage((page) => Math.min(totalMenuPages, page + 1))}
                            disabled={currentPage >= totalMenuPages}
                          >
                            다음
                          </button>
                          <button
                            type="button"
                            className="menu-manager-pagination__button"
                            onClick={() => setCurrentPage(totalMenuPages)}
                            disabled={currentPage >= totalMenuPages}
                          >
                            마지막
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {!isMenuLoading && filteredMenuItems.length === 0 ? <div className="menu-manager-empty">조회된 내용이 없습니다.</div> : null}
              </div>
            </section>

            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>식자재 상세</h2>
                  <span>{activeMenu ? activeMenu.menu_name || '메뉴를 선택하세요.' : '메뉴를 선택하세요.'}</span>
                </div>
                <div className="menu-manager-panel__actions">
                  <button type="button" className="menu-manager-add-button" onClick={handleAddIngredient} disabled={!activeMenu}>
                  식자재 추가
                  </button>
                </div>
              </div>
              {ingredientError ? <div className="menu-manager-notice">{ingredientError}</div> : null}
              <div className="menu-manager-table-scroll">
                {isDetailLoading ? <LoadingScreen compact message="식자재 상세 목록을 불러오는 중입니다." /> : null}
                {!isDetailLoading && detailError ? <div className="menu-manager-empty">{detailError}</div> : null}
                {!isDetailLoading && !detailError && activeMenu ? (
                  activeDetailItems.length > 0 ? (
                    <table className="menu-manager-table menu-manager-table--ingredients">
                      <thead>
                        <tr>
                          <th>카테고리</th>
                          <th>식자재 선택</th>
                          <th>필요 수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDetailItems.map((item) => {
                          const filteredIngredientOptions = ingredientOptions.filter(
                            (option) => item.category_name === '' || option.category_name === item.category_name,
                          )

                          return (
                            <tr key={item.row_id}>
                              <td>
                                <select
                                  className={`menu-manager-cell-input${isIngredientFieldDirty(item, originalDetailsByMenuId, 'category_name') ? ' is-dirty' : ''}`}
                                  value={item.category_name ?? ''}
                                  onChange={(event) =>
                                    handleIngredientCategoryChange(activeMenu.menu_id, item.row_id, event.target.value)
                                  }
                                >
                                  <option value="">카테고리 선택</option>
                                  {ingredientCategoryOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <div className="menu-manager-ingredient-cell">
                                  <MenuLikeButton
                                    isLiked={(item.like ?? ingredientOptions.find((option) => option.ingredient_id === item.ingredient_id)?.like) === 'Y'}
                                    menuName={item.ingredient_name}
                                    onClick={() => item.ingredient_id && setLikeTargetIngredientId(item.ingredient_id)}
                                  />
                                  <IngredientSearchSelect
                                  className={isIngredientFieldDirty(item, originalDetailsByMenuId, 'ingredient_id') ? 'is-dirty' : ''}
                                  options={filteredIngredientOptions}
                                  placeholder="식자재 선택"
                                  selectedName={item.ingredient_name}
                                  value={item.ingredient_id}
                                  onChange={(ingredientId) => handleIngredientSelect(activeMenu.menu_id, item.row_id, ingredientId)}
                                  />
                                </div>
                              </td>
                              <td>
                                <div className="menu-manager-qty-editor">
                                  <input
                                    className={`menu-manager-cell-input is-compact${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_num') ? ' is-dirty' : ''}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.qty_num ?? item.required_qty}
                                    onChange={(event) =>
                                      handleIngredientQtyChange(activeMenu.menu_id, item.row_id, event.target.value)
                                    }
                                  />
                                  <select
                                    className={`menu-manager-cell-input is-unit${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_unit') ? ' is-dirty' : ''}`}
                                    value={item.qty_unit ?? ''}
                                    onChange={(event) =>
                                      handleIngredientUnitChange(activeMenu.menu_id, item.row_id, event.target.value)
                                    }
                                  >
                                    <option value="">단위 선택</option>
                                    {qtyUnitOptions.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="menu-manager-empty">선택한 메뉴에 연결된 식자재가 없습니다. 상단의 식자재 추가 버튼으로 등록할 수 있습니다.</div>
                  )
                ) : null}
                {!activeMenu ? (
                  <div className="menu-manager-empty">
                    {selectedAccountId
                      ? '왼쪽 또는 가운데에서 메뉴를 선택하면 식자재 상세를 볼 수 있습니다.'
                      : '거래처를 선택하면 식자재 상세를 볼 수 있습니다.'}
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        </SideMenuLayout>
      </main>
      {likeTargetMenu ? (
        <MenuLikeConfirmModal
          isSaving={isSavingLike}
          menu={likeTargetMenu}
          onCancel={() => setLikeTargetMenuId(null)}
          onConfirm={() => void handleLikeMenu()}
        />
      ) : null}
      {likeTargetIngredient ? (
        <IngredientLikeConfirmModal
          isSaving={isSavingLike}
          ingredient={likeTargetIngredient}
          onCancel={() => setLikeTargetIngredientId(null)}
          onConfirm={() => void handleLikeIngredient()}
        />
      ) : null}
      {isFavoriteMenuModalOpen ? (
        <FavoriteListModal
          type="menu"
          title="나만의 메뉴"
          isLoading={isFavoriteMenuLoading}
          items={favoriteMenuItems}
          onClose={() => setIsFavoriteMenuModalOpen(false)}
          onSelect={handleSelectFavoriteMenu}
        />
      ) : null}
      {isFavoriteIngredientModalOpen ? (
        <FavoriteListModal
          type="ingredient"
          title="나만의 식자재"
          isLoading={isFavoriteIngredientLoading}
          items={favoriteIngredientItems}
          onClose={() => setIsFavoriteIngredientModalOpen(false)}
          onSelect={handleSelectFavoriteIngredient}
        />
      ) : null}
      <RecipeActionMenu
        state={recipeMenuState}
        onClose={() => setRecipeMenuState(null)}
        onViewAi={(request) => {
          setRecipeViewMode('ai')
          setRecipeViewRequest(request)
        }}
        onViewBasic={(request) => {
          setRecipeViewMode('basic')
          setRecipeViewRequest(request)
        }}
        onRegister={setRecipeRegisterRequest}
      />
      <RecipeViewModal
        request={recipeViewRequest}
        mode={recipeViewMode}
        onClose={() => setRecipeViewRequest(null)}
        onRegister={(request) => {
          setRecipeViewRequest(null)
          setRecipeRegisterRequest(request)
        }}
      />
      <RecipeRegisterModal request={recipeRegisterRequest} onClose={() => setRecipeRegisterRequest(null)} />
      <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </div>
  )
}

export default AccountMenuManager
