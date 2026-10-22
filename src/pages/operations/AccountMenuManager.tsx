import { planningCostSourceLabels } from '../../utils/planningCost'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import AppAlert from '../../components/AppAlert'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import RecipeActionMenu from '../../components/RecipeActionMenu'
import RecipeRegisterModal from '../../components/RecipeRegisterModal'
import RecipeViewModal from '../../components/RecipeViewModal'
import { createAiRecipeGestureHandlers } from '../../components/aiRecipeGesture'
import IngredientSearchSelect from './IngredientSearchSelect'
import MenuLikeButton from './MenuLikeButton'
import MenuThumbnail from './MenuThumbnail'
import MenuLikeConfirmModal from './MenuLikeConfirmModal'
import { isIngredientFieldDirty, isMenuFieldDirty, matchesMenuFilters, mealCategoryOptions, menuGubunOptions, mealPlanTypeOptions, menuTypeOptions, qtyUnitOptions } from './menuManagerShared'
import './MenuManager.css'
import MenuAliasList from '../../components/MenuAliasList'
import { accountIngredientCost, useAccountMenuManager } from '../../features/operations/useAccountMenuManager'

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`

/**
 * 거래처 메뉴 관리(PC): 거래처에 등록된 메뉴만 다룬다 — 거래처 메뉴의 분류·식단 유형·칼로리, 거래처 레시피 식자재·사용상품·1인 원가, 빼기.
 * 본사 메뉴를 거래처로 옮기는 일은 '본사 메뉴 가져오기'(AccountMenuImport)로 분리(2026-10-16 사용자 요청: 표 3개라 보기 불편).
 * 로직은 터치 화면과 같은 useAccountMenuManager.
 */
function AccountMenuManager() {
  const { selectedMealCategory, setSelectedMealCategory, keywordFilter, setKeywordFilter, selectedMenuType, setSelectedMenuType, selectedMenuGubun, setSelectedMenuGubun, selectedAccountId, accountError, ingredientOptions, ingredientError, setSelectedMenuId, originalDetailsByMenuId, detailError, isDetailLoading, accountMenuError, isAccountMenuLoading, alert, setAlert, isSaving, setLikeTargetMenuId, isSavingLike, recipeMenuState, setRecipeMenuState, recipeViewRequest, setRecipeViewRequest, recipeViewMode, setRecipeViewMode, recipeRegisterRequest, setRecipeRegisterRequest, assignedMenuIds, originalAssignedMenuIds, originalAssignedMenusById, assignedMenus, removedAssignedMenus, selectedAccountName, ingredientCategoryOptions, activeMenu, likeTargetMenu, activeDetailItems, activeMenuCost, handleRemoveAssignedMenu, handleAssignedMenuChange, handleRestoreRemovedMenu, handleLikeMenu, handleAddIngredient, handleIngredientCategoryChange, handleIngredientSelect, handleIngredientQtyChange, handleIngredientUnitChange, isRefreshingProducts, refreshLinkedProducts, handleSave, buildRecipeRequest } = useAccountMenuManager()
  // 거르기는 거래처 메뉴에만 적용(본사 메뉴 목록은 이 화면에 없다)
  const visibleMenus = useMemo(() => assignedMenus.filter((item) => matchesMenuFilters(item, {
    mealCategory: selectedMealCategory, keyword: keywordFilter, menuType: selectedMenuType, menuGubun: selectedMenuGubun,
  })), [assignedMenus, keywordFilter, selectedMealCategory, selectedMenuGubun, selectedMenuType])
  // 상세는 거래처 메뉴일 때만(훅은 거래처 메뉴가 없으면 본사 메뉴를 고를 수 있다)
  const detailMenu = activeMenu && assignedMenuIds.includes(activeMenu.menu_id) ? activeMenu : null
  const addedCount = assignedMenuIds.filter((id) => !originalAssignedMenuIds.includes(id)).length
  const costSummary = useMemo(() => {
    const costs = assignedMenus.map((item) => item.menu_cost_per_person ?? 0).filter((value) => value > 0)
    return { done: costs.length, missing: assignedMenus.length - costs.length, avg: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0 }
  }, [assignedMenus])
  const accountQuery = selectedAccountId ? `?${new URLSearchParams({ account_id: selectedAccountId })}` : ''
  const importLink = `/operations/account-menu/import${accountQuery}`

  return (
    <div className="menu-manager-page">
      {(isSaving || isSavingLike) ? (
        <LoadingScreen overlay message={isSavingLike ? '즐겨찾기를 저장하고 있습니다.' : '거래처 메뉴를 저장하고 있습니다.'} />
      ) : null}
      <main className="menu-manager-content">
        <SideMenuLayout header={<HeaderBar title="거래처 메뉴 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '운영관리', to: '/operations/menu' }, { label: '거래처 메뉴 관리' }]} />}>
          <div className="rd rd-page rd-am">
            <header className="rd-page__head">
              <div>
                <h1 className="rd-sr-only">거래처 메뉴 관리</h1>
                <p className="rd-muted">거래처에 등록된 메뉴의 분류·레시피·원가를 거래처 기준으로 고칩니다. 본사 메뉴는 바뀌지 않습니다.</p>
              </div>
              <DeadlineAlertSlot />
              <div className="rd-page__actions">
                <Link className="rd-btn" to={importLink}>+ 본사 메뉴 가져오기</Link>
                <button type="button" className="rd-btn is-primary" onClick={() => void handleSave()} disabled={!selectedAccountId || isSaving}>{isSaving ? '저장 중...' : '저장'}</button>
              </div>
            </header>

            <div className="rd-page__tiles">
              <div className="rd-card rd-page__tile"><span>등록된 메뉴</span><strong>{assignedMenus.length.toLocaleString('ko-KR')}</strong><small>{addedCount > 0 ? `저장 전 추가 ${addedCount}개` : selectedAccountName || '거래처를 고르세요'}</small></div>
              <div className="rd-card rd-page__tile is-ok"><span>원가 산정 완료</span><strong>{costSummary.done.toLocaleString('ko-KR')}</strong><small>평균 1인 {costSummary.avg > 0 ? won(costSummary.avg) : '-'}</small></div>
              <div className={`rd-card rd-page__tile${costSummary.missing > 0 ? ' is-warn' : ''}`}><span>원가 미산정</span><strong>{costSummary.missing.toLocaleString('ko-KR')}</strong><small>사용상품·단가·사용량 확인</small></div>
              <div className={`rd-card rd-page__tile${removedAssignedMenus.length > 0 ? ' is-urgent' : ''}`}><span>저장하면 빠질 메뉴</span><strong>{removedAssignedMenus.length.toLocaleString('ko-KR')}</strong><small>{removedAssignedMenus.length > 0 ? '아래에서 되돌릴 수 있습니다' : '없음'}</small></div>
            </div>

            <section className="rd-card rd-page__filters">
              <input className="rd-input" type="search" value={keywordFilter} placeholder="메뉴명·키워드·레시피 식재료" onChange={(event) => setKeywordFilter(event.target.value)} />
              <div className="rd-pills" role="group" aria-label="식사분류">
                <button type="button" className={selectedMealCategory === '' ? 'is-active' : ''} onClick={() => setSelectedMealCategory('')}>전체</button>
                {mealCategoryOptions.map((option) => (
                  <button type="button" key={option} className={selectedMealCategory === option ? 'is-active' : ''} onClick={() => setSelectedMealCategory(option)}>{option}</button>
                ))}
              </div>
              <select className="rd-input" value={selectedMenuType} aria-label="메뉴유형" onChange={(event) => setSelectedMenuType(event.target.value)}>
                <option value="">메뉴유형 전체</option>
                {menuTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
              </select>
              <select className="rd-input" value={selectedMenuGubun} aria-label="메뉴구분" onChange={(event) => setSelectedMenuGubun(event.target.value)}>
                <option value="">메뉴구분 전체</option>
                {menuGubunOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
              </select>
            </section>

            {accountError ? <p className="rd-alert">{accountError}</p> : null}
            {accountMenuError ? <p className="rd-alert">{accountMenuError}</p> : null}
            {removedAssignedMenus.length > 0 ? (
              <div className="rd-page__notice is-urgent" aria-live="polite">
                <strong>저장하면 빠지는 메뉴 {removedAssignedMenus.length}개</strong>
                {removedAssignedMenus.map((item) => (
                  <span key={item.menu_id} className="rd-am__removed">
                    {item.menu_name || item.menu_id}
                    <button type="button" className="rd-link" onClick={() => handleRestoreRemovedMenu(item.menu_id)}>되돌리기</button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="rd-page__grid">
              <section className="rd-card rd-page__main rd-am__list">
                <div className="rd-page__list-head">
                  <div>
                    <h2 className="rd-h2">거래처 메뉴</h2>
                    <p className="rd-muted">{selectedAccountId ? `${selectedAccountName || selectedAccountId} · ${visibleMenus.length}개 표시` : '거래처를 고르면 등록된 메뉴가 나옵니다.'}</p>
                  </div>
                </div>
                <div className="rd-page__scroll">
                  {isAccountMenuLoading ? <LoadingScreen compact message="거래처 메뉴 목록을 불러오는 중입니다." /> : null}
                  {!isAccountMenuLoading && visibleMenus.length > 0 ? (
                    <table className="rd-table menu-manager-table">
                      <thead>
                        <tr>
                          <th>메뉴</th>
                          <th>식사분류</th>
                          <th>메뉴유형</th>
                          <th>메뉴구분</th>
                          <th>식단 유형</th>
                          <th>칼로리(kcal)</th>
                          <th className="is-num">1인 원가</th>
                          <th aria-label="관리" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMenus.map((item) => {
                          const isActive = item.menu_id === detailMenu?.menu_id
                          const accountCost = isActive ? activeMenuCost.total : item.menu_cost_per_person ?? 0
                          const isCostComplete = isActive
                            ? !isDetailLoading && activeDetailItems.length > 0 && activeMenuCost.missingCount === 0
                            : item.menu_cost_complete !== false && accountCost > 0
                          const isNew = !originalAssignedMenuIds.includes(item.menu_id)
                          return (
                            <tr key={item.menu_id} className={isActive ? 'is-active' : ''} onClick={() => setSelectedMenuId(item.menu_id)}>
                              <td>
                                <div className="rd-mi__menu">
                                  <MenuThumbnail zoomable src={item.image_url} name={item.menu_name} />
                                  <MenuLikeButton isLiked={item.like === 'Y'} menuName={item.menu_name} onClick={() => setLikeTargetMenuId(item.menu_id)} />
                                  <span title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다." {...createAiRecipeGestureHandlers(buildRecipeRequest(item), setRecipeMenuState)}>
                                    <strong>{item.menu_name || '-'}</strong>
                                    {isNew ? <small className="rd-chip is-info">저장 전</small> : null}
                                  </span>
                                </div>
                              </td>
                              <td>{item.meal_category || '-'}</td>
                              <td>
                                <select className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'menu_type') ? ' is-dirty' : ''}`} value={item.menu_type}
                                  onClick={(event) => event.stopPropagation()} onFocus={() => setSelectedMenuId(item.menu_id)}
                                  onChange={(event) => handleAssignedMenuChange(item.menu_id, 'menu_type', event.target.value)}>
                                  <option value="">선택</option>
                                  {menuTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                                </select>
                              </td>
                              <td>
                                <select className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'menu_gubun') ? ' is-dirty' : ''}`} value={item.menu_gubun}
                                  onClick={(event) => event.stopPropagation()} onFocus={() => setSelectedMenuId(item.menu_id)}
                                  onChange={(event) => handleAssignedMenuChange(item.menu_id, 'menu_gubun', event.target.value)}>
                                  <option value="">선택</option>
                                  {menuGubunOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                                </select>
                              </td>
                              <td>
                                <select className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'meal_plan_type') ? ' is-dirty' : ''}`} value={item.meal_plan_type ?? 0}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => handleAssignedMenuChange(item.menu_id, 'meal_plan_type', Number(event.target.value))}>
                                  {mealPlanTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                                </select>
                              </td>
                              <td>
                                <input className={`menu-manager-cell-input${isMenuFieldDirty(item, originalAssignedMenusById, 'calories_per_serving') ? ' is-dirty' : ''}`}
                                  type="number" min="0" step="0.01" value={item.calories_per_serving ?? 0}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => handleAssignedMenuChange(item.menu_id, 'calories_per_serving', Number(event.target.value))} />
                              </td>
                              <td className="is-num">
                                {isCostComplete ? <strong>{won(accountCost)}</strong> : <span className="rd-chip is-warn" title={item.menu_cost_reason || '식자재 상세의 단가·사용량을 확인해주세요.'}>미산정</span>}
                              </td>
                              <td>
                                <button type="button" className="rd-btn is-ghost" onClick={(event) => { event.stopPropagation(); handleRemoveAssignedMenu(item.menu_id) }}>빼기</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : null}
                  {!isAccountMenuLoading && visibleMenus.length === 0 ? (
                    <div className="rd-page__empty">
                      <p>{!selectedAccountId ? '거래처를 고르세요.' : assignedMenus.length === 0 ? '등록된 메뉴가 없습니다.' : '조건에 맞는 거래처 메뉴가 없습니다.'}</p>
                      {selectedAccountId ? <Link className="rd-btn" to={importLink}>본사 메뉴 가져오기</Link> : null}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rd-card rd-page__main rd-am__detail">
                <div className="rd-page__list-head">
                  <div>
                    <h2 className="rd-h2">{detailMenu ? detailMenu.menu_name || detailMenu.menu_id : '레시피 식자재'}</h2>
                    <p className="rd-muted">{detailMenu ? '거래처 레시피(1인 기준) · 거래처 식자재·사용상품 기준 원가' : '왼쪽에서 메뉴를 고르세요.'}</p>
                  </div>
                  {detailMenu ? (
                    <div className="rd-page__tools">
                      <span className={`rd-am__cost${activeMenuCost.missingCount > 0 ? ' is-incomplete' : ''}`}>
                        <small>예상 1인 원가</small>
                        <strong>{won(activeMenuCost.total)}</strong>
                        <small>{activeMenuCost.missingCount > 0 ? `미산정 ${activeMenuCost.missingCount}개` : '산정 완료'}</small>
                      </span>
                      <button type="button" className="rd-btn" onClick={() => void refreshLinkedProducts()} disabled={isDetailLoading || isRefreshingProducts}>사용상품 새로고침</button>
                      <button type="button" className="rd-btn" onClick={handleAddIngredient}>+ 식자재</button>
                    </div>
                  ) : null}
                </div>
                {ingredientError ? <p className="rd-alert">{ingredientError}</p> : null}
                {detailMenu && selectedAccountId ? <div className="rd-am__alias"><MenuAliasList accountId={selectedAccountId} menuId={detailMenu.menu_id} /></div> : null}
                <div className="rd-page__scroll">
                  {isDetailLoading ? <LoadingScreen compact message="식자재 상세 목록을 불러오는 중입니다." /> : null}
                  {!isDetailLoading && detailError ? <p className="rd-page__empty">{detailError}</p> : null}
                  {!isDetailLoading && !detailError && detailMenu ? (
                    activeDetailItems.length > 0 ? (
                      <table className="rd-table menu-manager-table menu-manager-table--ingredients">
                        <thead>
                          <tr>
                            <th>카테고리</th>
                            <th>식자재</th>
                            <th>원가 단가</th>
                            <th>1인 사용량</th>
                            <th className="is-num">1인 원가</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeDetailItems.map((item) => {
                            const filteredIngredientOptions = ingredientOptions.filter((option) => item.category_name === '' || option.category_name === item.category_name)
                            const ingredientCost = accountIngredientCost(item)
                            // 재고·원가는 식재료 단위(2026-10-22): 상품 대신 원가 기준 단가를 보여준다
                            const unitCostText = item.cost_unit_cost == null ? '' : `${Number(item.cost_unit_cost).toLocaleString('ko-KR')}원/${item.cost_base_unit || item.base_unit || ''}`
                            const costSourceText = item.cost_source ? planningCostSourceLabels[item.cost_source] || item.cost_source : ''
                            return (
                              <tr key={item.row_id}>
                                <td>
                                  <select className={`menu-manager-cell-input${isIngredientFieldDirty(item, originalDetailsByMenuId, 'category_name') ? ' is-dirty' : ''}`} value={item.category_name ?? ''}
                                    onChange={(event) => handleIngredientCategoryChange(detailMenu.menu_id, item.row_id, event.target.value)}>
                                    <option value="">카테고리 선택</option>
                                    {ingredientCategoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <div className="menu-manager-ingredient-cell">
                                    <IngredientSearchSelect className={isIngredientFieldDirty(item, originalDetailsByMenuId, 'ingredient_id') ? 'is-dirty' : ''}
                                      options={filteredIngredientOptions} placeholder="식자재 선택" selectedName={item.ingredient_name} value={item.ingredient_id}
                                      onChange={(ingredientId) => handleIngredientSelect(detailMenu.menu_id, item.row_id, ingredientId)} />
                                  </div>
                                </td>
                                <td className="rd-am__product">
                                  {unitCostText ? <strong>{unitCostText}</strong> : <span className="rd-chip is-warn">단가 미확인</span>}
                                  <small className="rd-muted">{costSourceText || item.cost_reason || ''}</small>
                                </td>
                                <td>
                                  <div className="menu-manager-qty-editor">
                                    <input className={`menu-manager-cell-input is-compact${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_num') ? ' is-dirty' : ''}`}
                                      type="number" min="0" step="0.01" value={item.qty_num ?? item.required_qty}
                                      onChange={(event) => handleIngredientQtyChange(detailMenu.menu_id, item.row_id, event.target.value)} />
                                    <select className={`menu-manager-cell-input is-unit${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_unit') ? ' is-dirty' : ''}`} value={item.qty_unit ?? ''}
                                      onChange={(event) => handleIngredientUnitChange(detailMenu.menu_id, item.row_id, event.target.value)}>
                                      <option value="">단위</option>
                                      {qtyUnitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                  </div>
                                </td>
                                <td className="is-num">
                                  {ingredientCost == null ? <span className="rd-text-warn">{item.cost_reason || '단가·단위·사용량 확인 필요'}</span> : <strong>{won(ingredientCost)}</strong>}
                                  {item.cost_source ? <small className="rd-muted rd-am__source">{`${planningCostSourceLabels[item.cost_source] ?? item.cost_source}${item.cost_source_date ? ` · ${item.cost_source_date}` : ''}`}</small> : null}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : <p className="rd-page__empty">이 메뉴에 연결된 식자재가 없습니다. '+ 식자재'로 추가하세요.</p>
                  ) : null}
                  {!detailMenu && !isDetailLoading ? <p className="rd-page__empty">{selectedAccountId ? '왼쪽 목록에서 메뉴를 고르면 레시피 식자재가 나옵니다.' : '거래처를 고르세요.'}</p> : null}
                </div>
              </section>
            </div>
          </div>
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
