import { useEffect, useMemo, useState } from 'react'
import { getIngredientMasterList, saveIngredientMasters, type IngredientMasterItem } from '../../api/inventory'

export type EditableIngredientMasterItem = IngredientMasterItem & { row_id: string }

export const STORAGE_OPTIONS = [
  { value: 'ROOM', text: '상온' },
  { value: 'REFRIGERATED', text: '냉장' },
  { value: 'FROZEN', text: '냉동' },
  { value: 'OTHER', text: '기타' },
] as const

function toEditable(item: IngredientMasterItem): EditableIngredientMasterItem {
  return { ...item, row_id: item.ingredient_id }
}

function snapshot(items: EditableIngredientMasterItem[]) {
  return Object.fromEntries(items.map((item) => [item.row_id, { ...item }]))
}

export function isIngredientChanged(item: EditableIngredientMasterItem, originals: Record<string, EditableIngredientMasterItem>) {
  const original = originals[item.row_id]
  if (!original) return true
  return ['ingredient_name', 'category_name', 'storage_type', 'base_unit', 'note', 'standard_unit_cost']
    .some((field) => item[field as keyof EditableIngredientMasterItem] !== original[field as keyof EditableIngredientMasterItem])
}

export function createIngredientRow(index: number): EditableIngredientMasterItem {
  return {
    row_id: `new-${Date.now()}-${index}`,
    ingredient_id: `ING${Date.now()}${index}`,
    ingredient_name: '',
    category_name: '',
    storage_type: 'ROOM',
    base_unit: 'g',
    order_unit: 'kg',
    convert_value: 1,
    safe_stock_qty: 0,
    menu_usage_count: 0,
    note: '',
    supplier_name: '',
    supplier_product_id: 0,
    supplier_id: 0,
    supplier_item_code: '',
    product_name: '',
    product_order_unit: '',
    package_qty: 1,
    package_unit: '',
    purchase_price: 0,
    package_base_qty: 0,
    standard_unit_cost: '',
    is_new: true,
  }
}

/** 본사 식자재 마스터(PC 표 편집·터치 카드 편집 공용): 조회·검색·변경 표시·저장 */
export function useIngredientMaster() {
  const [items, setItems] = useState<EditableIngredientMasterItem[]>([])
  const [originals, setOriginals] = useState<Record<string, EditableIngredientMasterItem>>({})
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [storageType, setStorageType] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const apply = (loaded: IngredientMasterItem[]) => {
    const editable = loaded.map(toEditable)
    setItems(editable)
    setOriginals(snapshot(editable))
  }

  useEffect(() => {
    let mounted = true
    void getIngredientMasterList()
      .then((loaded) => { if (mounted) apply(loaded) })
      .catch((loadError) => mounted && setError(loadError instanceof Error ? loadError.message : '식자재 마스터를 불러오지 못했습니다.'))
      .finally(() => mounted && setIsLoading(false))
    return () => { mounted = false }
  }, [])

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category_name).filter(Boolean))).sort(), [items])
  const filteredItems = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return items.filter((item) =>
      (!query || [item.ingredient_id, item.ingredient_name, item.category_name].some((value) => value.toLowerCase().includes(query))) &&
      (!category || item.category_name === category) &&
      (!storageType || item.storage_type === storageType))
  }, [category, items, keyword, storageType])

  const updateItem = (rowId: string, patch: Partial<EditableIngredientMasterItem>) => {
    setItems((current) => current.map((item) => item.row_id === rowId ? { ...item, ...patch } : item))
  }
  const addRow = () => {
    const row = createIngredientRow(items.length + 1)
    setItems((current) => [row, ...current])
    return row
  }

  /**
   * 바뀐 식자재를 저장한다(rows를 주면 그 행만 — 터치 화면의 한 개 저장). 결과는 { ok, title, message }.
   */
  const save = async (rows?: EditableIngredientMasterItem[]) => {
    const changed = (rows ?? items).filter((item) => isIngredientChanged(item, originals))
    if (changed.length === 0) return { ok: true, title: '변경 없음', message: '저장할 변경 사항이 없습니다.' }
    if (changed.some((item) => !item.ingredient_name.trim() || !item.base_unit)) return { ok: false, title: '저장 불가', message: '식자재명과 기준단위를 확인해주세요.' }
    try {
      setIsSaving(true)
      await saveIngredientMasters(changed)
      apply(await getIngredientMasterList())
      return { ok: true, title: '저장 완료', message: '본사 식자재 마스터를 저장했습니다.' }
    } catch (saveError) {
      return { ok: false, title: '저장 실패', message: saveError instanceof Error ? saveError.message : '저장에 실패했습니다.' }
    } finally {
      setIsSaving(false)
    }
  }

  return { items, originals, keyword, setKeyword, category, setCategory, storageType, setStorageType, categories, filteredItems, isLoading, isSaving, error, updateItem, addRow, save }
}
