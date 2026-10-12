import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import ProductImage from '../../components/ProductImage'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import { getAccountInventoryList, saveAccountInventory, type AccountInventoryItem } from '../../api/inventory'
import { getIngredientOptions, type IngredientOption } from '../../api/operations'
import IngredientSearchSelect from '../operations/IngredientSearchSelect'
import { MENU_PAGE_SIZE, parseNumber, qtyUnitOptions } from '../operations/menuManagerShared'
import { stockInputUnits } from '../../utils/quantityUnits'
import OpeningStockModal from './OpeningStockModal'
import DirectPurchaseModal from './DirectPurchaseModal'
import '../operations/MenuManager.css'
import { getIngredientStockStatus } from '../../utils/ingredientStockStatus'

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
    category_name: item.category_name || categoryByIngredientId.get(item.ingredient_id) || '',
  }))
}

function getLocationName(locationId?: string) {
  const labels: Record<string, string> = {
    L001: '상온창고',
    L002: '냉장고',
    L003: '냉동고',
    L999: '기타/미분류',
  }
  return locationId ? labels[locationId] ?? locationId : '-'
}

function getInventoryStockStatus(item: AccountInventoryItem) {
  if (item.stock_status === 'RED') return { emoji: '🔴', label: '즉시 재고 부족', needsOrder: true }
  if (item.stock_status === 'ORANGE') return { emoji: '🟠', label: '안전재고·입고예정량 반영 후 부족', needsOrder: true }
  if (item.stock_status === 'YELLOW') return { emoji: '🟡', label: '최근 사용 이력 없음 · 총용량 대비 재고 30% 이하', needsOrder: false }
  if (item.stock_status === 'EMPTY') return { emoji: '⚪', label: '재고 없음 · 필요량 미산정', needsOrder: false }
  if (item.stock_status === 'UNKNOWN') return { emoji: '⚪', label: '사용 이력 없음 · 적정재고 판단 불가', needsOrder: false }
  if (item.stock_status === 'GREEN') return { emoji: '🟢', label: '안전재고·입고예정량 반영 후 충족', needsOrder: false }
  return getIngredientStockStatus(item)
}

type EditableTextField = 'category_name' | 'location_id' | 'current_unit'
type EditableIngredientField = 'ingredient_id' | 'ingredient_name'
type EditableNumberField = 'current_qty'
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
    current_base_qty: 0,
    current_unit: '',
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
    'location_id',
    'current_qty',
    'current_unit',
  ] as const).some((field) => item[field] !== original[field])
}

