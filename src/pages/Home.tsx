import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'
import SideMenuLayout from '../components/SideMenuLayout'
import {
  getAccountOptions,
  getIngredientOptions,
  getMenuManagerList,
  type AccountOption,
  type IngredientOption,
  type MenuManagerItem,
} from '../api/operations'
import './Home.css'
import order from '../assets/image/icons8-order-100-Photoroom.png'
import hygiene from '../assets/image/icons8-hygiene-64-Photoroom.png'
import operation from '../assets/image/icons8-capability-64-Photoroom.png'
import basket from '../assets/image/3.png'

const menus = [
  {
    key: 'order',
    title: '발주 관리',
    description: '주문 현황과 발주서를 한눈에 확인',
    badge: '오늘 12건',
    icon: <img src={order} alt="" />,
    path: '/order_manager',
  },
  {
    key: 'food-order',
    title: '식자재 발주',
    description: '자주 쓰는 품목을 빠르게 재주문',
    badge: '추천',
    icon: <img src={operation} alt="" />,
    path: '/order_manager/food_order',
  },
  {
    key: 'inventory',
    title: '재고 관리',
    description: '부족 품목과 재고 흐름 체크',
    badge: '준비중',
    icon: <img src={hygiene} alt="" />,
  },
  {
    key: 'hygiene',
    title: '위생 관리',
    description: '거래처별 점검 상태 관리',
    badge: '안전',
    icon: <img src={hygiene} alt="" />,
    path: '/sanitation/vendor',
  },
  {
    key: 'operation',
    title: '운영 관리',
    description: '메뉴와 식단표 운영 도구',
    badge: '3개 도구',
    icon: <img src={operation} alt="" />,
    path: '/operations/menu',
  },
]

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

type SearchMatch = {
  intent: SearchIntent
  id: string
  name: string
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
  menus: MenuManagerItem[],
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
    .filter((menu) => matchesName(menu.menu_name))
    .map((menu) => toMatch('menu', menu.menu_id, menu.menu_name))
    .sort(sortByRelevance)
    .slice(0, 2)

  return [...ingredientMatches, ...accountMatches, ...menuMatches]
}

const insightCards = [
  { label: '오늘 마감 발주', value: '12', unit: '건', tone: 'mint' },
  { label: '검수 대기 거래처', value: '4', unit: '곳', tone: 'coral' },
  { label: '이번 주 식단표', value: '7', unit: '개', tone: 'lime' },
]

function Home() {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [menuItems, setMenuItems] = useState<MenuManagerItem[]>([])
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
    let isMounted = true

    const loadSearchData = async () => {
      setIsSearchDataLoading(true)
      setSearchDataError('')

      const [ingredientResult, accountResult, menuResult] = await Promise.allSettled([
        getIngredientOptions(),
        getAccountOptions(),
        getMenuManagerList(),
      ])

      if (!isMounted) {
        return
      }

      if (ingredientResult.status === 'fulfilled') {
        setIngredients(ingredientResult.value)
      }

      if (accountResult.status === 'fulfilled') {
        setAccounts(accountResult.value)
      }

      if (menuResult.status === 'fulfilled') {
        setMenuItems(menuResult.value)
      }

      if ([ingredientResult, accountResult, menuResult].some((result) => result.status === 'rejected')) {
        setSearchDataError('일부 검색 데이터를 불러오지 못했습니다.')
      }

      setIsSearchDataLoading(false)
    }

    void loadSearchData()

    return () => {
      isMounted = false
    }
  }, [])

  const navigateWithSearch = (path: string, match = primaryMatch) => {
    const query = normalizedSearchText
    const params = new URLSearchParams()

    if (query) {
      params.set('q', query)
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
    navigate(queryString ? `${path}?${queryString}` : path)
  }

  const handleSearchSubmit = () => {
    const [firstAction] = suggestedActions

    if (firstAction && primaryMatch) {
      navigateWithSearch(firstAction.path, primaryMatch)
    }
  }

  return (
    <div className="home-page">
      <main className="home-content">
        <SideMenuLayout header={<HeaderBar title="오늘의 운영" breadcrumbs={[{ label: '홈' }]} />}>
          <div className="home-dashboard">
            <section className="home-hero" aria-labelledby="home-hero-title">
              <img className="home-hero__background" src={basket} alt="" aria-hidden="true" />
              <div className="home-hero__copy">
                <p className="home-hero__eyebrow">THE FULL PICK</p>
                <h1 id="home-hero-title">오늘 필요한 운영 업무를 먼저 챙겨보세요</h1>
                <p>발주, 위생, 메뉴 관리를 쇼핑하듯 가볍게 둘러보고 바로 처리할 수 있게 정리했습니다.</p>
                <div className="home-hero__actions">
                  <button type="button" className="home-hero__primary" onClick={() => navigate('/order_manager/food_order')}>
                    식자재 발주
                  </button>
                  <button type="button" className="home-hero__primary" onClick={() => navigate('/operations/menu')}>
                    메뉴관리
                  </button>
                  <button type="button" className="home-hero__primary" onClick={() => navigate('/operations/account-menu')}>
                    일터 메뉴관리
                  </button>
                  <button type="button" className="home-hero__primary" onClick={() => navigate('/operations/table-meals')}>
                    식단표 보기
                  </button>
                </div>
              </div>
              <div className="home-hero__visual" aria-hidden="true">
                {/* <span className="home-hero__deal">신선식품 추천</span> */}
              </div>
            </section>

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
              {normalizedSearchText ? (
                <div className="home-search__results" aria-live="polite">
                  {isSearchDataLoading ? <p className="home-search__summary">검색 데이터를 불러오는 중입니다.</p> : null}
                  {!isSearchDataLoading && primaryMatch ? (
                    <>
                      <p className="home-search__summary">
                        <strong>{primaryMatch.name}</strong> 항목을 {searchIntentLabels[primaryMatch.intent]}로 찾았습니다.
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
            </section>

            <section className="menu-section" aria-labelledby="home-menu-title">
              <div className="home-section-heading">
                <p>카테고리</p>
                <h2 id="home-menu-title">어떤 업무를 처리할까요?</h2>
              </div>
              <div className="menu-grid">
                {menus.map((menu) => (
                  <button
                    key={menu.key}
                    type="button"
                    className="menu-card"
                    onClick={() => menu.path && navigate(menu.path)}
                  >
                    <span className="menu-card__badge">{menu.badge}</span>
                    <span className="menu-card__icon" aria-hidden="true">
                      {menu.icon}
                    </span>
                    <span className="menu-card__text">
                      <span className="menu-card__title">{menu.title}</span>
                      <span className="menu-card__description">{menu.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="home-insights" aria-label="운영 요약">
              {insightCards.map((card) => (
                <article key={card.label} className={`home-insight home-insight--${card.tone}`}>
                  <p>{card.label}</p>
                  <strong>
                    {card.value}
                    <span>{card.unit}</span>
                  </strong>
                </article>
              ))}
            </section>
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default Home
