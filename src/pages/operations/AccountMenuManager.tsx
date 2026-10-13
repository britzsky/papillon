import { planningCostSourceLabels } from '../../utils/planningCost'
import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import AppAlert from '../../components/AppAlert'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import RecipeActionMenu from '../../components/RecipeActionMenu'
import RecipeRegisterModal from '../../components/RecipeRegisterModal'
import RecipeViewModal from '../../components/RecipeViewModal'
import { createAiRecipeGestureHandlers } from '../../components/aiRecipeGesture'
import FavoriteListModal from './FavoriteListModal'
import IngredientSearchSelect from './IngredientSearchSelect'
import IngredientLikeConfirmModal from './IngredientLikeConfirmModal'
import MenuLikeButton from './MenuLikeButton'
import MenuThumbnail from './MenuThumbnail'
import MenuLikeConfirmModal from './MenuLikeConfirmModal'
import { type AccountOption } from '../../api/operations'
import { MENU_PAGE_SIZE, isIngredientFieldDirty, isMenuFieldDirty, mealCategoryOptions, menuGubunOptions, mealPlanTypeOptions, menuTypeOptions, qtyUnitOptions } from './menuManagerShared'
import './MenuManager.css'
import MenuAliasList from '../../components/MenuAliasList'
import { accountIngredientCost, useAccountMenuManager } from '../../features/operations/useAccountMenuManager'

type AccountSearchSelectProps = {
  id: string
  options: AccountOption[]
  placeholder: string
  value: string
  onChange: (accountId: string) => void
}

