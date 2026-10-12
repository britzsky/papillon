import DailyWork from '../components/DailyWork'
import { buildApiUrl } from '../config/api'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'
import SideMenuLayout from '../components/SideMenuLayout'
import WorkspaceIcon from '../components/WorkspaceIcon'
import {
  getAccountOptions,
  type AccountOption,
  type IngredientOption,
  type MenuManagerItem,
} from '../api/operations'
import { trackSearchSelection, trackSearch, getPopularSearches, type SearchEntity } from '../api/analytics'
import './Home.css'

type SearchIntent = 'ingredient' | 'vendor' | 'menu'

const searchIntentLabels: Record<SearchIntent, string> = {
  ingredient: '식자재',
  vendor: '거래처',
  menu: '메뉴',
}

type SearchAction = {
  intent: SearchIntent
  category: string
  title: string
  description: string
  path: string
}

type SearchMenuItem = MenuManagerItem & { matched_ingredients?: string }

type SearchMatch = {
  intent: SearchIntent
  id: string
  name: string
  matchedIngredients?: string
}

const searchActions: SearchAction[] = [
  {
    intent: 'ingredient',
    category: '발주',
    title: '식자재 발주로 이동',
    description: '검색한 식자재의 부족 수량과 발주 필요 여부를 확인합니다.',
    path: '/order_manager/food_order',
  },
  {
    intent: 'ingredient',
    category: '재고',
    title: '재고관리에서 확인',
    description: '현재고, 안전재고, 부족재고를 식자재 기준으로 조회합니다.',
    path: '/inventory/account',
  },
  {
    intent: 'ingredient',
    category: '운영',
    title: '메뉴관리에서 사용 메뉴 찾기',
    description: '검색한 식자재가 연결된 메뉴와 식자재 상세를 확인합니다.',
    path: '/operations/menu',
  },
  {
    intent: 'ingredient',
    category: '운영',
    title: '거래처 메뉴관리에서 확인',
    description: '거래처별 메뉴 안에서 해당 식자재가 쓰이는 구성을 확인합니다.',
    path: '/operations/account-menu',
  },
  {
    intent: 'vendor',
    category: '운영',
    title: '거래처 메뉴관리로 이동',
    description: '검색한 거래처의 메뉴 구성과 연결된 식자재를 관리합니다.',
    path: '/operations/account-menu',
  },
  {
    intent: 'vendor',
    category: '재고',
    title: '거래처 재고관리로 이동',
    description: '거래처별 현재고, 안전재고, 부족재고를 확인합니다.',
    path: '/inventory/account',
  },
  {
    intent: 'vendor',
    category: '운영',
    title: '식단표 관리로 이동',
    description: '검색한 거래처의 주간 식단표와 메뉴 매칭을 확인합니다.',
    path: '/operations/table-meals',
  },
  {
    intent: 'vendor',
    category: '위생',
    title: '위생관리로 이동',
    description: '거래처별 위생 점검 사진, 전달 내용, 조치 내역을 확인합니다.',
    path: '/sanitation/vendor',
  },
  {
    intent: 'menu',
    category: '운영',
    title: '레시피 보기',
    description: '메뉴관리에서 레시피와 식자재 상세를 확인합니다.',
    path: '/operations/menu',
  },
  {
    intent: 'menu',
    category: '운영',
    title: '메뉴관리에서 수정',
    description: '메뉴명, 키워드, 연결 식자재를 수정합니다.',
    path: '/operations/menu',
  },
  {
    intent: 'menu',
    category: '운영',
    title: '거래처 메뉴관리에서 확인',
    description: '거래처별로 운영 중인 해당 메뉴를 확인합니다.',
    path: '/operations/account-menu',
  },
  {
    intent: 'menu',
    category: '운영',
    title: '식단표에서 사용일 찾기',
    description: '해당 메뉴가 포함된 식단표와 요일별 배치를 확인합니다.',
    path: '/operations/table-meals',
  },
]

const normalizeSearchValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '')

