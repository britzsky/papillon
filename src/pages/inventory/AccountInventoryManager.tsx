import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import { getAccountInventoryList, saveAccountInventory, type AccountInventoryItem } from '../../api/inventory'
import { getIngredientOptions, type IngredientOption } from '../../api/operations'
import IngredientSearchSelect from '../operations/IngredientSearchSelect'
import { MENU_PAGE_SIZE, parseNumber, qtyUnitOptions } from '../operations/menuManagerShared'
import '../operations/MenuManager.css'

const locationOptions = [
  { value: 'L001', text: '상온창고' },
  { value: 'L002', text: '냉장고1' },
  { value: 'L003', text: '냉동고1' },
  { value: 'L999', text: '기타/미분류' },
] as const

type EditableAccountInventoryItem = AccountInventoryItem & {
  row_id: string
}

function createInventoryRow(item: AccountInventoryItem, index: number): EditableAccountInventoryItem {
  return {
    ...item,
    row_id: `${item.menu_id ?? 'menu'}-${item.ingredient_id || 'ingredient'}-${index}`,
  }
}

function buildInventorySnapshotMap(items: EditableAccountInventoryItem[]) {
  return items.reduce<Record<string, EditableAccountInventoryItem>>((acc, item) => {
    acc[item.row_id] = { ...item }
    return acc
  }, {})
}

function applyIngredientCategories(items: EditableAccountInventoryItem[], ingredientOptions: IngredientOption[]) {
  const categoryByIngredientId = new Map(
    ingredientOptions
      .filter((option) => option.ingredient_id !== '' && option.category_name !== '')
      .map((option) => [option.ingredient_id, option.category_name]),
  )

  return items.map((item) => ({
    ...item,
    category_name: categoryByIngredientId.get(item.ingredient_id) ?? item.category_name,
  }))
}

function getLocationName(locationId?: string) {
  return locationOptions.find((option) => option.value === locationId)?.text ?? locationId ?? '-'
}

type EditableTextField = 'category_name' | 'location_id' | 'qty_unit' | 'base_unit' | 'order_unit'
type EditableIngredientField = 'ingredient_id' | 'ingredient_name'
type EditableNumberField =
  | 'required_qty'
  | 'current_qty'
  | 'safe_stock_qty'
  | 'shortage_qty'
  | 'order_needed_qty'
  | 'convert_value'
  | 'menu_usage_count'
type EditableField = EditableTextField | EditableIngredientField | EditableNumberField

function isInventoryFieldDirty(
  item: EditableAccountInventoryItem,
  originalItemsByRowId: Record<string, EditableAccountInventoryItem>,
  field: EditableField,
) {
  const original = originalItemsByRowId[item.row_id]
  return original ? item[field] !== original[field] : false
}

function getCellInputClass(
  item: EditableAccountInventoryItem,
  originalItemsByRowId: Record<string, EditableAccountInventoryItem>,
  field: EditableField,
  modifier = '',
) {
  return `menu-manager-cell-input${modifier}${isInventoryFieldDirty(item, originalItemsByRowId, field) ? ' is-dirty' : ''}`
}

function getDirtySelectClass(
  item: EditableAccountInventoryItem,
  originalItemsByRowId: Record<string, EditableAccountInventoryItem>,
  field: EditableField,
) {
  return isInventoryFieldDirty(item, originalItemsByRowId, field) ? 'is-dirty' : ''
}

function createEmptyInventoryRow(index: number): EditableAccountInventoryItem {
  return {
    row_id: `new-inventory-${Date.now()}-${index}`,
    menu_id: '',
    menu_name: '',
    ingredient_id: '',
    location_id: '',
    ingredient_name: '',
    category_name: '',
    required_qty: 0,
    qty_num: 0,
    qty_unit: '',
    current_qty: 0,
    safe_stock_qty: 0,
    shortage_qty: 0,
    order_needed_qty: 0,
    base_unit: '',
    order_unit: '',
    convert_value: 1,
    menu_usage_count: 0,
  }
}