function AccountSearchSelect({ id, options, placeholder, value, onChange }: AccountSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const searchInputId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState({ top: 0, left: 0, width: 240, maxHeight: 300 })

  useEffect(() => {
    if (!isOpen) return
    const position = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16)
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const upward = below < 180 && above > below
      const maxHeight = Math.max(80, Math.min(300, upward ? above : below))
      setDropdownStyle({ top: upward ? rect.top - maxHeight - 4 : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [isOpen])
  const [query, setQuery] = useState('')


  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node) && !dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus()
    }
  }, [isOpen])

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) =>
      `${option.text} ${option.value}`.toLowerCase().includes(normalizedQuery),
    )
  }, [options, query])

  const handleSelect = (accountId: string) => {
    onChange(accountId)
    setIsOpen(false)
    setQuery('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="menu-manager-search-select" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        id={id}
        type="button"
        className="menu-manager-cell-input menu-manager-search-select__trigger menu-manager-account-select__trigger"
        aria-controls={searchInputId}
        aria-expanded={isOpen}
        onClick={() => { setQuery(''); setIsOpen((current) => !current) }}
      >
        <span>{selectedOption?.text || placeholder}</span>
      </button>

      {isOpen ? createPortal(
        <div ref={dropdownRef} className="menu-manager-search-select__dropdown menu-manager-account-select__dropdown"
          style={{ ...dropdownStyle, position: 'fixed', right: 'auto', zIndex: 10000, overflow: 'auto' }} onKeyDown={handleKeyDown}>
          <input
            id={searchInputId}
            ref={searchInputRef}
            className="menu-manager-search-select__input"
            placeholder="검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="menu-manager-search-select__options">
            <button
              type="button"
              className={`menu-manager-search-select__option${value === '' ? ' is-selected' : ''}`}
              onClick={() => handleSelect('')}
            >
              {placeholder}
            </button>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`menu-manager-search-select__option${option.value === value ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.text || option.value}
                </button>
              ))
            ) : (
              <div className="menu-manager-search-select__empty">검색 결과 없음</div>
            )}
          </div>
        </div>, document.body
      ) : null}
    </div>
  )
}



function AccountMenuManager() {
  const { selectedMealCategory, setSelectedMealCategory, keywordFilter, setKeywordFilter, selectedMenuType, setSelectedMenuType, selectedMenuGubun, setSelectedMenuGubun, selectedAccountId, setSelectedAccountId, accountOptions, accountError, ingredientOptions, ingredientError, originalMenusById, menuError, isMenuLoading, favoriteMenuItems, isFavoriteMenuModalOpen, setIsFavoriteMenuModalOpen, isFavoriteMenuLoading, favoriteIngredientItems, isFavoriteIngredientModalOpen, setIsFavoriteIngredientModalOpen, isFavoriteIngredientLoading, setSelectedMenuId, selectedAvailableMenuIds, originalDetailsByMenuId, detailError, isDetailLoading, accountMenuError, isAccountMenuLoading, alert, setAlert, isSaving, currentPage, setCurrentPage, isDragActive, setIsDragActive, setLikeTargetMenuId, setLikeTargetIngredientId, isSavingLike, recipeMenuState, setRecipeMenuState, recipeViewRequest, setRecipeViewRequest, recipeViewMode, setRecipeViewMode, recipeRegisterRequest, setRecipeRegisterRequest, handleOpenFavoriteMenuModal, filteredMenuItems, assignedMenuIds, originalAssignedMenusById, assignedMenus, removedAssignedMenus, selectedAccountName, ingredientCategoryOptions, totalMenuPages, pagedMenuItems, selectedAvailableAssignableMenuIds, pageSelectableMenuIds, isPageSelectionChecked, isPageSelectionIndeterminate, activeMenu, likeTargetMenu, likeTargetIngredient, activeDetailItems, activeMenuCost, handleAssignMenu, handleAssignSelectedMenus, handleToggleAvailableMenu, handleTogglePageSelection, handleRemoveAssignedMenu, handleAssignedMenuChange, handleRestoreRemovedMenu, handleLikeMenu, handleOpenFavoriteIngredientModal, handleSelectFavoriteMenu, handleSelectFavoriteIngredient, handleLikeIngredient, handleDragStart, handleDrop, handleAddIngredient, handleIngredientCategoryChange, handleIngredientSelect, handleIngredientQtyChange, handleIngredientUnitChange, isRefreshingProducts, refreshLinkedProducts, handleSave, buildRecipeRequest } = useAccountMenuManager()
  return (
    <div className="menu-manager-page">
      {(isSaving || isSavingLike) ? (
        <LoadingScreen overlay message={isSavingLike ? '즐겨찾기를 저장하고 있습니다.' : '거래처 메뉴를 저장하고 있습니다.'} />
      ) : null}
      <main className="menu-manager-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="거래처 메뉴 관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '운영관리', to: '/operations/menu' },
                { label: '거래처 메뉴 관리' },
              ]}
            />
          }
        >
          <section className="menu-manager-filters">
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field">
                <label htmlFor="account-menu-account-id">거래처</label>
                <AccountSearchSelect
                  id="account-menu-account-id"
                  options={accountOptions}
                  placeholder="전체"
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-meal-category">식사분류</label>
                <select
                  id="account-menu-meal-category"
                  value={selectedMealCategory}
                  onChange={(event) => setSelectedMealCategory(event.target.value)}
                >
                  <option value="">전체</option>
                  {mealCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-keyword">키워드</label>
                <input
                  id="account-menu-keyword"
                  type="search"
                  value={keywordFilter}
                  placeholder="메뉴명, 키워드, 레시피 식재료"
                  onChange={(event) => setKeywordFilter(event.target.value)}
                />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-type-filter">메뉴유형</label>
                <select
                  id="account-menu-type-filter"
                  value={selectedMenuType}
                  onChange={(event) => setSelectedMenuType(event.target.value)}
                >
                  <option value="">전체</option>
                  {menuTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="account-menu-gubun-filter">메뉴구분</label>
                <select
                  id="account-menu-gubun-filter"
                  value={selectedMenuGubun}
                  onChange={(event) => setSelectedMenuGubun(event.target.value)}
                >
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
              <button
                type="button"
                className="menu-manager-select-button"
                onClick={() => void handleOpenFavoriteMenuModal()}
                disabled={isMenuLoading || isSaving}
              >
                나만의 메뉴
              </button>
              <button type="button" className="menu-manager-select-button" onClick={() => void handleOpenFavoriteIngredientModal()} disabled={isSaving}>
                나만의 식자재
              </button>
              <button
                type="button"
                className="menu-manager-save-button"
                onClick={() => void handleSave()}
                disabled={!selectedAccountId || isSaving}
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </section>

          <section className="account-menu-manager-layout">
            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>거래처 메뉴 배치</h2>
                  <span>{selectedAccountName || '거래처를 선택하세요.'}</span>
                </div>
              </div>
              {accountError ? <div className="menu-manager-notice">{accountError}</div> : null}
              {accountMenuError ? <div className="menu-manager-notice">{accountMenuError}</div> : null}
              <div
                className={`menu-manager-dropzone${isDragActive ? ' is-drag-active' : ''}`}
                onDragOver={(event) => {
                  if (!selectedAccountId) return
                  event.preventDefault()
                  setIsDragActive(true)
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
              >
                {selectedAccountId ? '오른쪽 메뉴 리스트에서 메뉴를 드래그해 이곳에 놓으세요.' : '거래처를 선택하면 메뉴를 배치할 수 있습니다.'}
              </div>
              {removedAssignedMenus.length > 0 ? (
                <div className="account-menu-removed-list" aria-live="polite">
                  <div className="account-menu-removed-list__header">
                    <strong>저장 시 제거될 메뉴</strong>
                    <span>{removedAssignedMenus.length}건</span>
                  </div>
                  <div className="account-menu-removed-list__items">
                    {removedAssignedMenus.map((item) => (
                      <div key={item.menu_id} className="account-menu-removed-item">
                        <span>{item.menu_name || item.menu_id}</span>
                        {item.meal_category ? <small>{item.meal_category}</small> : null}
                        <button
                          type="button"
                          className="account-menu-removed-item__restore"
                          onClick={() => handleRestoreRemovedMenu(item.menu_id)}
                        >
                          되돌리기
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="menu-manager-table-scroll">
                {isAccountMenuLoading ? <LoadingScreen compact message="거래처 메뉴 목록을 불러오는 중입니다." /> : null}
                {!isAccountMenuLoading && assignedMenus.length > 0 ? (
                  <table className="menu-manager-table">
                    <thead>
                      <tr>
                        <th>메뉴명</th>
                        <th>식사분류</th>
                        <th>메뉴유형</th>
                        <th>메뉴구분</th>
                        <th>식단 유형</th>
                        <th>칼로리(kcal)</th>
                        <th>거래처 1인 예상 원가</th>
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedMenus.map((item) => {
                        const accountCost = item.menu_id === activeMenu?.menu_id
                          ? activeMenuCost.total
                          : item.menu_cost_per_person ?? 0
                        const isAccountCostComplete = item.menu_id === activeMenu?.menu_id
                          ? !isDetailLoading && activeDetailItems.length > 0 && activeMenuCost.missingCount === 0
                          : item.menu_cost_complete !== false && accountCost > 0
                        return (
                        <tr
                          key={item.menu_id}
                          className={item.menu_id === activeMenu?.menu_id ? 'is-active' : ''}
                          onClick={() => setSelectedMenuId(item.menu_id)}
                        >
                          <td>
                            <div className="menu-manager-readonly-cell">
                              <MenuThumbnail zoomable src={item.image_url} name={item.menu_name} />
                              <MenuLikeButton
                                isLiked={item.like === 'Y'}
                                menuName={item.menu_name}
                                onClick={() => setLikeTargetMenuId(item.menu_id)}
                              />
                              <span
                                title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                {...createAiRecipeGestureHandlers(buildRecipeRequest(item), setRecipeMenuState)}
                              >
                                {item.menu_name || '-'}
                              </span>
                            </div>
                          </td>
                          <td>{item.meal_category || '-'}</td>
                          <td>
                            <select
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'menu_type') ? ' is-dirty' : ''}`}
                              value={item.menu_type}
                              onClick={(event) => event.stopPropagation()}
                              onFocus={() => setSelectedMenuId(item.menu_id)}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'menu_type', event.target.value)}
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
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'menu_gubun') ? ' is-dirty' : ''}`}
                              value={item.menu_gubun}
                              onClick={(event) => event.stopPropagation()}
                              onFocus={() => setSelectedMenuId(item.menu_id)}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'menu_gubun', event.target.value)}
                            >
                              <option value="">선택</option>
                              {menuGubunOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.text}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'meal_plan_type') ? ' is-dirty' : ''}`}
                              value={item.meal_plan_type ?? 0}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'meal_plan_type', Number(event.target.value))}
                            >
                              {mealPlanTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'calories_per_serving') ? ' is-dirty' : ''}`}
                              type="number" min="0" step="0.01"
                              value={item.calories_per_serving ?? 0}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => handleAssignedMenuChange(item.menu_id, 'calories_per_serving', Number(event.target.value))}
                            />
                          </td>
                          <td>
                            <div className="account-menu-cost-compare">
                              <strong>{isAccountCostComplete ? `${Math.round(accountCost).toLocaleString('ko-KR')}원` : '미산정'}</strong>
                              {!isAccountCostComplete && <small>{item.menu_cost_reason || '식자재 상세의 단가·사용량을 확인해주세요.'}</small>}

                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="menu-manager-select-button account-menu-placement-manage-button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleRemoveAssignedMenu(item.menu_id)
                              }}
                            >
                              제거
                            </button>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="menu-manager-empty">배치된 메뉴가 없습니다.</div>
                )}
              </div>
            </section>

            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>메뉴 리스트</h2>
                  <span>{filteredMenuItems.length}건</span>
                </div>
                <div className="account-menu-bulk-actions">
                  <span className="menu-manager-drag-hint">
                    {selectedAvailableAssignableMenuIds.length > 0
                      ? `${selectedAvailableAssignableMenuIds.length}건 선택`
                      : '읽기 전용 / 드래그 가능'}
                  </span>
                  <button
                    type="button"
                    className="menu-manager-select-button"
                    disabled={!selectedAccountId || selectedAvailableAssignableMenuIds.length === 0}
                    onClick={handleAssignSelectedMenus}
                  >
                    선택 배치
                  </button>
                </div>
              </div>
              {menuError ? <div className="menu-manager-notice">{menuError}</div> : null}
              <div className="menu-manager-table-scroll">
                {isMenuLoading ? <LoadingScreen compact message="메뉴 목록을 불러오는 중입니다." /> : null}
                {!isMenuLoading ? (
                  <>
                    <table className="menu-manager-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              className="account-menu-checkbox"
                              checked={isPageSelectionChecked}
                              disabled={!selectedAccountId || pageSelectableMenuIds.length === 0}
                              aria-label="현재 페이지 메뉴 전체 선택"
                              ref={(element) => {
                                if (element) element.indeterminate = isPageSelectionIndeterminate
                              }}
                              onChange={handleTogglePageSelection}
                            />
                          </th>
                          <th>메뉴명</th>
                          <th>식사분류</th>
                          <th>메뉴유형</th>
                          <th>메뉴구분</th>
                          <th>기준원가</th>
                          <th>선택</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedMenuItems.map((item) => {
                          const isAssigned = assignedMenuIds.includes(item.menu_id)
                          const isSelected = selectedAvailableMenuIds.includes(item.menu_id)

                          return (
                            <tr
                              key={item.menu_id}
                              className={item.menu_id === activeMenu?.menu_id ? 'is-active' : ''}
                              onClick={() => setSelectedMenuId(item.menu_id)}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  className="account-menu-checkbox"
                                  checked={isSelected}
                                  disabled={!selectedAccountId || isAssigned}
                                  aria-label={`${item.menu_name || item.menu_id} 선택`}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => handleToggleAvailableMenu(item.menu_id)}
                                />
                              </td>
                              <td>
                                <div className="menu-manager-readonly-cell">
                                  <MenuThumbnail zoomable src={item.image_url} name={item.menu_name} />
                                  <span
                                    className="menu-manager-row-handle"
                                    draggable={Boolean(selectedAccountId)}
                                    onDragStart={(event) => handleDragStart(event, item.menu_id)}
                                    onClick={(event) => event.stopPropagation()}
                                    title={selectedAccountId ? '드래그해서 거래처 메뉴에 배치' : undefined}
                                  >
                                    {selectedAccountId ? '::' : '-'}
                                  </span>
                                  <MenuLikeButton
                                    isLiked={item.like === 'Y'}
                                    menuName={item.menu_name}
                                    onClick={() => setLikeTargetMenuId(item.menu_id)}
                                  />
                                  <span
                                    title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                    {...createAiRecipeGestureHandlers(buildRecipeRequest(item), setRecipeMenuState)}
                                  >
                                    {item.menu_name || '-'}
                                  </span>
                                </div>
                              </td>
                              <td>{item.meal_category || '-'}</td>
                              <td>
                                <select
                                  className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'menu_type') ? ' is-dirty' : ''}`}
                                  value={item.menu_type}
                                  onClick={(event) => event.stopPropagation()}
                                  disabled
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
                                  disabled
                                >
                                  <option value="">선택</option>
                                  {menuGubunOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.text}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="account-menu-master-cost">
                                {(item.menu_cost_per_person ?? 0) > 0
                                  ? `${Math.round(item.menu_cost_per_person ?? 0).toLocaleString('ko-KR')}원`
                                  : '미산정'}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="menu-manager-select-button account-menu-list-select-button"
                                  disabled={!selectedAccountId || isAssigned}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleAssignMenu(item.menu_id)
                                  }}
                                >
                                  {isAssigned ? '배치됨' : '선택'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
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
              </div>
            </section>

            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>식자재 상세</h2>
                  <span>{activeMenu ? activeMenu.menu_name || '메뉴를 선택하세요.' : '메뉴를 선택하세요.'}</span>
                </div>
                <div className="menu-manager-panel__actions">
                  {activeMenu ? (
                    <div className={`account-menu-cost-summary${activeMenuCost.missingCount > 0 ? ' is-incomplete' : ''}`}>
                      <span>예상 1인 원가</span>
                      <strong>{Math.round(activeMenuCost.total).toLocaleString('ko-KR')}원</strong>
                      <small>{activeMenuCost.missingCount > 0 ? `미산정 ${activeMenuCost.missingCount}개` : '산정 완료'}</small>
                    </div>
                  ) : null}
                  <button type="button" className="menu-manager-add-button" onClick={() => void refreshLinkedProducts()} disabled={!activeMenu || isDetailLoading || isRefreshingProducts}>사용상품 새로고침</button>
                  <button type="button" className="menu-manager-add-button" onClick={handleAddIngredient} disabled={!activeMenu}>
                  식자재 추가
                  </button>
                </div>
              </div>
              {ingredientError ? <div className="menu-manager-notice">{ingredientError}</div> : null}
              {activeMenu && selectedAccountId ? <MenuAliasList accountId={selectedAccountId} menuId={activeMenu.menu_id} /> : null}
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
                          <th>거래처 사용상품</th>
                          <th>필요 수량</th>
                          <th>1인 원가</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDetailItems.map((item) => {
                          const filteredIngredientOptions = ingredientOptions.filter(
                            (option) => item.category_name === '' || option.category_name === item.category_name,
                          )
                          const ingredientCost = accountIngredientCost(item)

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
                                  <MenuLikeButton
                                    isLiked={(item.like ?? ingredientOptions.find((option) => option.ingredient_id === item.ingredient_id)?.like) === 'Y'}
                                    menuName={item.ingredient_name}
                                    onClick={() => item.ingredient_id && setLikeTargetIngredientId(item.ingredient_id)}
                                  />
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
<span>{item.product_name || '상품 연결 필요'}</span><br /><small>{item.supplier_name || ''} · {item.package_qty || ''}{item.package_unit || ''} / {item.order_unit || ''} · 참고 포장원가 {item.purchase_price == null ? '가격 미확인' : `${item.purchase_price.toLocaleString('ko-KR')}원`} · {item.origin_name || '원산지 미확인'}</small><br /><Link to={`/inventory/account-ingredients?account_id=${encodeURIComponent(selectedAccountId)}`}>거래처 식자재 설정</Link>
                              </td>
                              <td>
                                <div className="menu-manager-qty-editor">
                                  <input
                                    className={`menu-manager-cell-input is-compact${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_num') ? ' is-dirty' : ''}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.qty_num ?? item.required_qty}
                                    onChange={(event) =>
                                      handleIngredientQtyChange(activeMenu.menu_id, item.row_id, event.target.value)
                                    }
                                  />
                                  <select
                                    className={`menu-manager-cell-input is-unit${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_unit') ? ' is-dirty' : ''}`}
                                    value={item.qty_unit ?? ''}
                                    onChange={(event) =>
                                      handleIngredientUnitChange(activeMenu.menu_id, item.row_id, event.target.value)
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
                              <td className={`account-menu-ingredient-cost${ingredientCost == null ? ' is-missing' : ''}`}>
                                {ingredientCost == null ? item.cost_reason || '단가·단위·사용량 확인 필요' : `${Math.round(ingredientCost).toLocaleString('ko-KR')}원`}
                                <small style={{ display: 'block' }}>{item.cost_source ? `${planningCostSourceLabels[item.cost_source] ?? item.cost_source}${item.cost_source_date ? ` · ${item.cost_source_date}` : ''}` : ''}</small>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="menu-manager-empty">선택한 메뉴에 연결된 식자재가 없습니다. 상단의 식자재 추가 버튼으로 등록할 수 있습니다.</div>
                  )
                ) : null}
                {!activeMenu ? (
                  <div className="menu-manager-empty">
                    {selectedAccountId
                      ? '왼쪽 또는 가운데에서 메뉴를 선택하면 식자재 상세를 볼 수 있습니다.'
                      : '거래처를 선택하면 식자재 상세를 볼 수 있습니다.'}
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        </SideMenuLayout>
      </main>
      {likeTargetMenu ? (
        <MenuLikeConfirmModal
          isSaving={isSavingLike}
          menu={likeTargetMenu}
          onCancel={() => setLikeTargetMenuId(null)}
          onConfirm={() => void handleLikeMenu()}
        />
      ) : null}
      {likeTargetIngredient ? (
        <IngredientLikeConfirmModal
          isSaving={isSavingLike}
          ingredient={likeTargetIngredient}
          onCancel={() => setLikeTargetIngredientId(null)}
          onConfirm={() => void handleLikeIngredient()}
        />
      ) : null}
      {isFavoriteMenuModalOpen ? (
        <FavoriteListModal
          type="menu"
          title="나만의 메뉴"
          isLoading={isFavoriteMenuLoading}
          items={favoriteMenuItems}
          onClose={() => setIsFavoriteMenuModalOpen(false)}
          onSelect={handleSelectFavoriteMenu}
        />
      ) : null}
      {isFavoriteIngredientModalOpen ? (
        <FavoriteListModal
          type="ingredient"
          title="나만의 식자재"
          isLoading={isFavoriteIngredientLoading}
          items={favoriteIngredientItems}
          onClose={() => setIsFavoriteIngredientModalOpen(false)}
          onSelect={handleSelectFavoriteIngredient}
        />
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

export default AccountMenuManager
