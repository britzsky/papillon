import { useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import AppAlert from '../../components/AppAlert'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import RecipeActionMenu from '../../components/RecipeActionMenu'
import RecipeRegisterModal from '../../components/RecipeRegisterModal'
import RecipeViewModal from '../../components/RecipeViewModal'
import { createAiRecipeGestureHandlers } from '../../components/aiRecipeGesture'
import IngredientSearchSelect from './IngredientSearchSelect'
import MenuThumbnail from './MenuThumbnail'
import { MENU_PAGE_SIZE, isIngredientFieldDirty, isMenuFieldDirty, mealCategoryOptions, menuGubunOptions, mealPlanTypeOptions, menuTypeOptions, qtyUnitOptions } from './menuManagerShared'
import './MenuManager.css'
import { useMenuManager } from '../../features/operations/useMenuManager'

function MenuManager() {
  const [menuView, setMenuView] = useState<'table' | 'cards'>('table')
  const { selectedMealCategory, setSelectedMealCategory, keywordFilter, setKeywordFilter, selectedMenuType, setSelectedMenuType, selectedMenuGubun, setSelectedMenuGubun, selectedMealPlanType, setSelectedMealPlanType, ingredientOptions, ingredientError, originalMenusById, menuError, isMenuLoading, setSelectedMenuId, originalDetailsByMenuId, detailError, isDetailLoading, alert, setAlert, isSaving, currentPage, setCurrentPage, setImageEditorMenuId, recipeMenuState, setRecipeMenuState, recipeViewRequest, setRecipeViewRequest, recipeViewMode, setRecipeViewMode, recipeRegisterRequest, setRecipeRegisterRequest, filteredMenuItems, ingredientCategoryOptions, totalMenuPages, pagedMenuItems, activeMenu, imageEditorMenu, activeDetailItems, handleAddRow, handleMenuChange, handleMenuNumberChange, handleMenuImageFileChange, handleAddIngredient, handleIngredientCategoryChange, handleIngredientSelect, handleIngredientTextChange, handleIngredientNumberChange, handleSave, buildRecipeRequest } = useMenuManager()
  return (
    <div className="menu-manager-page">
      {isSaving ? <LoadingScreen overlay message="메뉴 정보를 저장하고 있습니다." /> : null}
      <main className="menu-manager-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="메뉴 관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '운영관리', to: '/operations/menu' },
                { label: '메뉴 관리' },
              ]}
            />
          }
        >
          <section className="menu-manager-filters">
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field">
                <label htmlFor="meal-category">식사분류</label>
                <select id="meal-category" value={selectedMealCategory} onChange={(event) => setSelectedMealCategory(event.target.value)}>
                  <option value="">전체</option>
                  {mealCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="menu-keyword">키워드</label>
                <input
                  id="menu-keyword"
                  type="search"
                  value={keywordFilter}
                  placeholder="메뉴명, 키워드, 레시피 식재료"
                  onChange={(event) => setKeywordFilter(event.target.value)}
                />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="menu-type-filter">메뉴유형</label>
                <select id="menu-type-filter" value={selectedMenuType} onChange={(event) => setSelectedMenuType(event.target.value)}>
                  <option value="">전체</option>
                  {menuTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="menu-gubun-filter">메뉴구분</label>
                <select id="menu-gubun-filter" value={selectedMenuGubun} onChange={(event) => setSelectedMenuGubun(event.target.value)}>
                  <option value="">전체</option>
                  {menuGubunOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="meal-plan-type-filter">식단 유형</label>
                <select id="meal-plan-type-filter" value={selectedMealPlanType} onChange={(event) => setSelectedMealPlanType(event.target.value)}>
                  <option value="">전체</option>
                  {mealPlanTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.text}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="menu-manager-filters__actions">
              <button type="button" className="menu-manager-save-button" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </section>

          <section className="menu-manager-layout menu-manager-layout--equal-headers">
            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>메뉴 리스트</h2>
                  <span>{filteredMenuItems.length}건</span>
                </div>
                <div className="workspace-view-switch" role="group" aria-label="메뉴 보기 방식">
                  <button type="button" aria-pressed={menuView === 'table'} onClick={() => setMenuView('table')}>표 보기</button>
                  <button type="button" aria-pressed={menuView === 'cards'} onClick={() => setMenuView('cards')}>사진 카드</button>
                </div>
                <button type="button" className="menu-manager-add-button" onClick={handleAddRow}>
                  행 추가
                </button>
              </div>

              <div className="menu-manager-table-scroll">
                {isMenuLoading ? <LoadingScreen compact message="메뉴 목록을 불러오는 중입니다." /> : null}
                {!isMenuLoading ? (
                  <>
                    <table className={`menu-manager-table menu-manager-menu-list-table${menuView === 'cards' ? ' workspace-menu-cards' : ''}`}>
                      <thead>
                        <tr>
                          <th>메뉴명</th>
                          <th>식사분류</th>
                          <th>메뉴유형</th>
                          <th>메뉴구분</th>
                          <th>식단 유형</th>
                          <th>칼로리(kcal)</th>
                          <th>등록일</th>
                          <th>선택</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedMenuItems.map((item) => (
                          <tr
                            key={item.menu_id}
                            className={item.menu_id === activeMenu?.menu_id ? 'is-active' : ''}
                            onClick={() => setSelectedMenuId(item.menu_id)}
                          >
                            <td data-label="메뉴명">
                              <div className="menu-manager-menu-cell">
                                  <MenuThumbnail
                                    src={item.image_url}
                                    name={item.menu_name}
                                    isDirty={isMenuFieldDirty(item, originalMenusById, 'menu_img')}
                                    onEdit={() => {
                                      setSelectedMenuId(item.menu_id)
                                      setImageEditorMenuId(item.menu_id)
                                    }}
                                  />
                                <input
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'menu_name') ? ' is-dirty' : ''}`}
                                value={item.menu_name}
                                placeholder="메뉴명을 입력하세요."
                                title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                {...createAiRecipeGestureHandlers(buildRecipeRequest(item), setRecipeMenuState)}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                  onChange={(event) => handleMenuChange(item.menu_id, 'menu_name', event.target.value)}
                                />
                              </div>
                            </td>
                            <td data-label="식사분류">
                              <select
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'meal_category') ? ' is-dirty' : ''}`}
                                value={item.meal_category}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                onChange={(event) => handleMenuChange(item.menu_id, 'meal_category', event.target.value)}
                              >
                                <option value="">선택</option>
                                {mealCategoryOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td data-label="메뉴유형">
                              <select
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'menu_type') ? ' is-dirty' : ''}`}
                                value={item.menu_type}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                onChange={(event) => handleMenuChange(item.menu_id, 'menu_type', event.target.value)}
                              >
                                <option value="">선택</option>
                                {menuTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.text}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td data-label="메뉴구분">
                              <select
                                className={`menu-manager-cell-input menu-manager-menu-gubun-select${isMenuFieldDirty(item, originalMenusById, 'menu_gubun') ? ' is-dirty' : ''}`}
                                value={item.menu_gubun}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => setSelectedMenuId(item.menu_id)}
                                onChange={(event) => handleMenuChange(item.menu_id, 'menu_gubun', event.target.value)}
                              >
                                <option value="">선택</option>
                                {menuGubunOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.text}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td data-label="식단 유형">
                              <select
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'meal_plan_type') ? ' is-dirty' : ''}`}
                                value={item.meal_plan_type}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => handleMenuNumberChange(item.menu_id, 'meal_plan_type', event.target.value)}
                              >
                                {mealPlanTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>{option.text}</option>
                                ))}
                              </select>
                            </td>
                            <td data-label="칼로리(kcal)">
                              <input
                                className={`menu-manager-cell-input${isMenuFieldDirty(item, originalMenusById, 'calories_per_serving') ? ' is-dirty' : ''}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.calories_per_serving ?? 0}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => handleMenuNumberChange(item.menu_id, 'calories_per_serving', event.target.value)}
                              />
                            </td>
                            <td data-label="등록일">{item.created_at || '-'}</td>
                            <td data-label="선택">
                              <button
                                type="button"
                                className="menu-manager-select-button menu-manager-menu-select-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedMenuId(item.menu_id)
                                }}
                              >
                                {item.menu_id === activeMenu?.menu_id ? '선택됨' : '선택'}
                              </button>
                            </td>
                          </tr>
                        ))}
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
                {!isMenuLoading && menuError ? <div className="menu-manager-empty">{menuError}</div> : null}
              </div>
            </section>

            <section className="menu-manager-panel">
              <div className="menu-manager-panel__header">
                <div>
                  <h2>식자재 상세</h2>
                  <span>{activeMenu ? activeMenu.menu_name || '신규 메뉴' : '메뉴를 선택하세요.'}</span>
                </div>
                <div className="menu-manager-panel__actions">

                  <button type="button" className="menu-manager-add-button" onClick={handleAddIngredient} disabled={!activeMenu}>
                  식자재 추가
                  </button>
                </div>
              </div>
              {ingredientError ? <div className="menu-manager-notice">{ingredientError}</div> : null}
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
                          <th>필요 수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDetailItems.map((item) => {
                          const filteredIngredientOptions = ingredientOptions.filter(
                            (option) => item.category_name === '' || option.category_name === item.category_name,
                          )

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
                                <div className="menu-manager-qty-editor">
                                  <input
                                    className={`menu-manager-cell-input is-compact${isIngredientFieldDirty(item, originalDetailsByMenuId, 'required_qty') ? ' is-dirty' : ''}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.required_qty}
                                    onChange={(event) =>
                                      handleIngredientNumberChange(activeMenu.menu_id, item.row_id, 'required_qty', event.target.value)
                                    }
                                  />
                                  <select
                                    className={`menu-manager-cell-input is-unit${isIngredientFieldDirty(item, originalDetailsByMenuId, 'qty_unit') ? ' is-dirty' : ''}`}
                                    value={item.qty_unit ?? ''}
                                    onChange={(event) =>
                                      handleIngredientTextChange(activeMenu.menu_id, item.row_id, 'qty_unit', event.target.value)
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
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="menu-manager-empty">선택한 메뉴에 연결된 식자재가 없습니다. 상단의 `식자재 추가` 버튼으로 등록할 수 있습니다.</div>
                  )
                ) : null}
                {!activeMenu ? <div className="menu-manager-empty">왼쪽 메뉴 리스트에서 메뉴를 선택하면 식자재 상세를 수정할 수 있습니다.</div> : null}
              </div>
            </section>
          </section>
        </SideMenuLayout>
      </main>
      {imageEditorMenu ? (
        <div className="menu-manager-modal-backdrop" role="presentation" onClick={() => setImageEditorMenuId(null)}>
          <section className="menu-manager-image-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="menu-manager-image-modal__header">
              <div>
                <h2>menu_img</h2>
                <span>{imageEditorMenu.menu_name || imageEditorMenu.menu_id}</span>
              </div>
              <button type="button" className="menu-manager-select-button" onClick={() => setImageEditorMenuId(null)}>
                닫기
              </button>
            </div>
            <div className="menu-manager-image-modal__body">
              <MenuThumbnail
                src={imageEditorMenu.image_url}
                name={imageEditorMenu.menu_name}
                isDirty={isMenuFieldDirty(imageEditorMenu, originalMenusById, 'menu_img')}
              />
              <label
                className={`menu-manager-file-picker${isMenuFieldDirty(imageEditorMenu, originalMenusById, 'menu_img') ? ' is-dirty' : ''}`}
              >
                <span>{imageEditorMenu.menu_img instanceof File ? imageEditorMenu.menu_img.name : '이미지 선택'}</span>
                <input
                  type="file"
                  accept="image/*"
                  autoFocus
                  onChange={(event) => handleMenuImageFileChange(imageEditorMenu.menu_id, event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </section>
        </div>
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

export default MenuManager
