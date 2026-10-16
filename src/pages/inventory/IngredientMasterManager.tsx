import { useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import { STORAGE_OPTIONS as storageOptions, isIngredientChanged as isChanged, useIngredientMaster } from '../../features/inventory/useIngredientMaster'
import { MENU_PAGE_SIZE, qtyUnitOptions } from '../operations/menuManagerShared'
import '../operations/MenuManager.css'

function IngredientMasterManager() {
  const { originals, keyword, setKeyword, category, setCategory, storageType, setStorageType, categories, filteredItems, isLoading, isSaving, error, updateItem, save, addRow } = useIngredientMaster()
  // 조회 조건이 바뀌면 1쪽부터, 건수가 줄면 마지막 쪽으로(상태를 effect로 되돌리지 않고 계산)
  const filterKey = [keyword, category, storageType].join('|')
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const [alert, setAlert] = useState<AppAlertState | null>(null)
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / MENU_PAGE_SIZE))
  const currentPage = pageState.key === filterKey ? Math.min(pageState.page, totalPages) : 1
  const setCurrentPage = (next: number | ((page: number) => number)) => setPageState({ key: filterKey, page: typeof next === 'function' ? next(currentPage) : next })
  const dirtyCount = filteredItems.filter((item) => isChanged(item, originals)).length
  const pagedItems = filteredItems.slice((currentPage - 1) * MENU_PAGE_SIZE, currentPage * MENU_PAGE_SIZE)


  const handleSave = async () => {
    setAlert(null)
    const result = await save()
    setAlert({ type: result.ok ? 'success' : 'error', title: result.title, message: result.message })
  }

  return (
    <div className="menu-manager-page">
      {isSaving ? (
        <LoadingScreen overlay message={'식자재 정보를 저장하고 있습니다.'} />
      ) : null}
      <main className="menu-manager-content">
        <SideMenuLayout header={<HeaderBar title="식자재 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '재고관리' }, { label: '식자재 관리' }]} />}>
          <div className="rd rd-page rd-master">
            <header className="rd-page__head">
              <div>
                <h1 className="rd-sr-only">식자재 관리</h1>
                <p className="rd-muted">본사 표준 식자재를 관리합니다. 실제로 살 상품 연결은 거래처 재고 관리에서 거래처별로 합니다.</p>
              </div>
              <DeadlineAlertSlot />
              <div className="rd-page__actions">
                <button type="button" className="rd-btn" onClick={() => { addRow(); setCurrentPage(1) }}>+ 행 추가</button>
                <button type="button" className="rd-btn is-primary" disabled={isSaving} onClick={() => void handleSave()}>{isSaving ? '저장 중...' : dirtyCount > 0 ? `저장 (${dirtyCount})` : '저장'}</button>
              </div>
            </header>

            <section className="rd-card rd-page__filters">
              <input className="rd-input" type="search" aria-label="검색" value={keyword} placeholder="식자재명·ID" onChange={(event) => setKeyword(event.target.value)} />
              <select className="rd-input" aria-label="카테고리" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">카테고리 전체</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
              <div className="rd-pills" role="group" aria-label="보관유형">
                <button type="button" className={storageType === '' ? 'is-active' : ''} onClick={() => setStorageType('')}>보관 전체</button>
                {storageOptions.filter((item) => item.value).map((item) => <button type="button" key={item.value} className={storageType === item.value ? 'is-active' : ''} onClick={() => setStorageType(item.value)}>{item.text}</button>)}
              </div>
            </section>

            <section className="rd-card rd-page__main">
              <div className="rd-page__list-head"><div><h2 className="rd-h2">본사 식자재 마스터</h2><p className="rd-muted">{filteredItems.length.toLocaleString('ko-KR')}건{dirtyCount > 0 ? ` · 저장 안 한 변경 ${dirtyCount}건` : ''}</p></div></div>
              <div className="rd-page__scroll">
                {isLoading ? <LoadingScreen compact message="식자재 마스터를 불러오는 중입니다." /> : null}
                {!isLoading && error ? <p className="rd-alert">{error}</p> : null}
                {!isLoading && !error && pagedItems.length > 0 ? (
                  <table className="rd-table menu-manager-table ingredient-master-table">
                    <thead><tr><th>ID</th><th>식자재명</th><th>카테고리</th><th>보관유형</th><th>기준단위</th><th>비고</th></tr></thead>
                    <tbody>{pagedItems.map((item) => {
                      const dirty = isChanged(item, originals)
                      return <tr key={item.row_id} className={dirty ? 'is-dirty' : undefined}>
                        <td title={item.ingredient_id} className="rd-muted">{item.ingredient_id}</td>
                        <td><input className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.ingredient_name} onChange={(event) => updateItem(item.row_id, { ingredient_name: event.target.value })} /></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.category_name} onChange={(event) => updateItem(item.row_id, { category_name: event.target.value })}><option value="">카테고리 선택</option>{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.storage_type} onChange={(event) => updateItem(item.row_id, { storage_type: event.target.value })}>{storageOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}</select></td>
                        <td><select className={`menu-manager-cell-input${dirty ? ' is-dirty' : ''}`} value={item.base_unit} onChange={(event) => updateItem(item.row_id, { base_unit: event.target.value })}>{qtyUnitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                        <td><input className="menu-manager-cell-input" value={item.note} onChange={(event) => updateItem(item.row_id, { note: event.target.value })} /></td>
                      </tr>
                    })}</tbody>
                  </table>
                ) : null}
                {!isLoading && !error && filteredItems.length === 0 ? <p className="rd-page__empty">조회 조건에 맞는 식자재가 없습니다.</p> : null}
              </div>
              {!isLoading && !error && filteredItems.length > 0 ? (
                <nav className="rd-page__pager">
                  <span className="rd-muted">{Math.min((currentPage - 1) * MENU_PAGE_SIZE + 1, filteredItems.length)}-{Math.min(currentPage * MENU_PAGE_SIZE, filteredItems.length)} / {filteredItems.length}</span>
                  <button type="button" className="rd-btn is-ghost" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>처음</button>
                  <button type="button" className="rd-btn is-ghost" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>이전</button>
                  <strong>{currentPage} / {totalPages}</strong>
                  <button type="button" className="rd-btn is-ghost" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages}>다음</button>
                  <button type="button" className="rd-btn is-ghost" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>마지막</button>
                </nav>
              ) : null}
            </section>
          </div>
        </SideMenuLayout>
      </main>
      <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </div>
  )
}

export default IngredientMasterManager
