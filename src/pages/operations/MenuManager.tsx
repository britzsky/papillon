import { useEffect, useMemo, useState } from 'react'
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
import IngredientSearchSelect from './IngredientSearchSelect'
import MenuThumbnail from './MenuThumbnail'
import {
  getIngredientOptions,
  getMenuDetailList,
  getMenuManagerList,
  saveMenuManager,
  type IngredientOption,
  type MenuManagerItem,
} from '../../api/operations'
import type { RecipeRequest } from '../../api/recipe'
import {
  MENU_PAGE_SIZE,
  buildDetailSnapshotMap,
  buildMenuSavePayload,
  buildMenuSnapshotMap,
  createEmptyIngredientItem,
  createEmptyMenuItemWithNextId,
  isIngredientFieldDirty,
  isMenuFieldDirty,
  matchesMenuFilters,
  mealCategoryOptions,
  menuGubunOptions,
  menuTypeOptions,
  parseNumber,
  qtyUnitOptions,
  recalculateQuantities,
  toEditableDetailItem,
  type EditableMenuIngredientItem,
} from './menuManagerShared'
import './MenuManager.css'

function MenuManager() {
  const [searchParams] = useSearchParams()
  const initialKeywordFilter = searchParams.get('q') ?? ''
  const [selectedMealCategory, setSelectedMealCategory] = useState('')
  const [keywordFilter, setKeywordFilter] = useState(initialKeywordFilter)
  const [selectedMenuType, setSelectedMenuType] = useState('')
  const [selectedMenuGubun, setSelectedMenuGubun] = useState('')
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([])
  const [ingredientError, setIngredientError] = useState('')
  const [menuItems, setMenuItems] = useState<MenuManagerItem[]>([])
  const [originalMenusById, setOriginalMenusById] = useState<Record<string, MenuManagerItem>>({})
  const [menuError, setMenuError] = useState('')
  const [isMenuLoading, setIsMenuLoading] = useState(true)
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null)
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
        }),
      ),
    [keywordFilter, menuItems, selectedMealCategory, selectedMenuGubun, selectedMenuType],
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
  }, [keywordFilter, selectedMealCategory, selectedMenuGubun, selectedMenuType])

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

  return (
    <div className="menu-manager-page">
      <main className="menu-manager-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="메뉴 관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '운영관리', to: '/operations/menu' },
                { label: '메뉴 관리' },
              ]}
            />
          }
        >
          <section className="menu-manager-filters">
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field">
                <label htmlFor="meal-category">식사분류</label>
                <select id="meal-category" value={selectedMealCategory} onChange={(event) => setSelectedMealCategory(event.target.value)}>
                  <option value="">전체</option>
                  {mealCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="menu-keyword">키워드</label>
                <input
                  id="menu-keyword"
                  type="search"
                  value={keywordFilter}
                  placeholder="메뉴명, 키워드"
                  onChange={(event) => setKeywordFilter(event.target.value)}
                />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="menu-type-filter">메뉴유형</label>
                <select id="menu-type-filter" value={selectedMenuType} onChange={(event) => setSelectedMenuType(event.target.value)}>
                  <option value="">전체</option>
                  {menuTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="menu-gubun-filter">메뉴구분</label>
                <select id="menu-gubun-filter" value={selectedMenuGubun} onChange={(event) => setSelectedMenuGubun(event.target.value)}>
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
              <button type="button" className="menu-manager-save-button" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </section>

          <section className="menu-manager-layout">
            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>메뉴 리스트</h2>
                  <span>{filteredMenuItems.length}건</span>
                </div>
                <button type="button" className="menu-manager-add-button" onClick={handleAddRow}>
                  행 추가
                </button>
              </div>

              <div className="menu-manager-table-scroll">
                {isMenuLoading ? <LoadingScreen compact message="메뉴 목록을 불러오는 중입니다." /> : null}
                {!isMenuLoading ? (
                  <>
                    <table className="menu-manager-table">
                      <thead>
                        <tr>
                          <th>메뉴명</th>
                          <th>식사분류</th>
                          <th>메뉴유형</th>
                          <th>메뉴구분</th>
                          <th>등록일</th>
                          <th>선택</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedMenuItems.map((item) => (
                          <tr
                            key={item.menu_id}
                            className={item.menu_id === activeMenu?.menu_id ? 'is-active' : ''}
                            onClick={() => setSelectedMenuId(item.menu_id)}
                          >
                            <td>
                              <div className="menu-manager-menu-cell">
                                <button
                                  type="button"
                                  className="menu-manager-thumbnail-button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setSelectedMenuId(item.menu_id)
                                    setImageEditorMenuId(item.menu_id)
                                  }}
                                >
                                  <MenuThumbnail
                                    src={item.image_url}
                                    name={item.menu_name}
                                    isDirty={isMenuFieldDirty(item, originalMenusById, 'menu_img')}
                                  />
                                </button>
                                <input
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'menu_name') ? ' is-dirty' : ''}`}
                                value={item.menu_name}
                                placeholder="메뉴명을 입력하세요."
                                title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                {...createAiRecipeGestureHandlers(buildRecipeRequest(item), setRecipeMenuState)}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                  onChange={(event) => handleMenuChange(item.menu_id, 'menu_name', event.target.value)}
                                />
                              </div>
                            </td>
                            <td>
                              <select
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'meal_category') ? ' is-dirty' : ''}`}
                                value={item.meal_category}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                onChange={(event) => handleMenuChange(item.menu_id, 'meal_category', event.target.value)}
                              >
                                <option value="">선택</option>
                                {mealCategoryOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'menu_type') ? ' is-dirty' : ''}`}
                                value={item.menu_type}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                onChange={(event) => handleMenuChange(item.menu_id, 'menu_type', event.target.value)}
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
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                onChange={(event) => handleMenuChange(item.menu_id, 'menu_gubun', event.target.value)}
                              >
                                <option value="">선택</option>
                                {menuGubunOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.text}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>{item.created_at || '-'}</td>
                            <td>
                              <button
                                type="button"
                                className="menu-manager-select-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedMenuId(item.menu_id)
                                }}
                              >
                                {item.menu_id === activeMenu?.menu_id ? '선택됨' : '선택'}
                              </button>
                            </td>
                          </tr>
                        ))}
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
                {!isMenuLoading && menuError ? <div className="menu-manager-empty">{menuError}</div> : null}
              </div>
            </section>

            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>식자재 상세</h2>
                  <span>{activeMenu ? activeMenu.menu_name || '신규 메뉴' : '메뉴를 선택하세요.'}</span>
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
                                    className={`menu-manager-cell-input is-compact${isIngredientFieldDirty(item, originalDetailsByMenuId, 'required_qty') ? ' is-dirty' : ''}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.required_qty}
                                    onChange={(event) =>
                                      handleIngredientNumberChange(activeMenu.menu_id, item.row_id, 'required_qty', event.target.value)
                                    }
                                  />
                                  <select
                                    className={`menu-manager-cell-input is-unit${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_unit') ? ' is-dirty' : ''}`}
                                    value={item.qty_unit ?? ''}
                                    onChange={(event) =>
                                      handleIngredientTextChange(activeMenu.menu_id, item.row_id, 'qty_unit', event.target.value)
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
                    <div className="menu-manager-empty">선택한 메뉴에 연결된 식자재가 없습니다. 상단의 `식자재 추가` 버튼으로 등록할 수 있습니다.</div>
                  )
                ) : null}
                {!activeMenu ? <div className="menu-manager-empty">왼쪽 메뉴 리스트에서 메뉴를 선택하면 식자재 상세를 수정할 수 있습니다.</div> : null}
              </div>
            </section>
          </section>
        </SideMenuLayout>
      </main>
      {imageEditorMenu ? (
        <div className="menu-manager-modal-backdrop" role="presentation" onClick={() => setImageEditorMenuId(null)}>
          <section className="menu-manager-image-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="menu-manager-image-modal__header">
              <div>
                <h2>menu_img</h2>
                <span>{imageEditorMenu.menu_name || imageEditorMenu.menu_id}</span>
              </div>
              <button type="button" className="menu-manager-select-button" onClick={() => setImageEditorMenuId(null)}>
                닫기
              </button>
            </div>
            <div className="menu-manager-image-modal__body">
              <MenuThumbnail
                src={imageEditorMenu.image_url}
                name={imageEditorMenu.menu_name}
                isDirty={isMenuFieldDirty(imageEditorMenu, originalMenusById, 'menu_img')}
              />
              <label
                className={`menu-manager-file-picker${isMenuFieldDirty(imageEditorMenu, originalMenusById, 'menu_img') ? ' is-dirty' : ''}`}
              >
                <span>{imageEditorMenu.menu_img instanceof File ? imageEditorMenu.menu_img.name : '이미지 선택'}</span>
                <input
                  type="file"
                  accept="image/*"
                  autoFocus
                  onChange={(event) => handleMenuImageFileChange(imageEditorMenu.menu_id, event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </section>
        </div>
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

export default MenuManager