function isInventoryItemChanged(
  item: EditableAccountInventoryItem,
  originalItemsByRowId: Record<string, EditableAccountInventoryItem>,
) {
  const original = originalItemsByRowId[item.row_id]

  if (!original) {
    return item.ingredient_id !== '' || item.ingredient_name !== ''
  }

  return ([
    'ingredient_id',
    'ingredient_name',
    'category_name',
    'location_id',
    'required_qty',
    'qty_unit',
    'current_qty',
    'safe_stock_qty',
    'shortage_qty',
    'order_needed_qty',
    'base_unit',
    'order_unit',
    'convert_value',
    'menu_usage_count',
  ] as const).some((field) => item[field] !== original[field])
}

function AccountInventoryManager() {
  const [searchParams] = useSearchParams()
  const initialKeyword = searchParams.get('q') ?? ''
  const storedAccountId = typeof window !== 'undefined' ? localStorage.getItem('account_id')?.trim() ?? '' : ''
  const targetAccountId = (searchParams.get('account_id') ?? searchParams.get('id') ?? '').trim() || storedAccountId
  const [items, setItems] = useState<EditableAccountInventoryItem[]>([])
  const [originalItemsByRowId, setOriginalItemsByRowId] = useState<Record<string, EditableAccountInventoryItem>>({})
  const [error, setError] = useState('')
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([])
  const [ingredientError, setIngredientError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [alert, setAlert] = useState<AppAlertState | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadItems = async () => {
      try {
        setIsLoading(true)
        setError('')
        if (!targetAccountId) throw new Error('로그인한 거래처 정보를 확인할 수 없습니다.')
        const nextItems = await getAccountInventoryList(targetAccountId)
        if (!isMounted) return
        const editableItems = applyIngredientCategories(nextItems.map(createInventoryRow), ingredientOptions)
        setItems(editableItems)
        setOriginalItemsByRowId(buildInventorySnapshotMap(editableItems))
      } catch (loadError) {
        if (!isMounted) return
        setItems([])
        setOriginalItemsByRowId({})
        setError(loadError instanceof Error ? loadError.message : '거래처 재고 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadItems()
    return () => {
      isMounted = false
    }
  }, [targetAccountId])

  useEffect(() => {
    let isMounted = true

    const loadIngredientOptions = async () => {
      try {
        setIngredientError('')
        const nextIngredientOptions = await getIngredientOptions()
        if (!isMounted) return
        setIngredientOptions(nextIngredientOptions)
        setItems((current) => applyIngredientCategories(current, nextIngredientOptions))
        setOriginalItemsByRowId((current) => buildInventorySnapshotMap(applyIngredientCategories(Object.values(current), nextIngredientOptions)))
      } catch (loadError) {
        if (!isMounted) return
        setIngredientOptions([])
        setIngredientError(loadError instanceof Error ? loadError.message : '식자재 목록을 불러오지 못했습니다.')
      }
    }

    void loadIngredientOptions()
    return () => {
      isMounted = false
    }
  }, [])

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) return items

    return items.filter((item) =>
      [item.menu_name, item.ingredient_name, item.category_name, item.location_id, getLocationName(item.location_id)]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedKeyword)),
    )
  }, [items, keyword])

  const locationFilteredItems = useMemo(
    () => filteredItems.filter((item) => selectedLocationId === '' || item.location_id === selectedLocationId),
    [filteredItems, selectedLocationId],
  )

  const totalPages = Math.max(1, Math.ceil(locationFilteredItems.length / MENU_PAGE_SIZE))

  const pagedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * MENU_PAGE_SIZE
    return locationFilteredItems.slice(startIndex, startIndex + MENU_PAGE_SIZE)
  }, [currentPage, locationFilteredItems])

  useEffect(() => {
    setCurrentPage(1)
  }, [keyword, selectedLocationId])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const ingredientCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set([...ingredientOptions.map((item) => item.category_name), ...items.map((item) => item.category_name ?? '')].filter(Boolean)),
      ).sort(),
    [ingredientOptions, items],
  )

  const handleTextChange = (targetItem: EditableAccountInventoryItem, field: EditableTextField, value: string) => {
    setItems((current) => current.map((item) => (item.row_id === targetItem.row_id ? { ...item, [field]: value } : item)))
  }

  const handleNumberChange = (targetItem: EditableAccountInventoryItem, field: EditableNumberField, value: string) => {
    setItems((current) => current.map((item) => (item.row_id === targetItem.row_id ? { ...item, [field]: parseNumber(value) } : item)))
  }

  const handleAddRow = () => {
    setItems((current) => [createEmptyInventoryRow(current.length + 1), ...current])
    setKeyword('')
    setSelectedLocationId('')
    setCurrentPage(1)
  }

  const handleIngredientSelect = (targetItem: EditableAccountInventoryItem, ingredientId: string) => {
    const selectedIngredient = ingredientOptions.find((option) => option.ingredient_id === ingredientId)

    setItems((current) =>
      current.map((item) =>
        item.row_id === targetItem.row_id
          ? {
              ...item,
              ingredient_id: selectedIngredient?.ingredient_id ?? '',
              ingredient_name: selectedIngredient?.ingredient_name ?? '',
              category_name: selectedIngredient?.category_name ?? item.category_name ?? '',
              base_unit: selectedIngredient?.base_unit ?? item.base_unit ?? '',
              qty_unit: item.qty_unit || selectedIngredient?.base_unit || '',
              order_unit: item.order_unit || selectedIngredient?.base_unit || '',
              menu_usage_count: selectedIngredient?.menu_usage_count ?? item.menu_usage_count ?? 0,
            }
          : item,
      ),
    )
  }

  const handleSave = async () => {
    const changedItems = items.filter((item) => isInventoryItemChanged(item, originalItemsByRowId))
    const invalidItem = changedItems.find((item) => item.ingredient_id === '')

    setAlert(null)

    if (changedItems.length === 0) {
      setAlert({ type: 'success', title: '변경 없음', message: '저장할 변경 사항이 없습니다.' })
      return
    }

    if (invalidItem) {
      setAlert({ type: 'error', title: '저장 불가', message: '식자재가 선택되지 않은 행이 있습니다.' })
      return
    }

    try {
      setIsSaving(true)
      await saveAccountInventory({
        account_id: targetAccountId,
        inventory_items: changedItems,
      })
      setOriginalItemsByRowId(buildInventorySnapshotMap(items))
      setAlert({ type: 'success', title: '저장 완료', message: '거래처 재고를 저장했습니다.' })
    } catch (saveError) {
      setAlert({
        type: 'error',
        title: '저장 실패',
        message: saveError instanceof Error ? saveError.message : '거래처 재고 저장에 실패했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="menu-manager-page">
      <main className="menu-manager-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="거래처 재고관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '재고관리', to: '/inventory/account' },
                { label: '거래처 재고관리' },
              ]}
            />
          }
        >
          <section className="menu-manager-filters">
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field">
                <label htmlFor="account-inventory-keyword">검색</label>
                <input
                  id="account-inventory-keyword"
                  className="menu-manager-cell-input"
                  value={keyword}
                  placeholder="식자재, 카테고리, 위치"
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-inventory-location">보관위치</label>
                <select
                  id="account-inventory-location"
                  value={selectedLocationId}
                  onChange={(event) => setSelectedLocationId(event.target.value)}
                >
                  <option value="">전체</option>
                  {locationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="menu-manager-filters__actions">
              <button type="button" className="menu-manager-add-button" onClick={handleAddRow}>
                행 추가
              </button>
              <button type="button" className="menu-manager-save-button" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </section>

          <section className="menu-manager-layout account-inventory-layout">
            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>거래처 재고 목록</h2>
                  <span>{locationFilteredItems.length}건</span>
                </div>
              </div>
              {ingredientError ? <div className="menu-manager-notice">{ingredientError}</div> : null}

              <div className="menu-manager-table-scroll">
                {isLoading ? <LoadingScreen compact message="거래처 재고 목록을 불러오는 중입니다." /> : null}
                {!isLoading && error ? <div className="menu-manager-empty">{error}</div> : null}
                {!isLoading && !error && locationFilteredItems.length > 0 ? (
                  <table className="menu-manager-table">
                    <thead>
                      <tr>
                        <th>카테고리</th>
                        <th>식자재명</th>
                        <th>보관위치</th>
                        <th>필요수량</th>
                        <th>현재고</th>
                        <th>안전재고</th>
                        <th>부족재고</th>
                        <th>발주필요</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedItems.map((item) => (
                        <tr
                          key={item.row_id}
                          className={isInventoryItemChanged(item, originalItemsByRowId) ? 'is-dirty' : undefined}
                        >
                          <td>
                            <select
                              className={getCellInputClass(item, originalItemsByRowId, 'category_name')}
                              value={item.category_name ?? ''}
                              onChange={(event) => handleTextChange(item, 'category_name', event.target.value)}
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
                                className={getDirtySelectClass(item, originalItemsByRowId, 'ingredient_id')}
                                options={
                                  item.category_name
                                    ? ingredientOptions.filter((option) => option.category_name === item.category_name)
                                    : ingredientOptions
                                }
                                placeholder="식자재 선택"
                                selectedName={item.ingredient_name}
                                value={item.ingredient_id}
                                onChange={(ingredientId) => handleIngredientSelect(item, ingredientId)}
                              />
                            </div>
                          </td>
                          <td>
                            <select
                              className={getCellInputClass(item, originalItemsByRowId, 'location_id')}
                              value={item.location_id ?? ''}
                              onChange={(event) => handleTextChange(item, 'location_id', event.target.value)}
                            >
                              <option value="">위치 선택</option>
                              {locationOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.text}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="menu-manager-qty-editor">
                              <input
                                className={getCellInputClass(item, originalItemsByRowId, 'required_qty', ' is-compact')}
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.required_qty}
                                onChange={(event) => handleNumberChange(item, 'required_qty', event.target.value)}
                              />
                              <select
                                className={getCellInputClass(item, originalItemsByRowId, 'qty_unit', ' is-unit')}
                                value={item.qty_unit ?? ''}
                                onChange={(event) => handleTextChange(item, 'qty_unit', event.target.value)}
                              >
                                <option value="">단위</option>
                                {qtyUnitOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>
                            <div className="menu-manager-qty-editor">
                              <input
                                className={getCellInputClass(item, originalItemsByRowId, 'current_qty', ' is-compact')}
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.current_qty}
                                onChange={(event) => handleNumberChange(item, 'current_qty', event.target.value)}
                              />
                              <select
                                className={getCellInputClass(item, originalItemsByRowId, 'base_unit', ' is-unit')}
                                value={item.base_unit ?? ''}
                                onChange={(event) => handleTextChange(item, 'base_unit', event.target.value)}
                              >
                                <option value="">단위</option>
                                {qtyUnitOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>
                            <input
                              className={getCellInputClass(item, originalItemsByRowId, 'safe_stock_qty')}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.safe_stock_qty}
                              onChange={(event) => handleNumberChange(item, 'safe_stock_qty', event.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className={getCellInputClass(item, originalItemsByRowId, 'shortage_qty')}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.shortage_qty}
                              onChange={(event) => handleNumberChange(item, 'shortage_qty', event.target.value)}
                            />
                          </td>
                          <td>
                            <div className="menu-manager-qty-editor">
                              <input
                                className={getCellInputClass(item, originalItemsByRowId, 'order_needed_qty', ' is-compact')}
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.order_needed_qty}
                                onChange={(event) => handleNumberChange(item, 'order_needed_qty', event.target.value)}
                              />
                              <select
                                className={getCellInputClass(item, originalItemsByRowId, 'order_unit', ' is-unit')}
                                value={item.order_unit ?? ''}
                                onChange={(event) => handleTextChange(item, 'order_unit', event.target.value)}
                              >
                                <option value="">단위</option>
                                {qtyUnitOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {!isLoading && !error && locationFilteredItems.length > 0 ? (
                  <div className="menu-manager-pagination">
                    <span className="menu-manager-pagination__summary">
                      {Math.min((currentPage - 1) * MENU_PAGE_SIZE + 1, locationFilteredItems.length)}-
                      {Math.min(currentPage * MENU_PAGE_SIZE, locationFilteredItems.length)} / {locationFilteredItems.length}
                    </span>
                    <div className="menu-manager-pagination__actions">
                      <button
                        type="button"
                        className="menu-manager-pagination__button"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
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
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="menu-manager-pagination__button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        다음
                      </button>
                      <button
                        type="button"
                        className="menu-manager-pagination__button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage >= totalPages}
                      >
                        마지막
                      </button>
                    </div>
                  </div>
                ) : null}
                {!isLoading && !error && locationFilteredItems.length === 0 ? (
                  <div className="menu-manager-empty">조회 조건에 맞는 거래처 재고가 없습니다.</div>
                ) : null}
              </div>
            </section>
          </section>
        </SideMenuLayout>
      </main>
      <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </div>
  )
}

export default AccountInventoryManager
