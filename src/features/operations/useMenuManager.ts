import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { type AppAlertState } from '../../components/AppAlert'
import { type RecipeActionMenuState } from '../../components/RecipeActionMenu'
import { type RecipeViewMode } from '../../components/RecipeViewModal'
import { type RecipeRequest } from '../../api/recipe'
import { getIngredientOptions, getMenuDetailList, getMenuManagerList, saveMenuManager, type IngredientOption, type MenuManagerItem } from '../../api/operations'
import { MENU_PAGE_SIZE, buildDetailSnapshotMap, buildMenuSavePayload, buildMenuSnapshotMap, createEmptyIngredientItem, createEmptyMenuItemWithNextId, matchesMenuFilters, parseNumber, qtyUnitOptions, recalculateQuantities, toEditableDetailItem, type EditableMenuIngredientItem } from '../../pages/operations/menuManagerShared'

/**
 * 본사 메뉴 관리(PC 표 편집·터치 카드 편집 공용): 메뉴 목록·필터, 메뉴별 레시피 식자재(필요할 때 불러옴),
 * 메뉴·식자재 편집과 바뀐 것만 저장, 사진 바꾸기, AI 레시피 보기·등록 상태.
 */
export function useMenuManager() {
  const [searchParams] = useSearchParams()
  const initialKeywordFilter = searchParams.get('q') ?? ''
  const [selectedMealCategory, setSelectedMealCategory] = useState('')
  const [keywordFilter, setKeywordFilter] = useState(initialKeywordFilter)
  const [selectedMenuType, setSelectedMenuType] = useState('')
  const [selectedMenuGubun, setSelectedMenuGubun] = useState('')
  const [selectedMealPlanType, setSelectedMealPlanType] = useState('')
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([])
  const [ingredientError, setIngredientError] = useState('')
  const [menuItems, setMenuItems] = useState<MenuManagerItem[]>([])
  const [originalMenusById, setOriginalMenusById] = useState<Record<string, MenuManagerItem>>({})
  const [menuError, setMenuError] = useState('')
  const [isMenuLoading, setIsMenuLoading] = useState(true)
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(() => searchParams.get('type') === 'menu' ? searchParams.get('id') : null)
  const [detailItemsByMenuId, setDetailItemsByMenuId] = useState<Record<string, EditableMenuIngredientItem[]>>({})
  const [originalDetailsByMenuId, setOriginalDetailsByMenuId] = useState<
    Record<string, Record<string, EditableMenuIngredientItem>>
  >({})
  const [detailLoadedByMenuId, setDetailLoadedByMenuId] = useState<Record<string, boolean>>({})
  const [detailError, setDetailError] = useState('')
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [alert, setAlert] = useState<AppAlertState | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [imageEditorMenuId, setImageEditorMenuId] = useState<string | null>(null)
  const [recipeMenuState, setRecipeMenuState] = useState<RecipeActionMenuState | null>(null)
  const [recipeViewRequest, setRecipeViewRequest] = useState<RecipeRequest | null>(null)
  const [recipeViewMode, setRecipeViewMode] = useState<RecipeViewMode>('ai')
  const [recipeRegisterRequest, setRecipeRegisterRequest] = useState<RecipeRequest | null>(null)

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
          mealPlanType: selectedMealPlanType,
        }),
      ),
    [keywordFilter, menuItems, selectedMealCategory, selectedMealPlanType, selectedMenuGubun, selectedMenuType],
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

  useEffect(() => {
    setCurrentPage(1)
  }, [keywordFilter, selectedMealCategory, selectedMealPlanType, selectedMenuGubun, selectedMenuType])

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalMenuPages))
  }, [totalMenuPages])

  useEffect(() => {
    const nextMenu = filteredMenuItems.find((item) => item.menu_id === selectedMenuId) ?? filteredMenuItems[0] ?? null
    setSelectedMenuId(nextMenu?.menu_id ?? null)
  }, [filteredMenuItems, selectedMenuId])

  const activeMenu = filteredMenuItems.find((item) => item.menu_id === selectedMenuId) ?? null
  const imageEditorMenu = imageEditorMenuId ? menuItems.find((item) => item.menu_id === imageEditorMenuId) ?? null : null
  const activeDetailItems = activeMenu ? detailItemsByMenuId[activeMenu.menu_id] ?? [] : []

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
        const items = await getMenuDetailList(activeMenu.menu_id)
        if (!isMounted) return

        const editableItems = items.map((detail) => {
          const matchedOption = ingredientOptions.find((option) => option.ingredient_id === detail.ingredient_id)

          return toEditableDetailItem({
            ...detail,
            category_name: detail.category_name || matchedOption?.category_name || '',
            ingredient_name: detail.ingredient_name || matchedOption?.ingredient_name || '',
            base_unit: detail.base_unit || matchedOption?.base_unit || '',
            menu_usage_count: detail.menu_usage_count ?? matchedOption?.menu_usage_count ?? 0,
            like: detail.like ?? matchedOption?.like ?? 'N',
          })
        })

        setDetailItemsByMenuId((current) => ({ ...current, [activeMenu.menu_id]: editableItems }))
        setOriginalDetailsByMenuId((current) => ({ ...current, [activeMenu.menu_id]: buildDetailSnapshotMap(editableItems) }))
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

  const handleAddRow = () => {
    const newItem = createEmptyMenuItemWithNextId(menuItems, selectedMealCategory)
    setMenuItems((current) => [newItem, ...current])
    setSelectedMenuId(newItem.menu_id)
    setImageEditorMenuId(newItem.menu_id)
    setCurrentPage(1)
  }

  const handleMenuChange = (
    menuId: string,
    field: keyof Pick<MenuManagerItem, 'menu_name' | 'meal_category' | 'menu_type' | 'menu_gubun' | 'menu_img'>,
    value: string,
  ) => {
    setMenuItems((current) => current.map((item) => (item.menu_id === menuId ? { ...item, [field]: value } : item)))
  }

  const handleMenuNumberChange = (
    menuId: string,
    field: 'meal_plan_type' | 'calories_per_serving',
    value: string,
  ) => {
    const parsed = Number(value)
    setMenuItems((current) =>
      current.map((item) => (item.menu_id === menuId ? { ...item, [field]: Number.isFinite(parsed) ? parsed : 0 } : item)),
    )
  }

  const handleMenuImageFileChange = (menuId: string, file: File | null) => {
    if (!file) return

    setMenuItems((current) =>
      current.map((item) =>
        item.menu_id === menuId
          ? {
              ...item,
              menu_img: file,
              image_url: URL.createObjectURL(file),
              image_file_id: '',
            }
          : item,
      ),
    )
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
          category_name: matchedIngredient?.category_name ?? item.category_name,
          base_unit: matchedIngredient?.base_unit ?? item.base_unit,
          order_unit: matchedIngredient?.base_unit ?? item.order_unit,
          qty_unit:
            item.qty_unit && qtyUnitOptions.includes(item.qty_unit as (typeof qtyUnitOptions)[number])
              ? item.qty_unit
              : matchedIngredient?.base_unit && qtyUnitOptions.includes(matchedIngredient.base_unit as (typeof qtyUnitOptions)[number])
                ? matchedIngredient.base_unit
                : item.qty_unit ?? '',
          menu_usage_count: matchedIngredient?.menu_usage_count ?? item.menu_usage_count ?? 0,
          like: matchedIngredient?.like ?? item.like ?? 'N',
        }
      }),
    }))
  }

  const handleIngredientTextChange = (
    menuId: string,
    rowId: string,
    field: 'base_unit' | 'order_unit' | 'qty_unit',
    value: string,
  ) => {
    setDetailItemsByMenuId((current) => ({
      ...current,
      [menuId]: (current[menuId] ?? []).map((item) => (item.row_id === rowId ? { ...item, [field]: value } : item)),
    }))
  }

  const handleIngredientNumberChange = (
    menuId: string,
    rowId: string,
    field: 'required_qty' | 'current_qty' | 'shortage_qty' | 'order_needed_qty' | 'convert_value' | 'menu_usage_count',
    value: string,
  ) => {
    setDetailItemsByMenuId((current) => ({
      ...current,
      [menuId]: (current[menuId] ?? []).map((item) => {
        if (item.row_id !== rowId) return item
        const nextItem = { ...item, [field]: parseNumber(value) }
        return field === 'required_qty' || field === 'current_qty' ? recalculateQuantities(nextItem) : nextItem
      }),
    }))
  }

  const handleSave = async () => {
    const payload = buildMenuSavePayload(menuItems, detailItemsByMenuId, originalMenusById, originalDetailsByMenuId)
    setAlert(null)
    setIsSaving(true)

    try {
      await saveMenuManager(payload)
      setOriginalMenusById(buildMenuSnapshotMap(menuItems))
      setOriginalDetailsByMenuId(
        Object.fromEntries(
          Object.entries(detailItemsByMenuId).map(([menuId, items]) => [menuId, buildDetailSnapshotMap(items)]),
        ),
      )
      setAlert({ type: 'success', title: '저장 완료', message: '메뉴 정보가 저장되었습니다.' })
    } catch (error) {
      setAlert({
        type: 'error',
        title: '저장 실패',
        message: error instanceof Error ? error.message : '메뉴 저장에 실패했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const buildRecipeRequest = (menu: MenuManagerItem): RecipeRequest => ({
    menu_id: menu.menu_id,
    menu_name: menu.menu_name,
    source: 'menu-manager',
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

  return { searchParams, initialKeywordFilter, selectedMealCategory, setSelectedMealCategory, keywordFilter, setKeywordFilter, selectedMenuType, setSelectedMenuType, selectedMenuGubun, setSelectedMenuGubun, selectedMealPlanType, setSelectedMealPlanType, ingredientOptions, setIngredientOptions, ingredientError, setIngredientError, menuItems, setMenuItems, originalMenusById, setOriginalMenusById, menuError, setMenuError, isMenuLoading, setIsMenuLoading, selectedMenuId, setSelectedMenuId, detailItemsByMenuId, setDetailItemsByMenuId, originalDetailsByMenuId, setOriginalDetailsByMenuId, detailLoadedByMenuId, setDetailLoadedByMenuId, detailError, setDetailError, isDetailLoading, setIsDetailLoading, alert, setAlert, isSaving, setIsSaving, currentPage, setCurrentPage, imageEditorMenuId, setImageEditorMenuId, recipeMenuState, setRecipeMenuState, recipeViewRequest, setRecipeViewRequest, recipeViewMode, setRecipeViewMode, recipeRegisterRequest, setRecipeRegisterRequest, filteredMenuItems, ingredientCategoryOptions, totalMenuPages, pagedMenuItems, activeMenu, imageEditorMenu, activeDetailItems, handleAddRow, handleMenuChange, handleMenuNumberChange, handleMenuImageFileChange, handleAddIngredient, handleIngredientCategoryChange, handleIngredientSelect, handleIngredientTextChange, handleIngredientNumberChange, handleSave, buildRecipeRequest }
}
