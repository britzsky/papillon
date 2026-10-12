import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import {
  getIngredientMasterList,
  saveIngredientMasters,
  type IngredientMasterItem,
} from '../../api/inventory'
import { MENU_PAGE_SIZE, qtyUnitOptions } from '../operations/menuManagerShared'
import '../operations/MenuManager.css'

type EditableIngredientMasterItem = IngredientMasterItem & { row_id: string }


const storageOptions = [
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

function isChanged(item: EditableIngredientMasterItem, originals: Record<string, EditableIngredientMasterItem>) {
  const original = originals[item.row_id]
  if (!original) return true
  return ['ingredient_name', 'category_name', 'storage_type', 'base_unit', 'note']
    .some((field) => item[field as keyof EditableIngredientMasterItem] !== original[field as keyof EditableIngredientMasterItem])
}

function createRow(index: number): EditableIngredientMasterItem {
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
    is_new: true,
  }
}


function IngredientMasterManager() {
  const [items, setItems] = useState<EditableIngredientMasterItem[]>([])
  const [originals, setOriginals] = useState<Record<string, EditableIngredientMasterItem>>({})
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [storageType, setStorageType] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [alert, setAlert] = useState<AppAlertState | null>(null)
  const loadItems = async () => {
    const loaded = (await getIngredientMasterList()).map(toEditable)
    setItems(loaded)
    setOriginals(snapshot(loaded))
  }

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError('')
    void getIngredientMasterList()
      .then((loaded) => {
        if (!mounted) return
        const editable = loaded.map(toEditable)
        setItems(editable)
        setOriginals(snapshot(editable))
      })
      .catch((loadError) => mounted && setError(loadError instanceof Error ? loadError.message : '식자재 마스터를 불러오지 못했습니다.'))
      .finally(() => mounted && setIsLoading(false))
    return () => { mounted = false }
  }, [])


  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category_name).filter(Boolean))).sort(),
    [items],
  )
  const filteredItems = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return items.filter((item) =>
      (!query || [item.ingredient_id, item.ingredient_name, item.category_name]
        .some((value) => value.toLowerCase().includes(query))) &&
      (!category || item.category_name === category) &&
      (!storageType || item.storage_type === storageType),
    )
  }, [category, items, keyword, storageType])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / MENU_PAGE_SIZE))
  const pagedItems = filteredItems.slice((currentPage - 1) * MENU_PAGE_SIZE, currentPage * MENU_PAGE_SIZE)

  useEffect(() => setCurrentPage(1), [keyword, category, storageType])
  useEffect(() => setCurrentPage((page) => Math.min(page, totalPages)), [totalPages])

  const updateItem = (rowId: string, patch: Partial<EditableIngredientMasterItem>) => {
    setItems((current) => current.map((item) => item.row_id === rowId ? { ...item, ...patch } : item))
  }

  const handleSave = async () => {
    const changed = items.filter((item) => isChanged(item, originals))
    if (changed.length === 0) {
      setAlert({ type: 'success', title: '변경 없음', message: '저장할 변경 사항이 없습니다.' })
      return
    }
    if (changed.some((item) => !item.ingredient_name.trim() || !item.base_unit)) {
      setAlert({ type: 'error', title: '저장 불가', message: '식자재명과 기준단위를 확인해주세요.' })
      return
    }
    try {
      setIsSaving(true)
      setAlert(null)
      await saveIngredientMasters(changed)
      await loadItems()
      setAlert({ type: 'success', title: '저장 완료', message: '본사 식자재 마스터를 저장했습니다.' })
    } catch (saveError) {
      setAlert({ type: 'error', title: '저장 실패', message: saveError instanceof Error ? saveError.message : '저장에 실패했습니다.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="menu-manager-page">
      {isSaving ? (
        <LoadingScreen overlay message={'식자재 정보를 저장하고 있습니다.'} />
      ) : null}
      <main className="menu-manager-content">
        <SideMenuLayout header={<HeaderBar title="식자재 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '재고관리' }, { label: '식자재 관리' }]} />}>
          <section className="menu-manager-filters">
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field"><label htmlFor="ingredient-master-keyword">검색</label><input id="ingredient-master-keyword" value={keyword} placeholder="식자재명, ID" onChange={(event) => setKeyword(event.target.value)} /></div>
              <div className="menu-manager-field"><label htmlFor="ingredient-master-category">카테고리</label><select id="ingredient-master-category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">전체</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="menu-manager-field"><label htmlFor="ingredient-master-storage">보관유형</label><select id="ingredient-master-storage" value={storageType} onChange={(event) => setStorageType(event.target.value)}><option value="">전체</option>{storageOptions.map((item) => <option key={item.value} value={item.value}>{item.text}</option>)}</select></div>
            </div>
            <div className="menu-manager-filters__actions">
              <button type="button" className="menu-manager-add-button" onClick={() => { setItems((current) => [createRow(current.length + 1), ...current]); setCurrentPage(1) }}>행 추가</button>
              <button type="button" className="menu-manager-save-button" disabled={isSaving} onClick={() => void handleSave()}>{isSaving ? '저장 중...' : '저장'}</button>
            </div>
          </section>
          <section className="menu-manager-layout account-inventory-layout ingredient-master-layout">
            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header"><div><h2>본사 식자재 마스터</h2><p>표준 식자재를 관리합니다. 실제 공급상품은 거래처 식자재 관리에서 설정합니다.</p><span>{filteredItems.length}건</span></div></div>
              <div className="menu-manager-table-scroll">
                {isLoading ? <LoadingScreen compact message="식자재 마스터를 불러오는 중입니다." /> : null}
                {!isLoading && error ? <div className="menu-manager-empty">{error}</div> : null}
                {!isLoading && !error && pagedItems.length > 0 ? (
                  <table className="menu-manager-table ingredient-master-table">
                    <thead><tr><th>ID</th><th>식자재명</th><th>카테고리</th><th>보관유형</th><th>기준단위</th><th>비고</th></tr></thead>
                    <tbody>{pagedItems.map((item) => {
                      const dirty = isChanged(item, originals)
                      return <tr key={item.row_id} className={dirty ? 'is-dirty' : undefined}>
                        <td title={item.ingredient_id}>{item.ingredient_id}</td>
                        <td><input className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.ingredient_name} onChange={(event) => updateItem(item.row_id, { ingredient_name: event.target.value })} /></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.category_name} onChange={(event) => updateItem(item.row_id, { category_name: event.target.value })}><option value="">카테고리 선택</option>{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.storage_type} onChange={(event) => updateItem(item.row_id, { storage_type: event.target.value })}>{storageOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}</select></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.base_unit} onChange={(event) => updateItem(item.row_id, { base_unit: event.target.value })}>{qtyUnitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                        <td><input className="menu-manager-cell-input" value={item.note} onChange={(event) => updateItem(item.row_id, { note: event.target.value })} /></td>
                      </tr>
                    })}</tbody>
                  </table>
                ) : null}
                {!isLoading && !error && filteredItems.length === 0 ? <div className="menu-manager-empty">조회 조건에 맞는 식자재가 없습니다.</div> : null}
                {!isLoading && !error && filteredItems.length > 0 ? <div className="menu-manager-pagination"><span className="menu-manager-pagination__summary">{Math.min((currentPage - 1) * MENU_PAGE_SIZE + 1, filteredItems.length)}-{Math.min(currentPage * MENU_PAGE_SIZE, filteredItems.length)} / {filteredItems.length}</span><div className="menu-manager-pagination__actions"><button className="menu-manager-pagination__button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>처음</button><button className="menu-manager-pagination__button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>이전</button><span className="menu-manager-pagination__page">{currentPage} / {totalPages}</span><button className="menu-manager-pagination__button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages}>다음</button><button className="menu-manager-pagination__button" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>마지막</button></div></div> : null}
              </div>
            </section>
          </section>
        </SideMenuLayout>
      </main>
      <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </div>
  )
}

export default IngredientMasterManager
