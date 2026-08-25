import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import {
  getIngredientMasterList,
  getLocalUserId,
  saveIngredientMasters,
  type IngredientMasterItem,
} from '../../api/inventory'
import {
  createSupplierProductWithPrice,
  getSuppliers,
  type SupplierOption,
} from '../../api/supplierCatalog'
import { MENU_PAGE_SIZE, parseNumber, qtyUnitOptions } from '../operations/menuManagerShared'
import '../operations/MenuManager.css'

type EditableIngredientMasterItem = IngredientMasterItem & { row_id: string }

type ProductEditor = {
  ingredient: EditableIngredientMasterItem
  supplier_id: string
  supplier_item_code: string
  product_name: string
  order_unit: string
  package_qty: number
  package_unit: string
  base_qty: number
  base_unit: string
  purchase_price: number
}

const storageOptions = [
  { value: 'ROOM', text: '상온' },
  { value: 'COLD', text: '냉장' },
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
  return ['ingredient_name', 'category_name', 'storage_type', 'base_unit', 'order_unit', 'convert_value', 'safe_stock_qty', 'note']
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
    product_name: '',
    purchase_price: 0,
    package_base_qty: 0,
    is_new: true,
  }
}

function formatMoney(value: number) {
  return value > 0 ? `${Math.round(value).toLocaleString('ko-KR')}원` : '가격 미등록'
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
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [productEditor, setProductEditor] = useState<ProductEditor | null>(null)
  const [isSavingProduct, setIsSavingProduct] = useState(false)

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

  useEffect(() => {
    void getSuppliers()
      .then(setSuppliers)
      .catch((loadError) => setAlert({ type: 'error', title: '공급처 조회 실패', message: loadError instanceof Error ? loadError.message : '공급처 목록을 불러오지 못했습니다.' }))
  }, [])

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category_name).filter(Boolean))).sort(),
    [items],
  )
  const orderUnitOptions = useMemo(
    () => Array.from(new Set([...qtyUnitOptions, ...items.map((item) => item.order_unit).filter(Boolean)])),
    [items],
  )
  const filteredItems = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return items.filter((item) =>
      (!query || [item.ingredient_id, item.ingredient_name, item.category_name, item.product_name]
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
    if (changed.some((item) => !item.ingredient_name.trim() || !item.base_unit || item.convert_value <= 0)) {
      setAlert({ type: 'error', title: '저장 불가', message: '식자재명·기준단위와 0보다 큰 환산값을 확인해주세요.' })
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

  const openProductEditor = (item: EditableIngredientMasterItem) => {
    if (item.is_new) {
      setAlert({ type: 'error', title: '식자재 저장 필요', message: '신규 식자재를 먼저 저장한 뒤 공급상품을 등록해주세요.' })
      return
    }
    setProductEditor({
      ingredient: item,
      supplier_id: suppliers[0]?.supplier_id ? String(suppliers[0].supplier_id) : '',
      supplier_item_code: '',
      product_name: item.product_name || item.ingredient_name,
      order_unit: item.order_unit || 'kg',
      package_qty: 1,
      package_unit: item.order_unit || 'kg',
      base_qty: item.convert_value > 0 ? item.convert_value : 1,
      base_unit: item.base_unit || 'g',
      purchase_price: item.purchase_price || 0,
    })
  }

  const saveProductAndPrice = async () => {
    if (!productEditor) return
    if (!productEditor.supplier_id || !productEditor.supplier_item_code.trim() || !productEditor.product_name.trim()) {
      setAlert({ type: 'error', title: '입력 확인', message: '공급처, 상품코드와 상품명을 입력해주세요.' })
      return
    }
    if (productEditor.package_qty <= 0 || productEditor.base_qty <= 0 || productEditor.purchase_price <= 0) {
      setAlert({ type: 'error', title: '입력 확인', message: '포장수량, 기준용량과 포장가격은 0보다 커야 합니다.' })
      return
    }
    try {
      setIsSavingProduct(true)
      await createSupplierProductWithPrice({
        supplier_id: Number(productEditor.supplier_id),
        ingredient_id: productEditor.ingredient.ingredient_id,
        supplier_item_code: productEditor.supplier_item_code.trim(),
        product_name: productEditor.product_name.trim(),
        order_unit: productEditor.order_unit,
        package_qty: productEditor.package_qty,
        package_unit: productEditor.package_unit,
        base_qty: productEditor.base_qty,
        base_unit: productEditor.base_unit,
        purchase_price: productEditor.purchase_price,
        effective_from: `${new Date().toLocaleDateString('sv-SE')} 00:00:00`,
        user_id: getLocalUserId(),
      })
      await loadItems()
      setProductEditor(null)
      setAlert({ type: 'success', title: '등록 완료', message: '공급상품과 현재 포장가격을 등록했습니다.' })
    } catch (saveError) {
      setAlert({ type: 'error', title: '등록 실패', message: saveError instanceof Error ? saveError.message : '공급상품 등록에 실패했습니다.' })
    } finally {
      setIsSavingProduct(false)
    }
  }

  return (
    <div className="menu-manager-page">
      <main className="menu-manager-content">
        <SideMenuLayout header={<HeaderBar title="식자재 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '재고관리' }, { label: '식자재 관리' }]} />}>
          <section className="menu-manager-filters">
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field"><label htmlFor="ingredient-master-keyword">검색</label><input id="ingredient-master-keyword" value={keyword} placeholder="식자재명, ID, 상품명" onChange={(event) => setKeyword(event.target.value)} /></div>
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
              <div className="menu-manager-panel__header"><div><h2>본사 식자재 마스터</h2><span>{filteredItems.length}건</span></div></div>
              <div className="menu-manager-table-scroll">
                {isLoading ? <LoadingScreen compact message="식자재 마스터를 불러오는 중입니다." /> : null}
                {!isLoading && error ? <div className="menu-manager-empty">{error}</div> : null}
                {!isLoading && !error && pagedItems.length > 0 ? (
                  <table className="menu-manager-table ingredient-master-table">
                    <thead><tr><th>ID</th><th>식자재명</th><th>카테고리</th><th>보관유형</th><th>기준단위</th><th>발주단위</th><th>환산값</th><th>안전재고</th><th>기준상품</th><th>포장가격</th><th>기준단가</th><th>상품/가격</th></tr></thead>
                    <tbody>{pagedItems.map((item) => {
                      const dirty = isChanged(item, originals)
                      const unitPrice = item.purchase_price > 0 && item.package_base_qty > 0 ? item.purchase_price / item.package_base_qty : 0
                      return <tr key={item.row_id} className={dirty ? 'is-dirty' : undefined}>
                        <td title={item.ingredient_id}>{item.ingredient_id}</td>
                        <td><input className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.ingredient_name} onChange={(event) => updateItem(item.row_id, { ingredient_name: event.target.value })} /></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.category_name} onChange={(event) => updateItem(item.row_id, { category_name: event.target.value })}><option value="">카테고리 선택</option>{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.storage_type} onChange={(event) => updateItem(item.row_id, { storage_type: event.target.value })}>{storageOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}</select></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.base_unit} onChange={(event) => updateItem(item.row_id, { base_unit: event.target.value })}>{qtyUnitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.order_unit} onChange={(event) => updateItem(item.row_id, { order_unit: event.target.value })}><option value="">발주단위 선택</option>{orderUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></td>
                        <td><input className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} type="number" min="0.0001" step="0.01" value={item.convert_value} onChange={(event) => updateItem(item.row_id, { convert_value: parseNumber(event.target.value) })} /></td>
                        <td><input className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} type="number" min="0" step="0.01" value={item.safe_stock_qty} onChange={(event) => updateItem(item.row_id, { safe_stock_qty: parseNumber(event.target.value) })} /></td>
                        <td title={`${item.supplier_name} ${item.product_name}`}>{item.product_name || '상품 미연결'}</td>
                        <td>{formatMoney(item.purchase_price)}</td><td>{unitPrice > 0 ? `${unitPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/${item.base_unit}` : '미산정'}</td>
                        <td><button type="button" className="menu-manager-select-button" onClick={() => openProductEditor(item)}>{item.purchase_price > 0 ? '추가 등록' : '등록'}</button></td>
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
      {productEditor ? <div className="ingredient-product-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSavingProduct) setProductEditor(null) }}>
        <section className="ingredient-product-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="ingredient-product-title">
          <header><div><h2 id="ingredient-product-title">공급상품·가격 등록</h2><p>{productEditor.ingredient.ingredient_name} ({productEditor.ingredient.ingredient_id})</p></div><button type="button" disabled={isSavingProduct} onClick={() => setProductEditor(null)}>×</button></header>
          <div className="ingredient-product-modal__grid">
            <label><span>공급처</span><select value={productEditor.supplier_id} onChange={(event) => setProductEditor({ ...productEditor, supplier_id: event.target.value })}><option value="">공급처 선택</option>{suppliers.map((supplier) => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.supplier_name} ({supplier.supplier_code})</option>)}</select></label>
            <label><span>공급상품 코드</span><input value={productEditor.supplier_item_code} onChange={(event) => setProductEditor({ ...productEditor, supplier_item_code: event.target.value })} /></label>
            <label className="is-wide"><span>공급상품명</span><input value={productEditor.product_name} onChange={(event) => setProductEditor({ ...productEditor, product_name: event.target.value })} /></label>
            <label><span>발주 단위</span><select value={productEditor.order_unit} onChange={(event) => setProductEditor({ ...productEditor, order_unit: event.target.value })}>{orderUnitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label><span>포장 수량</span><input type="number" min="0.0001" step="0.01" value={productEditor.package_qty} onChange={(event) => setProductEditor({ ...productEditor, package_qty: parseNumber(event.target.value) })} /></label>
            <label><span>포장 단위</span><select value={productEditor.package_unit} onChange={(event) => setProductEditor({ ...productEditor, package_unit: event.target.value })}>{orderUnitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label><span>포장당 기준용량</span><input type="number" min="0.0001" step="0.01" value={productEditor.base_qty} onChange={(event) => setProductEditor({ ...productEditor, base_qty: parseNumber(event.target.value) })} /></label>
            <label><span>기준 단위</span><select value={productEditor.base_unit} onChange={(event) => setProductEditor({ ...productEditor, base_unit: event.target.value })}>{qtyUnitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label><span>포장가격(원)</span><input type="number" min="1" step="1" value={productEditor.purchase_price} onChange={(event) => setProductEditor({ ...productEditor, purchase_price: parseNumber(event.target.value) })} /></label>
          </div>
          <footer><span>기준단가 {productEditor.purchase_price > 0 && productEditor.base_qty > 0 ? `${(productEditor.purchase_price / productEditor.base_qty).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/${productEditor.base_unit}` : '미산정'}</span><div><button type="button" disabled={isSavingProduct} onClick={() => setProductEditor(null)}>취소</button><button type="button" className="is-primary" disabled={isSavingProduct} onClick={() => void saveProductAndPrice()}>{isSavingProduct ? '등록 중...' : '상품·가격 등록'}</button></div></footer>
        </section>
      </div> : null}
      <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </div>
  )
}

export default IngredientMasterManager
