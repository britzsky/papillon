import type { MenuIngredientItem, MenuManagerItem } from '../../api/operations'

export const qtyUnitOptions = ['g', 'L', 'kg', 'ea', 'k', '박스', '캔', '병', '판', '개', '봉', '팩'] as const

const localizedQtyUnits = new Set(['박스', '캔', '병', '판', '개', '봉', '팩'])

export const MENU_PAGE_SIZE = 30
export const mealCategoryOptions = ['한식', '중식', '일식', '양식', '분식', '간식', '기타'] as const
export const menuTypeOptions = [
  { value: '0', text: '주메뉴' },
  { value: '1', text: '부메뉴' },
  { value: '2', text: '후식/간식' },
  { value: '3', text: '음료' },
  { value: '4', text: '기타' },
] as const
export const menuGubunOptions = [
  { value: '0', text: '밥류/덮밥' },
  { value: '1', text: '탕/찌개/국' },
  { value: '2', text: '무침/생채/겉절이' },
  { value: '3', text: '튀김/까스/강정' },
  { value: '4', text: '구이/스테이크' },
  { value: '5', text: '찜/수육' },
  { value: '6', text: '전/계란/부침' },
  { value: '7', text: '면류' },
  { value: '8', text: '조림' },
  { value: '9', text: '볶음' },
  { value: '10', text: '나물' },
  { value: '11', text: '샐러드' },
  { value: '12', text: '분식/간식' },
  { value: '13', text: '후식/간식' },
  { value: '14', text: '절임/피클' },
  { value: '15', text: '소스/드레싱' },
  { value: '16', text: '음료' },
  { value: '17', text: '기타 부찬' },
  { value: '18', text: '기타' },
] as const

export type EditableMenuIngredientItem = MenuIngredientItem & {
  row_id: string
}

const foodTypeByMealCategory: Record<(typeof mealCategoryOptions)[number], number> = {
  한식: 1,
  중식: 2,
  일식: 3,
  양식: 4,
  분식: 5,
  간식: 6,
  기타: 7,
}

export function toFoodType(mealCategory: string) {
  return foodTypeByMealCategory[mealCategory as keyof typeof foodTypeByMealCategory] ?? 7
}

export function createClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getToday() {
  return new Date().toISOString().slice(0, 10)
}

