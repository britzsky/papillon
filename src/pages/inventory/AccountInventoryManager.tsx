import { isHeadquarters, workspaceAccountId } from '../../features/workspace/workspaceAccount'
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
import { LOCATION_OPTIONS as locationOptions, getInventoryStockStatus, getLocationName, inventoryOrderPath, matchesInventoryKeyword, orderStockFirst } from '../../features/inventory/inventoryView'

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

/** 상태 묶음: 발주 필요(즉시 부족·입고예정 반영 후 부족) / 확인 필요(사용 이력 없음·재고 없음 등) / 충분 */
function stockGroup(item: AccountInventoryItem): 'order' | 'check' | 'ok' {
  const status = getInventoryStockStatus(item)
  if (status.needsOrder) return 'order'
  return item.stock_status === 'GREEN' ? 'ok' : 'check'
}
const STOCK_CHIP = { order: { text: '발주 필요', tone: 'is-urgent' }, check: { text: '확인 필요', tone: 'rd-tone-yellow' }, ok: { text: '충분', tone: 'is-ok' } } as const

function AccountInventoryManager() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialKeyword = searchParams.get('q') ?? ''
  // 관리 거래처(옛 주소 ?id= 도 본사는 받는다)
  const targetAccountId = (workspaceAccountId(searchParams) || (isHeadquarters() ? searchParams.get('id') ?? '' : '')).trim()
  const [items, setItems] = useState<EditableAccountInventoryItem[]>([])
  const [originalItemsByRowId, setOriginalItemsByRowId] = useState<Record<string, EditableAccountInventoryItem>>({})
  const [error, setError] = useState('')
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([])
  const [ingredientError, setIngredientError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [selectedLocationId, setSelectedLocationId] = useState('')
  // 2026-10-15 개편(시안 ⑦): 상단 칸·알약으로 상태별 거르기(화면만, 저장 로직 무관)
  const [statusFilter, setStatusFilter] = useState<'' | 'order' | 'check' | 'ok'>('')
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

  const filteredItems = useMemo(() => orderStockFirst(items).filter(item => matchesInventoryKeyword(item, keyword)), [items, keyword])

  const locationFilteredItems = useMemo(
    () => filteredItems.filter((item) => (selectedLocationId === '' || item.location_id === selectedLocationId) && (statusFilter === '' || stockGroup(item) === statusFilter)),
    [filteredItems, selectedLocationId, statusFilter],
  )

  const totalPages = Math.max(1, Math.ceil(locationFilteredItems.length / MENU_PAGE_SIZE))
  const groupCount = useMemo(() => items.reduce((acc, item) => { acc[stockGroup(item)] += 1; return acc }, { order: 0, check: 0, ok: 0 }), [items])
  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + (Number(item.inventory_amount) || 0), 0), [items])
  const dirtyCount = items.filter((item) => isInventoryItemChanged(item, originalItemsByRowId)).length
  /** 막대: 현재고 ÷ max(안전재고+필요량, 현재고) — 상태 칩 옆에서 얼마나 남았는지 */
  const stockPct = (item: EditableAccountInventoryItem) => {
    const current = Number(item.current_qty) || 0
    const target = Math.max((Number(item.safe_stock_qty) || 0) + (Number(item.required_qty) || 0), current, 1)
    return Math.min(100, Math.round(current / target * 100))
  }

  const pagedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * MENU_PAGE_SIZE
    return locationFilteredItems.slice(startIndex, startIndex + MENU_PAGE_SIZE)
  }, [currentPage, locationFilteredItems])

  useEffect(() => {
    setCurrentPage(1)
  }, [keyword, selectedLocationId, statusFilter])

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

  const goToOrder = (item: EditableAccountInventoryItem) => navigate(inventoryOrderPath(targetAccountId, item))


  return (
    <div className="menu-manager-page">
      {isSaving ? <LoadingScreen overlay message="거래처 재고를 저장하고 있습니다." /> : null}
      <main className="menu-manager-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="재고"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '재고관리', to: '/inventory/account' },
                { label: '재고' },
              ]}
            />
          }
        >
          <div className="rd rd-inv">
          <header className="rd-inv__head">
            <h1 className="rd-h1">재고</h1>
            <div className="rd-inv__actions">
              <button type="button" className="rd-btn is-primary" disabled={isLoading || isSaving || !targetAccountId}
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
              <button type="button" className="rd-btn" disabled={isLoading || isSaving}
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
              <Link className="rd-btn" to={`/inventory/history?${new URLSearchParams({ account_id: targetAccountId })}`}>재고 이력</Link>
            </div>
          </header>

          <section className="rd-inv__tiles" aria-label="재고 현황">
            {([['', '관리 식재료', `${items.length}개`, '이 거래처에서 쓰는 식재료', 'is-done'],
              ['order', '발주 필요', `${groupCount.order}개`, '즉시 부족·입고예정 반영 후 부족', 'is-urgent'],
              ['check', '확인 필요', `${groupCount.check}개`, '사용 이력 없음·재고 없음 등', 'is-warn'],
              ['ok', '재고 금액', `${Math.round(totalAmount).toLocaleString('ko-KR')}원`, '평균단가 × 현재고 합계', 'is-ok']] as const).map(([key, label, value, hint, tone]) =>
              <button key={label} type="button" aria-pressed={statusFilter === key && key !== 'ok'} className={`rd-inv__tile ${tone}${statusFilter === key && key !== 'ok' ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(key === 'ok' ? '' : statusFilter === key ? '' : key)}>
                <span className="rd-inv__tile-label">{label}</span><strong>{value}</strong><small>{hint}</small>
              </button>)}
          </section>
          <section className="menu-manager-layout account-inventory-layout">
            <section className="menu-manager-panel">
              <div className="rd-inv__filters">
                <input aria-label="식재료 찾기" className="rd-input" value={keyword} placeholder="식재료·상품·카테고리·위치 찾기" onChange={(event) => setKeyword(event.target.value)} />
                <div className="rd-pills" role="group" aria-label="상태">
                  {([['', '전체', items.length], ['order', '발주 필요', groupCount.order], ['check', '확인 필요', groupCount.check], ['ok', '충분', groupCount.ok]] as const).map(([key, label, count]) =>
                    <button key={label} type="button" aria-pressed={statusFilter === key} className={statusFilter === key ? 'is-active' : ''} onClick={() => setStatusFilter(key)}>{label} {count}</button>)}
                </div>
                <select aria-label="보관위치" className="rd-input" value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)}>
                  <option value="">전체 보관위치</option>
                  {locationOptions.map((option) => <option key={option.value} value={option.value}>{getLocationName(option.value)}</option>)}
                </select>
                <span className="rd-inv__spacer" />
                <span className="rd-muted rd-fs-sm">{locationFilteredItems.length}건</span>
                <button type="button" className="rd-btn is-ghost" disabled={isLoading || isSaving}
                  onClick={() => {
                    if (items.some((item) => isInventoryItemChanged(item, originalItemsByRowId))
                      && !window.confirm('저장하지 않은 변경사항을 버리고 최신 재고를 조회할까요?')) return
                    setReloadVersion((current) => current + 1)
                  }}>새로고침</button>
                <button type="button" className="rd-btn" onClick={handleAddRow}>행 추가</button>
                <button type="button" className={`rd-btn${dirtyCount ? ' is-primary' : ''}`} onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? '저장 중...' : dirtyCount ? `변경 ${dirtyCount}건 저장` : '저장'}</button>
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
                        <th>재고상태</th>
                        <th>공급상품</th>
                        <th>포장가 / 기준단가</th>
                        <th>재고평균단가</th>
                        <th>재고금액</th>
                        <th>보관위치</th>
                        <th>예상필요수량</th>
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
                          <td className="rd-inv__status">
                            <span className={`rd-chip ${STOCK_CHIP[stockGroup(item)].tone}`} title={getInventoryStockStatus(item).label}>{STOCK_CHIP[stockGroup(item)].text}</span>
                            <span className="rd-bar rd-inv__bar" aria-hidden="true"><span className={`is-${stockGroup(item)}`} style={{ width: `${stockPct(item)}%` }} /></span>
                            <small className="rd-muted rd-inv__status-text">{getInventoryStockStatus(item).label}</small>
                            <div className="rd-inv__status-action">
                            {getInventoryStockStatus(item).needsOrder ? (
                              <button type="button" className="rd-btn is-primary rd-inv__order" onClick={() => goToOrder(item)}>
                                발주
                              </button>
                            ) : null}
                          </div>
                          </td>
                          <td title={`${item.supplier_name ?? ''} ${item.product_name ?? ''}`}>
                            <div className="product-name-with-image"><ProductImage compact src={item.image_url} name={item.product_name || item.ingredient_name} /><span>{item.product_name || '상품 미연결'}{item.supplier_code === 'DIRECT' && <small className="account-inventory-tag"> 직접구매</small>}{item.account_ingredient_product_id ? <Link className="account-inventory-history-link" to={`/inventory/history?${new URLSearchParams({ account_id: targetAccountId, account_ingredient_product_id: String(item.account_ingredient_product_id) })}`}>변동 이력</Link> : null}</span></div>
                          </td>
                          <td>
                            {(item.purchase_price ?? 0) > 0
                              ? `${Math.round(item.purchase_price ?? 0).toLocaleString('ko-KR')}원`
                              : '가격 미등록'}
                            <small className="rd-muted rd-inv__sub">
                              {(item.purchase_price ?? 0) > 0 && (item.package_base_qty ?? 0) > 0
                                ? `${((item.purchase_price ?? 0) / (item.package_base_qty ?? 1)).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/${item.base_unit}`
                                : '미산정'}
                            </small>
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
          </div>
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