const findMatches = (
  query: string,
  ingredients: IngredientOption[],
  accounts: AccountOption[],
  menus: SearchMenuItem[],
): SearchMatch[] => {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery) {
    return []
  }

  const toMatch = (intent: SearchIntent, id: string, name: string) => ({ intent, id, name })
  const matchesName = (name: string) => normalizeSearchValue(name).includes(normalizedQuery)
  const sortByRelevance = (a: SearchMatch, b: SearchMatch) => {
    const aName = normalizeSearchValue(a.name)
    const bName = normalizeSearchValue(b.name)
    const aExact = aName === normalizedQuery ? 0 : 1
    const bExact = bName === normalizedQuery ? 0 : 1
    const aStarts = aName.startsWith(normalizedQuery) ? 0 : 1
    const bStarts = bName.startsWith(normalizedQuery) ? 0 : 1

    return aExact - bExact || aStarts - bStarts || a.name.length - b.name.length
  }

  const ingredientMatches = ingredients
    .filter((ingredient) => matchesName(ingredient.ingredient_name))
    .map((ingredient) => toMatch('ingredient', ingredient.ingredient_id, ingredient.ingredient_name))
    .sort(sortByRelevance)
    .slice(0, 2)

  const accountMatches = accounts
    .filter((account) => matchesName(account.text))
    .map((account) => toMatch('vendor', account.value, account.text))
    .sort(sortByRelevance)
    .slice(0, 2)

  const menuMatches = menus
    .filter((menu) => matchesName(menu.menu_name) || Boolean(menu.matched_ingredients))
    .map((menu) => ({ ...toMatch('menu', menu.menu_id, menu.menu_name), matchedIngredients: menu.matched_ingredients }))
    .sort((a, b) => Number(!matchesName(a.name)) - Number(!matchesName(b.name)) || sortByRelevance(a, b))
    .slice(0, 6)

  return [...ingredientMatches, ...accountMatches, ...menuMatches]
}

/** 자주 쓰는 화면. 홈에서 화면 입구는 '오늘 할 일'과 여기 두 곳뿐(왼쪽 메뉴에 전체 목록). */
const shortcuts = [
  { title: '발주하기', description: '추천 발주안·부족량·상품 검색', path: '/order_manager/order', icon: 'order' as const },
  { title: '발주서·입고', description: '접수 결과 확인·입고 확정·인쇄', path: '/order_manager/orders', icon: 'product' as const },
  { title: '재고 조정', description: '현재고·직접구매·기초재고', path: '/inventory/account', icon: 'inventory' as const },
  { title: '식단표', description: '식단 작성·주간 사용 확정', path: '/operations/table-meals', icon: 'operations' as const },
  { title: '거래처 메뉴', description: '메뉴 레시피·원가', path: '/operations/account-menu', icon: 'headquarters' as const },
  { title: '위생 점검', description: '거래처별 점검 상태', path: '/sanitation/vendor', icon: 'sanitation' as const },
]

