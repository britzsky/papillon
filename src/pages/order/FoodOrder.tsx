import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import {
  getOrderDetailList,
  getOrderMenuList,
  type MealType,
  type MenuCategory,
  type OrderMenu,
} from '../../api/order'
import { mealCategoryOptions } from '../operations/menuManagerShared'
import { lookupItem, validateItemLookupRequest, type ItemLookupItem } from '../../api/itemLookup'
import './FoodOrder.css'

type Supplier = {
  menu_id: string
  menu_name: string
  price: number
  recommendedQuantity: number
}

type Ingredient = {
  menu_id: string
  ingredient_id: string
  ingredient_name: string
  required_qty: number
  current_qty: number
  shortage_qty: number
  order_needed_qty: number
  base_unit: string
  order_unit: string
  convert_value: number
  suppliers: Supplier[]
}

type MenuDetail = OrderMenu & {
  mealType?: MealType
  servings?: number
  ingredients: Ingredient[]
}

type SelectedOrder = {
  ingredientmenu_id: string
  ingredientmenu_name: string
  unit: string
  requiredQuantity: number
  stockQuantity: number
  suppliermenu_id: string
  suppliermenu_name: string
  price: number
  recommendedQuantity: number
}

const MEAL_BREAKFAST = '조식' as MealType
const MEAL_LUNCH = '중식' as MealType
const MEAL_DINNER = '석식' as MealType

function getCategoryLabel(category: MenuCategory) {
  return category
}

const categoryOptions = [...mealCategoryOptions] as MenuCategory[]