export function matchesFilter(value: string, selected: string) {
  return selected === '' || value === selected
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

export function matchesMenuFilters(
  item: MenuManagerItem,
  filters: {
    mealCategory?: string
    keyword?: string
    menuType?: string
    menuGubun?: string
  },
) {
  const normalizedKeyword = normalizeSearchText(filters.keyword ?? '')

  if (!matchesFilter(item.meal_category, filters.mealCategory ?? '')) {
    return false
  }

  if (!matchesFilter(item.menu_type, filters.menuType ?? '')) {
    return false
  }

  if (!matchesFilter(item.menu_gubun, filters.menuGubun ?? '')) {
    return false
  }

  if (normalizedKeyword === '') {
    return true
  }

  return normalizeSearchText(`${item.menu_name} ${item.food_type_reason ?? ''}`).includes(normalizedKeyword)
}

export function parseNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function recalculateQuantities(item: EditableMenuIngredientItem) {
  const shortageQty = Math.max(item.required_qty - item.current_qty, 0)

  return {
    ...item,
    shortage_qty: shortageQty,
    order_needed_qty: shortageQty,
  }
}

export function toEditableDetailItem(item: MenuIngredientItem): EditableMenuIngredientItem {
  return {
    ...item,
    row_id: createClientId('ingredient-row'),
  }
}

export function getNextMenuId(menuItems: MenuManagerItem[]) {
  const parsedItems = menuItems
    .map((item) => {
      const match = item.menu_id.trim().match(/^([A-Za-z]+)(\d+)$/)
      if (!match) return null

      const [, prefix, numericPart] = match
      return {
        prefix,
        numericPart,
        numericValue: Number(numericPart),
      }
    })
    .filter((item): item is { prefix: string; numericPart: string; numericValue: number } => item !== null)

  if (parsedItems.length === 0) {
    return 'M0001'
  }

  const baseItem = parsedItems.reduce((currentMax, item) => {
    if (item.numericValue > currentMax.numericValue) {
      return item
    }

    return currentMax
  })

  const nextValue = String(baseItem.numericValue + 1).padStart(baseItem.numericPart.length, '0')
  return `${baseItem.prefix}${nextValue}`
}

export function createEmptyMenuItemWithNextId(menuItems: MenuManagerItem[], selectedMealCategory: string): MenuManagerItem {
  return {
    menu_id: getNextMenuId(menuItems),
    menu_name: '',
    food_type_reason: '',
    meal_category: selectedMealCategory,
    menu_type: '',
    menu_gubun: '',
    account_id: '',
    account_name: '',
    created_at: getToday(),
    menu_img: '',
    image_url: '',
    image_file_id: '',
    like: 'N',
  }
}

export function createEmptyIngredientItem(menuId: string): EditableMenuIngredientItem {
  return {
    row_id: createClientId('draft-ingredient'),
    recipe_id: '',
    menu_id: menuId,
    ingredient_seq: 0,
    ingredient_id: '',
    location_id: '',
    ingredient_name: '',
    ingredient_name_raw: '',
    ingredient_name_std: '',
    category_name: '',
    required_qty: 0,
    qty_num: 0,
    qty_unit: '',
    qty_raw: '',
    review_flag: '',
    current_qty: 0,
    shortage_qty: 0,
    order_needed_qty: 0,
    base_unit: '',
    order_unit: '',
    convert_value: 1,
    storage_type: '',
    menu_usage_count: 0,
    needs_review: 0,
    note: '',
    safe_stock_qty: 0,
  }
}

export function formatQtyRaw(qtyNum: number, qtyUnit: string) {
  if (!qtyUnit || !localizedQtyUnits.has(qtyUnit)) {
    return ''
  }

  return `${qtyNum}${qtyUnit}`
}

export function getReviewFlag(qtyUnit: string) {
  return localizedQtyUnits.has(qtyUnit) ? 'text_qty' : ''
}

export function buildMenuSnapshotMap(items: MenuManagerItem[]) {
  return items.reduce<Record<string, MenuManagerItem>>((acc, item) => {
    acc[item.menu_id] = { ...item }
    return acc
  }, {})
}

export function buildDetailSnapshotMap(items: EditableMenuIngredientItem[]) {
  return items.reduce<Record<string, EditableMenuIngredientItem>>((acc, item) => {
    acc[item.row_id] = { ...item }
    return acc
  }, {})
}

export function isMenuFieldDirty(
  menu: MenuManagerItem,
  originalMenusById: Record<string, MenuManagerItem>,
  field: keyof Pick<MenuManagerItem, 'menu_name' | 'meal_category' | 'menu_type' | 'menu_gubun' | 'menu_img' | 'image_url' | 'image_file_id'>,
) {
  const original = originalMenusById[menu.menu_id]
  const value = menu[field]
  return original ? value !== original[field] : value instanceof File || value !== ''
}

export function isIngredientFieldDirty(
  item: EditableMenuIngredientItem,
  originalDetailsByMenuId: Record<string, Record<string, EditableMenuIngredientItem>>,
  field: keyof Pick<
    EditableMenuIngredientItem,
    | 'ingredient_id'
    | 'ingredient_name'
    | 'ingredient_name_raw'
    | 'ingredient_name_std'
    | 'category_name'
    | 'required_qty'
    | 'qty_num'
    | 'qty_unit'
    | 'qty_raw'
    | 'review_flag'
    | 'current_qty'
    | 'shortage_qty'
    | 'order_needed_qty'
    | 'base_unit'
    | 'order_unit'
    | 'convert_value'
    | 'storage_type'
    | 'menu_usage_count'
    | 'needs_review'
    | 'note'
    | 'safe_stock_qty'
  >,
) {
  const original = originalDetailsByMenuId[item.menu_id]?.[item.row_id]
  return original ? item[field] !== original[field] : item[field] !== '' && item[field] !== 0
}

function isAccountIngredientDetailChanged(
  detail: EditableMenuIngredientItem,
  originalDetailsByMenuId: Record<string, Record<string, EditableMenuIngredientItem>>,
) {
  const original = originalDetailsByMenuId[detail.menu_id]?.[detail.row_id]

  if (!original) {
    return detail.ingredient_id !== ''
  }

  return (
    detail.ingredient_id !== original.ingredient_id ||
    detail.ingredient_name_raw !== original.ingredient_name_raw ||
    detail.ingredient_name_std !== original.ingredient_name_std ||
    detail.category_name !== original.category_name ||
    detail.base_unit !== original.base_unit ||
    detail.order_unit !== original.order_unit ||
    detail.convert_value !== original.convert_value ||
    detail.storage_type !== original.storage_type ||
    detail.menu_usage_count !== original.menu_usage_count ||
    detail.needs_review !== original.needs_review ||
    detail.note !== original.note ||
    detail.safe_stock_qty !== original.safe_stock_qty
  )
}

export function buildMenuSavePayload(
  menuItems: MenuManagerItem[],
  detailItemsByMenuId: Record<string, EditableMenuIngredientItem[]>,
  originalMenusById: Record<string, MenuManagerItem>,
  originalDetailsByMenuId: Record<string, Record<string, EditableMenuIngredientItem>>,
) {
  const changedMenus = menuItems.filter((item) => {
    const original = originalMenusById[item.menu_id]

    if (!original) {
      return true
    }

    return (
      item.menu_name !== original.menu_name ||
      item.meal_category !== original.meal_category ||
      item.menu_type !== original.menu_type ||
      item.menu_gubun !== original.menu_gubun ||
      item.created_at !== original.created_at ||
      (item.menu_img ?? '') !== (original.menu_img ?? '') ||
      (item.image_url ?? '') !== (original.image_url ?? '') ||
      (item.image_file_id ?? '') !== (original.image_file_id ?? '')
    )
  })

  const changedDetails = menuItems.flatMap((item) =>
    (detailItemsByMenuId[item.menu_id] ?? [])
      .map((detail, index) => ({ detail, sort_order: index + 1 }))
      .filter(({ detail }) => {
        const original = originalDetailsByMenuId[item.menu_id]?.[detail.row_id]

        if (!original) {
          return true
        }

        return (
          detail.ingredient_id !== original.ingredient_id ||
          detail.ingredient_name !== original.ingredient_name ||
          detail.category_name !== original.category_name ||
          detail.required_qty !== original.required_qty ||
          (detail.qty_unit ?? '') !== (original.qty_unit ?? '') ||
          detail.current_qty !== original.current_qty ||
          detail.shortage_qty !== original.shortage_qty ||
          detail.order_needed_qty !== original.order_needed_qty ||
          detail.base_unit !== original.base_unit ||
          detail.order_unit !== original.order_unit ||
          detail.convert_value !== original.convert_value ||
          detail.menu_usage_count !== original.menu_usage_count
        )
      })
      .map(({ detail, sort_order }) => {
        const qtyNum = detail.required_qty
        const qtyUnit = detail.qty_unit ?? ''

        return {
          recipe_id: detail.recipe_id ?? '',
          menu_id: item.menu_id,
          ingredient_seq: sort_order,
          ingredient_id: detail.ingredient_id,
          ingredient_name: detail.ingredient_name,
          category_name: detail.category_name ?? '',
          qty_num: qtyNum,
          qty_unit: qtyUnit,
          qty_raw: formatQtyRaw(qtyNum, qtyUnit),
          review_flag: getReviewFlag(qtyUnit),
          current_qty: detail.current_qty,
          shortage_qty: detail.shortage_qty,
          order_needed_qty: detail.order_needed_qty,
          base_unit: detail.base_unit,
          order_unit: detail.order_unit,
          convert_value: detail.convert_value,
          menu_usage_count: detail.menu_usage_count ?? 0,
        }
      }),
  )

  return {
    menus: changedMenus.map((item, index) => ({
      sort_order: index + 1,
      menu_id: item.menu_id,
      menu_name: item.menu_name,
      food_type: toFoodType(item.meal_category),
      food_type_reason: item.food_type_reason ?? '',
      menu_type: item.menu_type,
      menu_gubun: item.menu_gubun,
      created_at: item.created_at ?? '',
      menu_img: item.menu_img instanceof File ? item.menu_img : item.menu_img ?? item.image_url ?? '',
      image_file_id: item.image_file_id ?? '',
    })),
    menu_details: changedDetails,
  }
}

export function buildAccountMenuSavePayload(
  accountId: string,
  accountName: string,
  mealCategory: string,
  assignedMenus: MenuManagerItem[],
  menuItems: MenuManagerItem[],
  detailItemsByMenuId: Record<string, EditableMenuIngredientItem[]>,
  originalAssignedMenuIds: string[],
  originalMenusById: Record<string, MenuManagerItem>,
  originalDetailsByMenuId: Record<string, Record<string, EditableMenuIngredientItem>>,
) {
  const originalAssignedMenuIdSet = new Set(originalAssignedMenuIds)
  const assignedMenuIdSet = new Set(assignedMenus.map((item) => item.menu_id))
  const menuItemsById = new Map(menuItems.map((item) => [item.menu_id, item]))

  const addedMenus = assignedMenus
    .map((item, index) => ({ item, sort_order: index + 1 }))
    .filter(({ item }) => {
      const original = originalMenusById[item.menu_id]

      return (
        !originalAssignedMenuIdSet.has(item.menu_id) ||
        item.menu_name !== original?.menu_name ||
        item.meal_category !== original?.meal_category ||
        item.menu_type !== original?.menu_type ||
        item.menu_gubun !== original?.menu_gubun
      )
    })
    .map(({ item, sort_order }) => ({
      sort_order,
      menu_id: item.menu_id,
      menu_name: item.menu_name,
      meal_category: item.meal_category,
      food_type: toFoodType(item.meal_category),
      food_type_reason: item.food_type_reason ?? '',
      menu_type: item.menu_type,
      menu_gubun: item.menu_gubun,
      del_yn: 'N',
    }))

  const removed_menu_ids = originalAssignedMenuIds.filter((menuId) => !assignedMenuIdSet.has(menuId))
  const removed_menus = removed_menu_ids.map((menuId) => {
    const item = menuItemsById.get(menuId)

    return {
      sort_order: originalAssignedMenuIds.indexOf(menuId) + 1,
      menu_id: menuId,
      menu_name: item?.menu_name ?? '',
      meal_category: item?.meal_category ?? mealCategory,
      food_type: toFoodType(item?.meal_category ?? mealCategory),
      menu_type: item?.menu_type ?? '',
      menu_gubun: item?.menu_gubun ?? '',
      del_yn: 'Y',
    }
  })
  const menu_details = assignedMenus.flatMap((menu) =>
    (detailItemsByMenuId[menu.menu_id] ?? []).map((detail, index) => {
      const qtyNum = detail.qty_num ?? detail.required_qty
      const qtyUnit = detail.qty_unit ?? ''

      return {
        recipe_id: detail.recipe_id ?? '',
        menu_id: menu.menu_id,
        ingredient_id: detail.ingredient_id,
        location_id: detail.location_id ?? '',
        ingredient_seq: detail.ingredient_seq && detail.ingredient_seq > 0 ? detail.ingredient_seq : index + 1,
        ingredient_name_raw: detail.ingredient_name_raw || detail.ingredient_name,
        qty_raw: detail.qty_raw || formatQtyRaw(qtyNum, qtyUnit),
        qty_num: qtyNum,
        qty_unit: qtyUnit,
        review_flag: getReviewFlag(qtyUnit),
      }
    }),
  )

  const ingredient_detail = assignedMenus.flatMap((menu) =>
    (detailItemsByMenuId[menu.menu_id] ?? [])
      .filter((detail) => isAccountIngredientDetailChanged(detail, originalDetailsByMenuId))
      .map((detail) => ({
        ingredient_id: detail.ingredient_id,
        ingredient_name_raw: detail.ingredient_name_raw || detail.ingredient_name,
        ingredient_name_std: detail.ingredient_name_std || detail.ingredient_name,
        category_name: detail.category_name ?? '',
        base_unit: detail.base_unit,
        order_unit: detail.order_unit || detail.base_unit,
        convert_value: detail.convert_value || 1,
        storage_type: detail.storage_type ?? '',
        menu_usage_count: detail.menu_usage_count ?? 0,
        needs_review:
          detail.needs_review ??
          (detail.review_flag || getReviewFlag(detail.qty_unit ?? '') ? 1 : 0),
        note: detail.note ?? '',
        safe_stock_qty: detail.safe_stock_qty ?? 0,
        created_at: getToday(),
      })),
  )

  return {
    account_id: accountId,
    account_name: accountName,
    meal_category: mealCategory,
    menu_ids: assignedMenus.map((item) => item.menu_id),
    added_menus: addedMenus,
    removed_menu_ids,
    removed_menus,
    menu_details,
    ingredient_detail,
  }
}