function AccountInventoryManager() {
  const navigate = useNavigate()
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
  const [reloadVersion, setReloadVersion] = useState(0)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [alert, setAlert] = useState<AppAlertState | null>(null)
  const [isOpeningOpen, setIsOpeningOpen] = useState(false)
  // 식단 사용 확정에서 재고 부족 시 '직접 구매 입력'으로 바로 열 수 있게 한다(?direct_purchase=1).
  const [isDirectPurchaseOpen, setIsDirectPurchaseOpen] = useState(() => searchParams.get('direct_purchase') === '1')

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
  }, [targetAccountId, reloadVersion])

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
    // 재고가 있는 상품을 먼저(같은 그룹 안에서는 서버의 위험도 순서 유지). 연결만 되고 입고 전인 0 재고 상품이 많으면
    // 방금 입고한 상품이 뒤 페이지로 밀려 '반영 안 됨'처럼 보였다.
    const ordered = [...items].sort((a, b) => Number(Number(b.current_base_qty) > 0) - Number(Number(a.current_base_qty) > 0))
    if (!normalizedKeyword) return ordered

    return ordered.filter((item) =>
      [item.menu_name, item.ingredient_name, item.product_name, item.supplier_item_code, item.category_name, item.location_id, getLocationName(item.location_id)]
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
              current_unit: item.current_unit || selectedIngredient?.base_unit || '',
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
      const savedItems = applyIngredientCategories(
        (await getAccountInventoryList(targetAccountId)).map(createInventoryRow),
        ingredientOptions,
      )
      setItems(savedItems)
      setOriginalItemsByRowId(buildInventorySnapshotMap(savedItems))
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

  const goToOrder = (item: EditableAccountInventoryItem) => {
    const params = new URLSearchParams({ account_id: targetAccountId, ingredient_id: item.ingredient_id })
    if (item.account_ingredient_product_id) {
      params.set('account_ingredient_product_id', String(item.account_ingredient_product_id))
    }
    params.set('source', 'INVENTORY')
    navigate(`/order_manager/food_order?${params.toString()}`)
  }

  return (
    <div className="menu-manager-page">
      {isSaving ? <LoadingScreen overlay message="거래처 재고를 저장하고 있습니다." /> : null}
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
                  placeholder="식자재, 상품명, 카테고리, 위치"
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
                      {getLocationName(option.value)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="menu-manager-filters__actions">
              <button type="button" className="action-query-button" disabled={isLoading || isSaving}
                onClick={() => {
                  if (items.some((item) => isInventoryItemChanged(item, originalItemsByRowId))
                    && !window.confirm('저장하지 않은 변경사항을 버리고 최신 재고를 조회할까요?')) return
                  setReloadVersion((current) => current + 1)
                }}>
                재고 새로고침
              </button>
              <button type="button" className="menu-manager-add-button" onClick={handleAddRow}>
                행 추가
              </button>
              <button type="button" className="menu-manager-add-button" disabled={isLoading || isSaving}
                title="도입 전부터 보유한 재고를 수량과 단가로 등록합니다"
                onClick={() => {
                  if (items.some((item) => isInventoryItemChanged(item, originalItemsByRowId))) {
                    setAlert({ type: 'error', title: '저장 필요', message: '저장하지 않은 변경사항을 먼저 저장하거나 새로고침한 뒤 기초재고를 등록해주세요.' })
                    return
                  }
                  setIsOpeningOpen(true)
                }}>
                기초재고 등록
              </button>
              <button type="button" className="menu-manager-add-button" disabled={isLoading || isSaving || !targetAccountId}
                title="마트·쿠팡 등에서 직접 산 식재료를 재고에 넣습니다"
                onClick={() => {
                  if (items.some((item) => isInventoryItemChanged(item, originalItemsByRowId))) {
                    setAlert({ type: 'error', title: '저장 필요', message: '저장하지 않은 변경사항을 먼저 저장하거나 새로고침한 뒤 직접구매를 등록해주세요.' })
                    return
                  }
                  setIsDirectPurchaseOpen(true)
                }}>
                직접구매 등록
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
                  <table className="menu-manager-table account-inventory-table">
                    <thead>
                      <tr>
                        <th>카테고리</th>
                        <th>식자재명</th>
                        <th>공급상품</th>
                        <th>포장가격</th>
                        <th>기준단가</th>
                        <th>재고평균단가</th>
                        <th>재고금액</th>
                        <th>보관위치</th>
                        <th>예상필요수량</th>
                        <th>현재고</th>
                        <th>안전재고</th>
                        <th>부족재고</th>
                        <th>발주필요</th>
                        <th>재고상태</th>
                        <th>발주</th>
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
                          <td title={`${item.supplier_name ?? ''} ${item.product_name ?? ''}`}>
                            <div className="product-name-with-image"><ProductImage compact src={item.image_url} name={item.product_name || item.ingredient_name} /><span>{item.product_name || '상품 미연결'}{item.supplier_code === 'DIRECT' && <small className="account-inventory-tag"> 직접구매</small>}{item.account_ingredient_product_id ? <Link className="account-inventory-history-link" to={`/inventory/history?${new URLSearchParams({ account_id: targetAccountId, account_ingredient_product_id: String(item.account_ingredient_product_id) })}`}>변동 이력</Link> : null}</span></div>
                          </td>
                          <td>
                            {(item.purchase_price ?? 0) > 0
                              ? `${Math.round(item.purchase_price ?? 0).toLocaleString('ko-KR')}원`
                              : '가격 미등록'}
                          </td>
                          <td>
                            {(item.purchase_price ?? 0) > 0 && (item.package_base_qty ?? 0) > 0
                              ? `${((item.purchase_price ?? 0) / (item.package_base_qty ?? 1)).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/${item.base_unit}`
                              : '미산정'}
                          </td>
                          <td>{(item.average_unit_cost ?? 0) > 0 ? `${(item.average_unit_cost ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/${item.base_unit}` : '입고 전'}
                            {item.opening_cost_estimated && <small className="account-inventory-tag" title="기초재고를 공급가 기반 추정 단가로 등록했습니다. 입고·사용이 쌓이면 실제 단가로 평균이 바뀝니다."> 추정</small>}</td>
                          <td>{Math.round(item.inventory_amount ?? 0).toLocaleString('ko-KR')}원</td>
                          <td>
                            <select
                              className={getCellInputClass(item, originalItemsByRowId, 'location_id')}
                              value={item.location_id ?? ''}
                              onChange={(event) => handleTextChange(item, 'location_id', event.target.value)}
                            >
                              <option value="">위치 선택</option>
                              {locationOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {getLocationName(option.value)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {item.required_qty} {item.base_unit}
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
                                className={getCellInputClass(item, originalItemsByRowId, 'current_unit', ' is-unit')}
                                value={item.current_unit ?? item.base_unit ?? ''}
                                onChange={(event) => handleTextChange(item, 'current_unit', event.target.value)}
                              >
                                <option value="">단위</option>
                                {/* 저장 가능한 단위만: 기준단위, kg/L, 상품 발주단위(규격이 있을 때). 신규 행은 전체 목록 */}
                                {(stockInputUnits(item.base_unit, item.order_unit, item.package_base_qty) ?? qtyUnitOptions).map((option) => (
                                  <option key={option} value={option}>
                                    {option === item.order_unit && item.package_base_qty
                                      ? `${option} (${item.package_base_qty.toLocaleString()}${item.base_unit})`
                                      : option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>
                            {item.safe_stock_qty} {item.base_unit}
                          </td>
                          <td>
                            {item.shortage_qty} {item.base_unit}
                          </td>
                          <td>
                            {item.order_needed_qty} {item.base_unit}
                          </td>
                          <td>
                            <span className={`workspace-status workspace-status--${getInventoryStockStatus(item).needsOrder ? "danger" : Number(item.current_qty) <= 0 ? "warning" : "neutral"}`} title={getInventoryStockStatus(item).label}>
                              {getInventoryStockStatus(item).label}
                            </span>
                          </td>
                          <td>
                            {getInventoryStockStatus(item).needsOrder ? (
                              <button type="button" className="menu-manager-add-button" onClick={() => goToOrder(item)}>
                                발주하러 가기
                              </button>
                            ) : '-'}
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
      {isDirectPurchaseOpen && (
        <DirectPurchaseModal
          accountId={targetAccountId}
          items={items}
          onClose={() => setIsDirectPurchaseOpen(false)}
          onDone={(result) => {
            setIsDirectPurchaseOpen(false)
            setReloadVersion((current) => current + 1)
            setAlert({ type: 'success', title: '직접구매 등록', message: result.replayed
              ? '이미 기록된 직접구매입니다. 재고에 다시 더하지 않았습니다.'
              : `${result.product_name} ${Number(result.base_qty).toLocaleString('ko-KR')}${result.base_unit}를 재고에 반영했습니다.${result.product_created ? ' (직접구매 상품 새로 등록)' : ''}` })
          }}
        />
      )}
      {isOpeningOpen && (
        <OpeningStockModal
          items={items}
          onClose={() => setIsOpeningOpen(false)}
          onDone={(saved, failed) => {
            if (saved) setReloadVersion((current) => current + 1)
            setAlert(failed
              ? { type: 'error', title: '일부 실패', message: `${saved}건 등록, ${failed}건 실패. 실패 사유는 목록에서 확인해주세요.` }
              : { type: 'success', title: '기초재고 등록', message: `${saved}건을 등록했습니다.` })
            if (!failed) setIsOpeningOpen(false)
          }}
        />
      )}
    </div>
  )
}

export default AccountInventoryManager