const mockMenuDetails: MenuDetail[] = [
  {
    menu_id: '1',
    food_type: '한식',
    meal_category: '한식',
    menu_type: '0',
    mealType: MEAL_BREAKFAST,
    menu_name: '소고기미역국 정식',
    created_at: '2026-03-12',
    servings: 120,
    ingredients: [
      {
        menu_id: '1',
        ingredient_id: '101',
        ingredient_name: '미역',
        required_qty: 8,
        current_qty: 2,
        shortage_qty: 6,
        order_needed_qty: 6,
        base_unit: 'kg',
        order_unit: 'kg',
        convert_value: 1,
        suppliers: [
          { menu_id: '1001', menu_name: '바다유통', price: 12000, recommendedQuantity: 6 },
          { menu_id: '1002', menu_name: '청해식품', price: 11500, recommendedQuantity: 6 },
        ],
      },
      {
        menu_id: '1',
        ingredient_id: '102',
        ingredient_name: '소고기',
        required_qty: 18,
        current_qty: 7,
        shortage_qty: 11,
        order_needed_qty: 11,
        base_unit: 'kg',
        order_unit: 'kg',
        convert_value: 1,
        suppliers: [
          { menu_id: '1003', menu_name: '서우직송', price: 28000, recommendedQuantity: 11 },
          { menu_id: '1004', menu_name: '미트밸리', price: 26500, recommendedQuantity: 11 },
        ],
      },
    ],
  },
  {
    menu_id: 'M0049',
    food_type: '중식',
    meal_category: '중식',
    menu_type: '0',
    mealType: MEAL_LUNCH,
    menu_name: '제육볶음 정식',
    created_at: '2026-03-12',
    servings: 150,
    ingredients: [
      {
        menu_id: '2',
        ingredient_id: '104',
        ingredient_name: '돼지고기',
        required_qty: 24,
        current_qty: 9,
        shortage_qty: 15,
        order_needed_qty: 15,
        base_unit: 'kg',
        order_unit: 'kg',
        convert_value: 1,
        suppliers: [
          { menu_id: 'M0049', menu_name: '축산플러스', price: 16000, recommendedQuantity: 15 },
          { menu_id: 'M0049', menu_name: '신선정육', price: 15800, recommendedQuantity: 15 },
        ],
      },
      {
        menu_id: 'M0049',
        ingredient_id: 'I0157',
        ingredient_name: '고추장',
        required_qty: 6,
        current_qty: 2,
        shortage_qty: 4,
        order_needed_qty: 4,
        base_unit: 'kg',
        order_unit: 'kg',
        convert_value: 1,
        suppliers: [{ menu_id: 'M0049', menu_name: '맛있는상회', price: 9000, recommendedQuantity: 4 }],
      },
    ],
  },
  {
    menu_id: 'M0049',
    food_type: '일식',
    meal_category: '일식',
    menu_type: '0',
    mealType: MEAL_DINNER,
    menu_name: '닭갈비 정식',
    created_at: '2026-03-13',
    servings: 100,
    ingredients: [
      {
        menu_id: 'M0049',
        ingredient_id: 'I0004',
        ingredient_name: '닭고기',
        required_qty: 20,
        current_qty: 8,
        shortage_qty: 12,
        order_needed_qty: 12,
        base_unit: 'kg',
        order_unit: 'kg',
        convert_value: 1,
        suppliers: [
          { menu_id: '1101', menu_name: '한빛축산', price: 14500, recommendedQuantity: 12 },
          { menu_id: '1102', menu_name: '푸드허브', price: 14200, recommendedQuantity: 12 },
        ],
      },
    ],
  },
]

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatQuantity(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`
}

function getCurrentDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

function getCompactDate(daysToAdd = 0) {
  const date = new Date()
  date.setDate(date.getDate() + daysToAdd)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function sanitizeServingQty(value: number) {
  if (!Number.isFinite(value) || value < 1) {
    return 1
  }

  return Math.floor(value)
}

function buildFallbackIngredients(menu: MenuDetail | undefined): Ingredient[] {
  return menu?.ingredients ?? []
}

type FoodOrderProps = {
  embedded?: boolean
}

function FoodOrder({ embedded: _embedded = false }: FoodOrderProps) {
  void _embedded
  const { menuId: routeMenuId } = useParams<{ menuId?: string }>()
  const targetMenuId = routeMenuId ? decodeURIComponent(routeMenuId) : ''

  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>(categoryOptions[0])
  const [menuList, setMenuList] = useState<OrderMenu[]>([])
  const [menuListError, setMenuListError] = useState('')
  const [isMenuListLoading, setIsMenuListLoading] = useState(true)
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null)
  const [servingQtyByMenuId, setServingQtyByMenuId] = useState<Record<string, number>>({})
  const [detailItems, setDetailItems] = useState<Ingredient[]>([])
  const [detailError, setDetailError] = useState('')
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, boolean>>({})
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [itemCode, setItemCode] = useState('')
  const [soldTo, setSoldTo] = useState(() => localStorage.getItem('sold_to') ?? '')
  const [reqDeliveryDate, setReqDeliveryDate] = useState(() => getCompactDate(1))
  const [lookupItems, setLookupItems] = useState<ItemLookupItem[]>([])
  const [lookupError, setLookupError] = useState('')
  const [isLookupLoading, setIsLookupLoading] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadMenuList = async () => {
      try {
        setIsMenuListLoading(true)
        setMenuListError('')
        const menus = await getOrderMenuList()
        if (!isMounted) {
          return
        }

        const fallbackMenus = menus.length > 0 ? menus : mockMenuDetails

        setMenuList(fallbackMenus)
        setServingQtyByMenuId((current) => {
          const next = { ...current }
          fallbackMenus.forEach((menu) => {
            next[menu.menu_id] = next[menu.menu_id] ?? 1
          })
          return next
        })
      } catch (error) {
        if (!isMounted) {
          return
        }

        setMenuList(mockMenuDetails)
        setServingQtyByMenuId((current) => {
          const next = { ...current }
          mockMenuDetails.forEach((menu) => {
            next[menu.menu_id] = next[menu.menu_id] ?? 1
          })
          return next
        })
        setMenuListError(error instanceof Error ? error.message : '메뉴 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsMenuListLoading(false)
        }
      }
    }

    loadMenuList()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!targetMenuId || menuList.length === 0) {
      return
    }

    const targetMenu = menuList.find((menu) => menu.menu_id === targetMenuId)
    if (!targetMenu) {
      return
    }

    setSelectedCategory(targetMenu.meal_category)
    setSelectedMenuId(targetMenu.menu_id)
  }, [menuList, targetMenuId])

  const filteredMenus = useMemo(() => {
    const items = menuList.filter((item) => item.meal_category === selectedCategory)
    if (!targetMenuId) {
      return items
    }

    return [...items].sort((a, b) => {
      if (a.menu_id === targetMenuId) return -1
      if (b.menu_id === targetMenuId) return 1
      return 0
    })
  }, [menuList, selectedCategory, targetMenuId])

  useEffect(() => {
    const nextMenu = filteredMenus.find((menu) => menu.menu_id === selectedMenuId) ?? filteredMenus[0] ?? null
    setSelectedMenuId(nextMenu?.menu_id ?? null)
  }, [filteredMenus, selectedMenuId])

  const activeMenuSummary =
    filteredMenus.find((menu) => menu.menu_id === selectedMenuId) ?? filteredMenus[0] ?? null

  const activeServingQty = activeMenuSummary ? servingQtyByMenuId[activeMenuSummary.menu_id] ?? 1 : 1

  useEffect(() => {
    let isMounted = true

    const loadDetailList = async () => {
      if (!activeMenuSummary?.menu_id) {
        setDetailItems([])
        setDetailError('')
        setIsDetailLoading(false)
        return
      }

      const matchedMock = mockMenuDetails.find((menu) => menu.menu_id === activeMenuSummary.menu_id)

      try {
        setIsDetailLoading(true)
        setDetailError('')
        const details = await getOrderDetailList(activeMenuSummary.menu_id, activeServingQty, activeMenuSummary.menu_type)
        if (!isMounted) {
          return
        }

        const fallbackIngredients = buildFallbackIngredients(matchedMock)
        const fallbackById = new Map(fallbackIngredients.map((item) => [item.ingredient_id, item]))

        setDetailItems(
          (details.length > 0 ? details : fallbackIngredients).map((detail) => {
            const fallback = fallbackById.get(detail.ingredient_id)
            return {
              ...detail,
              suppliers: fallback?.suppliers ?? [],
            }
          }),
        )
      } catch (error) {
        if (!isMounted) {
          return
        }

        setDetailItems(buildFallbackIngredients(matchedMock))
        setDetailError(error instanceof Error ? error.message : '식자재 상세 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsDetailLoading(false)
        }
      }
    }

    loadDetailList()

    return () => {
      isMounted = false
    }
  }, [activeMenuSummary, activeServingQty])

  const activeMenu = useMemo<MenuDetail | null>(() => {
    if (!activeMenuSummary) {
      return null
    }

    const matchedMock = mockMenuDetails.find((menu) => menu.menu_id === activeMenuSummary.menu_id)

    return {
      ...(matchedMock ?? {
        ...activeMenuSummary,
        ingredients: [],
      }),
      ...activeMenuSummary,
      servings: activeServingQty,
      ingredients: detailItems,
    }
  }, [activeMenuSummary, activeServingQty, detailItems])

  useEffect(() => {
    setSelectedSuppliers({})
    setIsOrderModalOpen(false)
  }, [activeMenu?.menu_id, activeServingQty])

  const handleItemSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    const request = {
      soldTo: soldTo.trim(),
      itemCode: itemCode.trim(),
      reqDeliveryDate: reqDeliveryDate.trim(),
    }
    const validationError = validateItemLookupRequest(request)
    if (validationError) {
      setLookupError(validationError)
      return
    }
    localStorage.setItem('sold_to', request.soldTo)
    setIsLookupLoading(true)
    setLookupError('')
    try {
      const items = await lookupItem(request)
      setLookupItems(items)
      if (items.length === 0) setLookupError('해당 입고일에 주문 가능한 품목 정보가 없습니다.')
    } catch (error) {
      setLookupItems([])
      setLookupError(error instanceof Error ? error.message : '품목 조회에 실패했습니다.')
    } finally {
      setIsLookupLoading(false)
    }
  }

  const selectedOrders = useMemo<SelectedOrder[]>(() => {
    if (!activeMenu) {
      return []
    }

    return activeMenu.ingredients.flatMap((ingredient) =>
      ingredient.suppliers
        .filter((supplier) => selectedSuppliers[`${ingredient.ingredient_id}-${supplier.menu_id}`])
        .map((supplier) => ({
          ingredientmenu_id: ingredient.ingredient_id,
          ingredientmenu_name: ingredient.ingredient_name,
          unit: ingredient.order_unit || ingredient.base_unit,
          requiredQuantity: ingredient.required_qty,
          stockQuantity: ingredient.current_qty,
          suppliermenu_id: supplier.menu_id,
          suppliermenu_name: supplier.menu_name,
          price: supplier.price,
          recommendedQuantity: ingredient.order_needed_qty || supplier.recommendedQuantity,
        })),
    )
  }, [activeMenu, selectedSuppliers])

  const orderSheetRows = useMemo(
    () =>
      selectedOrders.map((order, index) => {
        const shortageQuantity = Math.max(order.requiredQuantity - order.stockQuantity, 0)
        const supplyAmount = order.price * order.recommendedQuantity
        const taxAmount = Math.round(supplyAmount * 0.1)
        const totalAmount = supplyAmount + taxAmount

        return {
          ...order,
          index: index + 1,
          requiredQuantityText: formatQuantity(order.requiredQuantity, order.unit),
          stockQuantityText: formatQuantity(order.stockQuantity, order.unit),
          shortageQuantityText: formatQuantity(shortageQuantity, order.unit),
          orderQuantityText: formatQuantity(order.recommendedQuantity, order.unit),
          unitPriceText: `${formatNumber(order.price)}원 / 1${order.unit}`,
          supplyAmount,
          taxAmount,
          totalAmount,
        }
      }),
    [selectedOrders],
  )

  const orderSummary = useMemo(() => {
    const supplyAmount = orderSheetRows.reduce((sum, row) => sum + row.supplyAmount, 0)
    const taxAmount = orderSheetRows.reduce((sum, row) => sum + row.taxAmount, 0)
    const totalAmount = orderSheetRows.reduce((sum, row) => sum + row.totalAmount, 0)
    return { supplyAmount, taxAmount, totalAmount }
  }, [orderSheetRows])

  const toggleSupplier = (ingredientId: string, supplierId: string) => {
    const key = `${ingredientId}-${supplierId}`
    setSelectedSuppliers((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const handleServingQtyChange = (menuId: string, value: string) => {
    setServingQtyByMenuId((current) => ({
      ...current,
      [menuId]: sanitizeServingQty(Number(value)),
    }))
  }

  const closeModal = () => setIsOrderModalOpen(false)

  const submitOrder = () => {
    setSelectedSuppliers({})
    setIsOrderModalOpen(false)
  }

  const printOrderSheet = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="food-order-page">
      <main className="food-order-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="식자재 발주"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '발주 관리', to: '/order_manager' },
                { label: '식자재 발주' },
              ]}
            />
          }
        >
          <section className="food-order-filters">
            <div className="food-order-field">
              <label htmlFor="category">식사 분류</label>
              <select
                id="category"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value as MenuCategory)}
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {getCategoryLabel(option)}
                  </option>
                ))}
              </select>
            </div>
            <form className="food-order-item-search" onSubmit={handleItemSearch}>
              <label>사업장코드<input value={soldTo} maxLength={10} autoComplete="off" onChange={(event) => setSoldTo(event.target.value.trimStart())} placeholder="최대 10자리" /></label>
              <label>품목코드<input value={itemCode} maxLength={18} autoComplete="off" onChange={(event) => setItemCode(event.target.value.trimStart())} placeholder="최대 18자리" /></label>
              <label>입고일자<input value={reqDeliveryDate} maxLength={8} inputMode="numeric" autoComplete="off" onChange={(event) => setReqDeliveryDate(event.target.value.replace(/\D/g, ''))} placeholder="YYYYMMDD" /></label>
              <button type="submit" disabled={isLookupLoading}>품목 조회</button>
            </form>
          </section>

          <section className="food-order-layout">
            <aside className="food-order-panel food-order-panel--menu">
              <div className="food-order-panel__header">
                <h2>조회 메뉴</h2>
                <span>{filteredMenus.length}건</span>
              </div>
              <div className="food-order-menu-list">
                {isMenuListLoading ? <LoadingScreen compact message="메뉴 목록을 불러오는 중입니다." /> : null}
                {!isMenuListLoading && menuListError ? (
                  <div className="food-order-empty">API 호출에 실패하여 임시 메뉴를 표시합니다.</div>
                ) : null}
                {!isMenuListLoading && filteredMenus.length > 0
                  ? filteredMenus.map((menu) => (
                      <div
                        key={menu.menu_id}
                        className={`food-order-menu-card${activeMenuSummary?.menu_id === menu.menu_id ? ' is-active' : ''}`}
                      >
                        <button
                          type="button"
                          className="food-order-menu-item"
                          onClick={() => setSelectedMenuId(menu.menu_id)}
                        >
                          <strong>{menu.menu_name}</strong>
                          <span>{menu.created_at || '등록일 정보 없음'}</span>
                        </button>
                        <label className="food-order-menu-serving" htmlFor={`servingQty-${menu.menu_id}`}>
                          <input
                            id={`servingQty-${menu.menu_id}`}
                            type="number"
                            min="1"
                            step="1"
                            value={servingQtyByMenuId[menu.menu_id] ?? 1}
                            onChange={(event) => handleServingQtyChange(menu.menu_id, event.target.value)}
                          />
                          <span>인분</span>
                        </label>
                      </div>
                    ))
                  : null}
                {!isMenuListLoading && filteredMenus.length === 0 ? (
                  <div className="food-order-empty">선택한 분류에 해당하는 메뉴가 없습니다.</div>
                ) : null}
              </div>
            </aside>

            <section className="food-order-panel food-order-panel--ingredients">
              <div className="food-order-panel__header">
                <h2>식자재 상세</h2>
                <span>{activeMenu ? `${activeMenu.menu_name} / ${activeServingQty}인분` : '메뉴를 선택하세요.'}</span>
              </div>
              {isDetailLoading ? <LoadingScreen compact message="식자재 상세 목록을 불러오는 중입니다." /> : null}
              {!isDetailLoading && detailError ? (
                <div className="food-order-empty">API 호출에 실패하여 임시 식자재 데이터를 표시합니다.</div>
              ) : null}
              {activeMenu ? (
                activeMenu.ingredients.length > 0 ? (
                  <div className="food-order-table-scroll">
                    <table className="food-order-table">
                      <thead>
                        <tr>
                          <th style={{ display: 'none' }}>메뉴 ID</th>
                          <th style={{ display: 'none' }}>식자재 ID</th>
                          <th>식자재명</th>
                          <th>필요 수량/단위</th>
                          <th>현재고</th>
                          <th>부족재고</th>
                          <th>발주 필요 수량</th>
                          <th style={{ display: 'none' }}>기본 단위</th>
                          <th>발주 단위</th>
                          <th>환산값</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMenu.ingredients.map((ingredient) => (
                          <tr key={`${ingredient.menu_id}-${ingredient.ingredient_id}`}>
                            <td style={{ display: 'none' }}>{ingredient.menu_id}</td>
                            <td style={{ display: 'none' }}>{ingredient.ingredient_id}</td>
                            <td>{ingredient.ingredient_name}</td>
                            <td>{ingredient.required_qty}({ingredient.base_unit})</td>
                            <td>{ingredient.current_qty}</td>
                            <td>{ingredient.shortage_qty}</td>
                            <td>{ingredient.order_needed_qty}</td>
                            <td style={{ display: 'none' }}>{ingredient.base_unit}</td>
                            <td>{ingredient.order_unit}</td>
                            <td>{ingredient.convert_value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="food-order-empty">선택한 메뉴의 식자재 상세 정보가 없습니다.</div>
                )
              ) : (
                <div className="food-order-empty">왼쪽 목록에서 메뉴를 선택하면 식자재를 확인할 수 있습니다.</div>
              )}
              <div className="food-order-lookup">
                <div className="food-order-lookup__title">
                  <strong>제휴사 품목 조회 결과</strong>
                  <span>{isLookupLoading ? '통신 중…' : `${lookupItems.length}건`}</span>
                </div>
                {lookupError ? <div className="food-order-lookup__error">{lookupError}</div> : null}
                {lookupItems.length > 0 ? (
                  <div className="food-order-table-scroll">
                    <table className="food-order-table">
                      <thead><tr><th>품목코드</th><th>품목명</th><th>규격</th><th>단위</th><th>가격</th><th>리드타임</th><th>최소발주</th><th>원산지</th><th>STOP</th></tr></thead>
                      <tbody>{lookupItems.map((item, index) => (
                        <tr key={`${item.itemCode}-${index}`}>
                          <td>{item.itemCode}</td><td>{item.itemName || '-'}</td><td>{item.standard || '-'}</td>
                          <td>{item.unit || '-'}</td><td>{formatNumber(item.price)}</td><td>{item.leadTime}</td>
                          <td>{item.minQntty}</td><td>{item.origin || '-'}</td><td>{item.stopType || '-'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : !isLookupLoading ? <div className="food-order-empty">조회된 제휴사 품목이 없습니다.</div> : null}
              </div>
            </section>

            <aside className="food-order-panel food-order-panel--suppliers">
              <div className="food-order-panel__header">
                <h2>주문 가능한 업체</h2>
                <span>체크 후 발주서를 생성합니다.</span>
              </div>
              {activeMenu ? (
                <>
                  <div className="supplier-list">
                    {activeMenu.ingredients.length === 0 ? (
                      <div className="food-order-empty">업체 정보가 연결된 식자재가 없습니다.</div>
                    ) : null}
                    {activeMenu.ingredients.map((ingredient) => {
                      const shortage = ingredient.shortage_qty

                      return (
                        <article key={ingredient.ingredient_id} className="supplier-card">
                          <div className="supplier-card__title">
                            <strong>{ingredient.ingredient_name}</strong>
                            <span>
                              필요 {formatQuantity(ingredient.required_qty, ingredient.base_unit)} / 재고{' '}
                              {formatQuantity(ingredient.current_qty, ingredient.base_unit)} / 부족{' '}
                              {formatQuantity(shortage, ingredient.base_unit)}
                            </span>
                          </div>
                          <div className="supplier-card__rows">
                            {ingredient.suppliers.length > 0 ? (
                              ingredient.suppliers.map((supplier) => {
                                const checkboxId = `supplier-${ingredient.ingredient_id}-${supplier.menu_id}`

                                return (
                                  <label
                                    key={supplier.menu_id}
                                    className="supplier-row supplier-row--detail"
                                    htmlFor={checkboxId}
                                  >
                                    <input
                                      id={checkboxId}
                                      type="checkbox"
                                      checked={Boolean(selectedSuppliers[`${ingredient.ingredient_id}-${supplier.menu_id}`])}
                                      onChange={() => toggleSupplier(ingredient.ingredient_id, supplier.menu_id)}
                                    />
                                    <div className="supplier-row__main">
                                      <strong>{supplier.menu_name}</strong>
                                      <span>
                                        {formatNumber(supplier.price)}원 / 1{ingredient.order_unit || ingredient.base_unit}
                                      </span>
                                    </div>
                                    <div className="supplier-row__meta">
                                      <span>필요량 {formatQuantity(ingredient.required_qty, ingredient.base_unit)}</span>
                                      <span>재고량 {formatQuantity(ingredient.current_qty, ingredient.base_unit)}</span>
                                      <span>부족수량 {formatQuantity(shortage, ingredient.base_unit)}</span>
                                      <span>
                                        권장발주{' '}
                                        {formatQuantity(
                                          ingredient.order_needed_qty || supplier.recommendedQuantity,
                                          ingredient.order_unit || ingredient.base_unit,
                                        )}
                                      </span>
                                    </div>
                                  </label>
                                )
                              })
                            ) : (
                              <div className="food-order-empty">등록된 공급업체가 없습니다.</div>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  <div className="supplier-action-bar">
                    <div className="supplier-action-bar__summary">선택 업체 {selectedOrders.length}건</div>
                    <button
                      type="button"
                      className="supplier-action-bar__button"
                      disabled={selectedOrders.length === 0}
                      onClick={() => setIsOrderModalOpen(true)}
                    >
                      발주하기
                    </button>
                  </div>
                </>
              ) : (
                <div className="food-order-empty">메뉴를 선택하면 주문 가능한 업체를 확인할 수 있습니다.</div>
              )}
            </aside>
          </section>
        </SideMenuLayout>
      </main>

      {isOrderModalOpen ? (
        <div className="order-modal-backdrop" role="presentation" onClick={closeModal}>
          <section
            className="order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="order-modal__header no-print">
              <div>
                <p className="order-modal__eyebrow">Transaction Statement Style</p>
                <h2 id="order-modal-title">발주서</h2>
              </div>
              <span>{activeMenu?.menu_name}</span>
            </div>

            <div className="order-sheet">
              <header className="order-sheet__top">
                <div>
                  <p className="order-sheet__label">발주일자</p>
                  <strong>{getCurrentDate()}</strong>
                </div>
                <div className="order-sheet__title-wrap">
                  <h3>발주서</h3>
                  <p>거래명세서 형식</p>
                </div>
                <div>
                  <p className="order-sheet__label">문서번호</p>
                  <strong>FO-{activeMenu?.menu_id ?? '0'}-{selectedOrders.length}</strong>
                </div>
              </header>

              <section className="order-sheet__parties">
                <div className="order-sheet__party">
                  <h4>공급받는 곳</h4>
                  <dl>
                    <div><dt>상호</dt><dd>더풀 급식 운영팀</dd></div>
                    <div><dt>담당</dt><dd>영양 운영 파트</dd></div>
                    <div><dt>연락처</dt><dd>02-3456-7890</dd></div>
                    <div><dt>주문 메뉴</dt><dd>{activeMenu?.menu_name}</dd></div>
                  </dl>
                </div>
                <div className="order-sheet__party">
                  <h4>공급 정보</h4>
                  <dl>
                    <div><dt>업체 수</dt><dd>{selectedOrders.length}건 선택</dd></div>
                    <div><dt>식사분류</dt><dd>{getCategoryLabel(selectedCategory)}</dd></div>
                    <div><dt>식사구분</dt><dd>{activeMenu?.mealType ?? '-'}</dd></div>
                    <div><dt>인분기준</dt><dd>{activeMenu?.servings ? `${activeMenu.servings}인분` : '-'}</dd></div>
                  </dl>
                </div>
              </section>

              <div className="order-sheet__body">
                <table className="order-sheet__table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>품목명</th>
                      <th>업체명</th>
                      <th>단가</th>
                      <th>필요수량</th>
                      <th>재고수량</th>
                      <th>부족수량</th>
                      <th>발주수량</th>
                      <th>공급가액</th>
                      <th>부가세</th>
                      <th>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderSheetRows.map((row) => (
                      <tr key={`${row.ingredientmenu_id}-${row.suppliermenu_id}`}>
                        <td>{row.index}</td>
                        <td>{row.ingredientmenu_name}</td>
                        <td>{row.suppliermenu_name}</td>
                        <td>{row.unitPriceText}</td>
                        <td>{row.requiredQuantityText}</td>
                        <td>{row.stockQuantityText}</td>
                        <td>{row.shortageQuantityText}</td>
                        <td>{row.orderQuantityText}</td>
                        <td>{formatNumber(row.supplyAmount)}원</td>
                        <td>{formatNumber(row.taxAmount)}원</td>
                        <td>{formatNumber(row.totalAmount)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <section className="order-sheet__summary">
                <div className="order-sheet__summary-card">
                  <span>공급가액</span>
                  <strong>{formatNumber(orderSummary.supplyAmount)}원</strong>
                </div>
                <div className="order-sheet__summary-card">
                  <span>부가세</span>
                  <strong>{formatNumber(orderSummary.taxAmount)}원</strong>
                </div>
                <div className="order-sheet__summary-card is-total">
                  <span>총 합계</span>
                  <strong>{formatNumber(orderSummary.totalAmount)}원</strong>
                </div>
              </section>

              <section className="order-sheet__memo">
                <div>
                  <span>비고</span>
                  <p>현재고를 반영한 임시 발주서입니다. 실제 운영 데이터와 공급 일정 연동은 추가 구현이 필요합니다.</p>
                </div>
                <div className="order-sheet__sign">
                  <span>확인</span>
                  <div>영양팀 / 운영담당</div>
                </div>
              </section>
            </div>

            <div className="order-modal__actions no-print">
              <button type="button" className="order-modal__button is-secondary" onClick={printOrderSheet}>
                인쇄
              </button>
              <button type="button" className="order-modal__button is-secondary" onClick={closeModal}>
                취소
              </button>
              <button type="button" className="order-modal__button is-primary" onClick={submitOrder}>
                발주
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default FoodOrder