function Home() {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState(() => new URLSearchParams(window.location.search).get('q') || '')
  const [popular, setPopular] = useState<Array<{ query: string; search_count: number }>>([])
  const [recent, setRecent] = useState<string[]>([])
  const recentKey = 'recent-search:' + (localStorage.getItem('account_id') || '') + ':' + (localStorage.getItem('user_id') || '')
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [menuItems, setMenuItems] = useState<SearchMenuItem[]>([])
  const [isSearchDataLoading, setIsSearchDataLoading] = useState(false)
  const [searchDataError, setSearchDataError] = useState('')

  const normalizedSearchText = searchText.trim()
  const searchMatches = useMemo(
    () => findMatches(normalizedSearchText, ingredients, accounts, menuItems),
    [accounts, ingredients, menuItems, normalizedSearchText],
  )
  const primaryMatch = searchMatches[0]
  const suggestedActions = primaryMatch ? searchActions.filter((action) => action.intent === primaryMatch.intent) : []

  useEffect(() => {
    let active = true
    void getAccountOptions().then(rows => { if (active) setAccounts(rows) }).catch(() => {})
    void getPopularSearches().then(rows => { if (active) setPopular(rows) }).catch(() => {})
    try { setRecent(JSON.parse(localStorage.getItem(recentKey) || '[]')) } catch { setRecent([]) }
    return () => { active = false }
  }, [recentKey])

  useEffect(() => {
    const controller = new AbortController()
    if (!normalizedSearchText) { setIngredients([]); setMenuItems([]); setIsSearchDataLoading(false); return }
    const timer = window.setTimeout(async () => {
      setIsSearchDataLoading(true); setSearchDataError('')
      try {
        const query = new URLSearchParams({ q: normalizedSearchText, account_id: localStorage.getItem('account_id') || '' })
        const response = await fetch(buildApiUrl(`/v2/discovery/search?${query}`), { signal: controller.signal })
        if (!response.ok) throw new Error('검색 결과를 불러오지 못했습니다.')
        const rows = await response.json() as Array<{ entity_type: string; entity_id: string; title: string; matched_ingredients?: string }>
        if (controller.signal.aborted) return
        setIngredients(rows.filter(row => row.entity_type === 'INGREDIENT').map(row => ({ ingredient_id: row.entity_id, ingredient_name: row.title })) as IngredientOption[])
        setMenuItems(rows.filter(row => row.entity_type === 'MENU').map(row => ({ menu_id: row.entity_id, menu_name: row.title, matched_ingredients: row.matched_ingredients })) as SearchMenuItem[])
      } catch (error) {
        if (!controller.signal.aborted) setSearchDataError(error instanceof Error ? error.message : '검색 실패')
      } finally { if (!controller.signal.aborted) setIsSearchDataLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [normalizedSearchText])

  const navigateWithSearch = (path: string, match = primaryMatch) => {
    const query = normalizedSearchText
    const params = new URLSearchParams()

    if (query) {
      params.set('q', match?.intent === 'menu' ? match.name : query)
    }

    if (match) {
      params.set('type', match.intent)
      params.set('id', match.id)
      params.set('name', match.name)

      if (match.intent === 'vendor') {
        params.set('account_id', match.id)
      }
    }

    const queryString = params.toString()

    if (query && match) {
      const entityTypeByIntent: Record<SearchIntent, SearchEntity['entity_type']> = {
        ingredient: 'INGREDIENT',
        vendor: 'VENDOR',
        menu: 'MENU',
      }
      const results = searchMatches.map((item, index) => ({
        entity_type: entityTypeByIntent[item.intent],
        entity_id: item.id,
        position_no: index + 1,
      }))
      const selectedIndex = searchMatches.findIndex((item) => item.intent === match.intent && item.id === match.id)
      void trackSearchSelection({
        query,
        intent: `${match.intent.toUpperCase()}_SEARCH`,
        screen: 'HOME',
        results,
        selected: {
          entity_type: entityTypeByIntent[match.intent],
          entity_id: match.id,
          position_no: selectedIndex >= 0 ? selectedIndex + 1 : undefined,
        },
        context: { destination: path, matched_name: match.name },
      })
    }

    navigate(queryString ? `${path}?${queryString}` : path)
  }

  const handleSearchSubmit = () => {
    if (!normalizedSearchText || isSearchDataLoading || searchDataError) return
    const next = [normalizedSearchText, ...recent.filter(value => value !== normalizedSearchText)].slice(0, 8)
    setRecent(next); localStorage.setItem(recentKey, JSON.stringify(next))
    const entities: Record<SearchIntent, SearchEntity['entity_type']> = { menu: 'MENU', ingredient: 'INGREDIENT', vendor: 'VENDOR' }
    void trackSearch({ query: normalizedSearchText, intent: 'INTEGRATED_SEARCH', screen: 'HOME', results: searchMatches.map((match, index) => ({ entity_type: entities[match.intent], entity_id: match.id, position_no: index + 1 })) }).catch(() => {})
  }

  return (
    <div className="home-page procurement-refresh">
      <main className="home-content">
        <SideMenuLayout header={<HeaderBar title="오늘의 운영" breadcrumbs={[{ label: '홈' }]} />}>
          <div className="home-dashboard">
            <div className="home-top">
              {/* 화면 제목은 머리글 '오늘의 운영' 하나만 두고 여기에는 날짜만 */}
              <p className="home-top__title">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
            <section className="home-search" aria-label="업무 검색">
              <label className="home-search__box">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="식자재, 거래처, 메뉴명을 검색해보세요"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSearchSubmit()
                    }
                  }}
                />
              </label>
              <button type="button" className="home-search__assistant" onClick={handleSearchSubmit} disabled={!normalizedSearchText || isSearchDataLoading || Boolean(searchDataError)}>
                🔍 통합 추천 검색
              </button>
              {normalizedSearchText ? (
                <div className="home-search__results" aria-live="polite">
                  {isSearchDataLoading ? <p className="home-search__summary">검색 데이터를 불러오는 중입니다.</p> : null}
                  {!isSearchDataLoading && primaryMatch ? (
                    <>
                      <p className="home-search__summary">
                        <strong>{primaryMatch.name}</strong> 항목을 {searchIntentLabels[primaryMatch.intent]}로 찾았습니다.
                        {primaryMatch.matchedIngredients && <span> 레시피 식재료: {primaryMatch.matchedIngredients}</span>}
                      </p>
                      {searchMatches.length > 1 ? (
                        <div className="home-search__matches" aria-label="다른 검색 결과">
                          {searchMatches.map((match) => (
                            <button
                              key={`${match.intent}-${match.id}-${match.name}`}
                              type="button"
                              className={`home-search__match${match === primaryMatch ? ' is-active' : ''}`}
                              onClick={() => navigateWithSearch(searchActions.find((action) => action.intent === match.intent)?.path ?? '/home', match)}
                            >
                              {searchIntentLabels[match.intent]} · {match.name}
                              {match.matchedIngredients && <small> · 레시피 식재료: {match.matchedIngredients}</small>}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {suggestedActions.map((action) => (
                        <button
                          key={`${action.intent}-${action.title}`}
                          type="button"
                          className="home-search__result"
                          onClick={() => navigateWithSearch(action.path, primaryMatch)}
                        >
                          <span className="home-search__category">{action.category}</span>
                          <span className="home-search__result-text">
                            <strong>{action.title}</strong>
                            <span>{action.description}</span>
                          </span>
                          <span className="home-search__arrow" aria-hidden="true">
                            →
                          </span>
                        </button>
                      ))}
                    </>
                  ) : null}
                  {!isSearchDataLoading && !primaryMatch ? (
                    <p className="home-search__summary">
                      <strong>{normalizedSearchText}</strong>와 일치하는 식자재, 거래처, 메뉴가 없습니다.
                      {searchDataError ? ` ${searchDataError}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {recent.length || popular.length ? <div className="home-search__keywords">
                {recent.length ? <span><b>최근</b>{recent.map(value => <button key={value} type="button" onClick={() => setSearchText(value)}>{value}</button>)}</span> : null}
                {popular.length ? <span><b>많이 찾는</b>{popular.map(item => <button key={item.query} type="button" onClick={() => setSearchText(item.query)}>{item.query}</button>)}</span> : null}
              </div> : null}
            </section>
            </div>

            <DailyWork />

            <section className="home-shortcuts" aria-labelledby="home-shortcuts-title">
              <h2 id="home-shortcuts-title">자주 쓰는 화면</h2>
              <div className="home-shortcuts__grid">
                {shortcuts.map(card => <button key={card.path} type="button" className="home-shortcut" onClick={() => navigate(card.path)}>
                  <span className="home-shortcut__icon"><WorkspaceIcon name={card.icon} /></span>
                  <span className="home-shortcut__text"><strong>{card.title}</strong><small>{card.description}</small></span>
                </button>)}
              </div>
            </section>
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default Home
