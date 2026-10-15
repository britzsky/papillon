import { Link } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import AppAlert from '../../components/AppAlert'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import MenuThumbnail from './MenuThumbnail'
import AccountSearchSelect from './AccountSearchSelect'
import { mealCategoryOptions, mealPlanTypeOptions, menuGubunOptions, menuTypeOptions } from './menuManagerShared'
import { IMPORT_PAGE_SIZE, useAccountMenuImport } from '../../features/operations/useAccountMenuImport'
import './MenuManager.css'

const optionText = (options: readonly { value: string; text: string }[], value: unknown) => options.find((o) => o.value === String(value ?? ''))?.text || '-'
const won = (value?: number) => (value ?? 0) > 0 ? `${Math.round(value ?? 0).toLocaleString('ko-KR')}원` : '미산정'

/**
 * 본사 메뉴 가져오기(2026-10-16 사용자 요청으로 거래처 메뉴 관리에서 분리): 본사 메뉴 마스터를 넓은 표로 보고
 * 고른 메뉴를 거래처로 등록만 한다. 마스터 정보는 여기서 고칠 수 없다.
 */
function AccountMenuImport() {
  const m = useAccountMenuImport()
  const accountQuery = m.selectedAccountId ? `?${new URLSearchParams({ account_id: m.selectedAccountId })}` : ''

  return (
    <div className="menu-manager-page">
      {m.isSaving ? <LoadingScreen overlay message="거래처 메뉴로 등록하고 있습니다." /> : null}
      <main className="menu-manager-content">
        <SideMenuLayout header={<HeaderBar title="본사 메뉴 가져오기" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '운영관리', to: '/operations/menu' }, { label: '본사 메뉴 가져오기' }]} />}>
          <div className="rd rd-page rd-mi">
            <header className="rd-page__head">
              <div>
                <h1 className="rd-h1">본사 메뉴 가져오기</h1>
                <p className="rd-muted">본사 메뉴는 읽기 전용입니다. 고른 메뉴를 본사 분류·레시피 그대로 거래처 메뉴로 등록합니다.</p>
              </div>
              <div className="rd-page__actions">
                <div className="rd-page__account">
                  <span className="rd-muted">거래처</span>
                  <AccountSearchSelect id="account-menu-import-account" options={m.accountOptions} placeholder="거래처 선택" value={m.selectedAccountId} onChange={m.setSelectedAccountId} />
                </div>
                <Link className="rd-btn" to={`/operations/account-menu${accountQuery}`}>거래처 메뉴 관리</Link>
              </div>
            </header>

            <section className="rd-card rd-page__filters">
              <input className="rd-input" type="search" value={m.keyword} placeholder="메뉴명·키워드·레시피 식재료" onChange={(e) => m.setKeyword(e.target.value)} />
              <div className="rd-pills" role="group" aria-label="식사분류">
                <button type="button" className={m.mealCategory === '' ? 'is-active' : ''} onClick={() => m.setMealCategory('')}>전체</button>
                {mealCategoryOptions.map((option) => (
                  <button type="button" key={option} className={m.mealCategory === option ? 'is-active' : ''} onClick={() => m.setMealCategory(option)}>{option}</button>
                ))}
              </div>
              <select className="rd-input" value={m.menuType} aria-label="메뉴유형" onChange={(e) => m.setMenuType(e.target.value)}>
                <option value="">메뉴유형 전체</option>
                {menuTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
              </select>
              <select className="rd-input" value={m.menuGubun} aria-label="메뉴구분" onChange={(e) => m.setMenuGubun(e.target.value)}>
                <option value="">메뉴구분 전체</option>
                {menuGubunOptions.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
              </select>
              <label className="rd-check"><input type="checkbox" checked={m.likedOnly} onChange={(e) => m.setLikedOnly(e.target.checked)} />나만의 메뉴만</label>
              <label className="rd-check"><input type="checkbox" checked={m.hideRegistered} onChange={(e) => m.setHideRegistered(e.target.checked)} />이미 등록한 메뉴 숨기기</label>
            </section>

            <div className="rd-page__grid">
              <section className="rd-card rd-page__main">
                <div className="rd-page__list-head">
                  <div>
                    <h2 className="rd-h2">본사 메뉴</h2>
                    <p className="rd-muted">{m.filteredItems.length.toLocaleString('ko-KR')}개{m.selectedAccountId ? ` · ${m.selectedAccountName || m.selectedAccountId}에 ${m.registeredIds.size}개 등록됨` : ' · 거래처를 고르면 등록할 수 있습니다'}</p>
                  </div>
                </div>
                {m.menuError ? <p className="rd-alert">{m.menuError}</p> : null}
                <div className="rd-page__scroll">
                  {m.isMenuLoading || m.isRegisteredLoading ? <LoadingScreen compact message="본사 메뉴를 불러오는 중입니다." /> : (
                    <table className="rd-table">
                      <thead>
                        <tr>
                          <th className="is-check">
                            <input type="checkbox" checked={m.isPageChecked} disabled={!m.selectedAccountId || m.selectableOnPage.length === 0} aria-label="이 쪽 메뉴 전체 선택"
                              ref={(el) => { if (el) el.indeterminate = m.isPageIndeterminate }} onChange={m.togglePage} />
                          </th>
                          <th>메뉴</th>
                          <th>식사분류</th>
                          <th>메뉴유형</th>
                          <th>메뉴구분</th>
                          <th>식단 유형</th>
                          <th className="is-num">칼로리</th>
                          <th className="is-num">본사 1인 원가</th>
                          <th>레시피 식재료</th>
                          <th>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.pagedItems.map((item) => {
                          const registered = m.registeredIds.has(item.menu_id)
                          const checked = m.selectedIds.includes(item.menu_id)
                          return (
                            <tr key={item.menu_id} className={`${item.menu_id === m.previewMenuId ? 'is-active' : ''}${checked ? ' is-checked' : ''}`} onClick={() => m.setPreviewMenuId(item.menu_id)}>
                              <td className="is-check">
                                <input type="checkbox" checked={checked} disabled={!m.selectedAccountId || registered} aria-label={`${item.menu_name} 선택`}
                                  onClick={(e) => e.stopPropagation()} onChange={() => m.toggleSelect(item.menu_id)} />
                              </td>
                              <td>
                                <div className="rd-mi__menu">
                                  <MenuThumbnail zoomable src={item.image_url} name={item.menu_name} />
                                  <span><strong>{item.menu_name || '-'}</strong>{item.food_type_reason ? <small className="rd-muted">{item.food_type_reason}</small> : null}</span>
                                </div>
                              </td>
                              <td>{item.meal_category || '-'}</td>
                              <td>{optionText(menuTypeOptions, item.menu_type)}</td>
                              <td>{optionText(menuGubunOptions, item.menu_gubun)}</td>
                              <td>{optionText(mealPlanTypeOptions, item.meal_plan_type)}</td>
                              <td className="is-num">{item.calories_per_serving ? `${Number(item.calories_per_serving).toLocaleString('ko-KR')}kcal` : '-'}</td>
                              <td className="is-num">{won(item.menu_cost_per_person)}</td>
                              <td><span className="rd-mi__ingredients" title={item.recipe_ingredient_names}>{item.recipe_ingredient_names || '-'}</span></td>
                              <td>{registered ? <span className="rd-chip is-ok">등록됨</span> : checked ? <span className="rd-chip is-info">선택</span> : <span className="rd-chip is-done">미등록</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {!m.isMenuLoading && m.filteredItems.length === 0 ? <p className="rd-page__empty">조건에 맞는 본사 메뉴가 없습니다.</p> : null}
                </div>
                {m.filteredItems.length > IMPORT_PAGE_SIZE ? (
                  <div className="rd-page__pager">
                    <span className="rd-muted">{(m.currentPage - 1) * IMPORT_PAGE_SIZE + 1}-{Math.min(m.currentPage * IMPORT_PAGE_SIZE, m.filteredItems.length)} / {m.filteredItems.length}</span>
                    <button type="button" className="rd-btn is-ghost" disabled={m.currentPage === 1} onClick={() => m.setCurrentPage(1)}>처음</button>
                    <button type="button" className="rd-btn is-ghost" disabled={m.currentPage === 1} onClick={() => m.setCurrentPage((p) => Math.max(1, p - 1))}>이전</button>
                    <strong>{m.currentPage} / {m.totalPages}</strong>
                    <button type="button" className="rd-btn is-ghost" disabled={m.currentPage >= m.totalPages} onClick={() => m.setCurrentPage((p) => Math.min(m.totalPages, p + 1))}>다음</button>
                    <button type="button" className="rd-btn is-ghost" disabled={m.currentPage >= m.totalPages} onClick={() => m.setCurrentPage(m.totalPages)}>마지막</button>
                  </div>
                ) : null}
              </section>

              <aside className="rd-page__side">
                <section className="rd-card rd-page__box">
                  <h2 className="rd-h2">등록할 메뉴</h2>
                  {!m.selectedAccountId ? <p className="rd-muted">먼저 오른쪽 위에서 거래처를 고르세요.</p>
                    : m.selectedMenus.length === 0 ? <p className="rd-muted">표에서 메뉴를 체크하면 여기에 모입니다.</p> : (
                      <ul className="rd-mi__picked">
                        {m.selectedMenus.map((item) => (
                          <li key={item.menu_id}>
                            <span><strong>{item.menu_name}</strong><small className="rd-muted"> · {item.meal_category || '-'} · {optionText(menuTypeOptions, item.menu_type)}</small></span>
                            <button type="button" className="rd-btn is-ghost" onClick={() => m.toggleSelect(item.menu_id)} aria-label={`${item.menu_name} 빼기`}>빼기</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  <button type="button" className="rd-btn is-primary rd-page__confirm" disabled={!m.selectedAccountId || m.selectedMenus.length === 0 || m.isSaving} onClick={() => void m.register()}>
                    {m.selectedMenus.length > 0 ? `${m.selectedMenus.length}개 거래처 메뉴로 등록` : '거래처 메뉴로 등록'}
                  </button>
                  {m.selectedMenus.length > 0 ? <button type="button" className="rd-btn is-ghost" onClick={() => m.setSelectedIds([])}>선택 모두 지우기</button> : null}
                </section>

                <section className="rd-card rd-page__box">
                  <h2 className="rd-h2">본사 레시피</h2>
                  {!m.previewMenu ? <p className="rd-muted">표에서 메뉴 줄을 누르면 본사 레시피를 볼 수 있습니다.</p> : (
                    <>
                      <p><strong>{m.previewMenu.menu_name}</strong><span className="rd-muted"> · 1인 기준</span></p>
                      {m.isDetailLoading ? <p className="rd-muted">불러오는 중…</p>
                        : m.detailError ? <p className="rd-alert">{m.detailError}</p>
                        : m.previewDetails.length === 0 ? <p className="rd-muted">본사 레시피에 식재료가 없습니다.</p> : (
                          <table className="rd-table is-compact">
                            <thead><tr><th>식재료</th><th>분류</th><th className="is-num">1인 사용량</th></tr></thead>
                            <tbody>
                              {m.previewDetails.map((d) => (
                                <tr key={d.row_id}>
                                  <td>{d.ingredient_name || d.ingredient_name_raw || '-'}</td>
                                  <td>{d.category_name || '-'}</td>
                                  <td className="is-num">{d.qty_num ?? d.required_qty}{d.qty_unit || d.base_unit || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </>
                  )}
                </section>
              </aside>
            </div>
          </div>
        </SideMenuLayout>
      </main>
      <AppAlert alert={m.alert} onClose={() => m.setAlert(null)} />
    </div>
  )
}

export default AccountMenuImport
