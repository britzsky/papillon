import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildApiUrl } from '../../config/api'
import { getAccountOptions, type AccountOption, type IngredientOption, type MenuManagerItem } from '../../api/operations'
import { trackSearchSelection, trackSearch, getPopularSearches, type SearchEntity } from '../../api/analytics'

export type SearchIntent = 'ingredient' | 'vendor' | 'menu'

export const searchIntentLabels: Record<SearchIntent, string> = {
  ingredient: '식자재',
  vendor: '거래처',
  menu: '메뉴',
}

export type SearchAction = {
  intent: SearchIntent
  category: string
  title: string
  description: string
  path: string
}

type SearchMenuItem = MenuManagerItem & { matched_ingredients?: string }

export type SearchMatch = {
  intent: SearchIntent
  id: string
  name: string
  matchedIngredients?: string
}

export const searchActions: SearchAction[] = [
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

/**
 * 홈 통합 검색(PC·터치 공용): 식자재·거래처·메뉴 검색, 추천 이동 화면, 최근·많이 찾는 검색어, 검색 기록.
 */
export function useHomeSearch() {
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

  /** 검색 결과 버튼(다른 결과)을 눌렀을 때 그 종류의 첫 추천 화면으로 이동. */
  const openMatch = (match: SearchMatch) =>
    navigateWithSearch(searchActions.find((action) => action.intent === match.intent)?.path ?? '/home', match)

  const handleSearchSubmit = () => {
    if (!normalizedSearchText || isSearchDataLoading || searchDataError) return
    const next = [normalizedSearchText, ...recent.filter(value => value !== normalizedSearchText)].slice(0, 8)
    setRecent(next); localStorage.setItem(recentKey, JSON.stringify(next))
    const entities: Record<SearchIntent, SearchEntity['entity_type']> = { menu: 'MENU', ingredient: 'INGREDIENT', vendor: 'VENDOR' }
    void trackSearch({ query: normalizedSearchText, intent: 'INTEGRATED_SEARCH', screen: 'HOME', results: searchMatches.map((match, index) => ({ entity_type: entities[match.intent], entity_id: match.id, position_no: index + 1 })) }).catch(() => {})
  }

  return {
    searchText, setSearchText, normalizedSearchText, searchMatches, primaryMatch, suggestedActions,
    isSearchDataLoading, searchDataError, recent, popular, navigateWithSearch, openMatch, handleSearchSubmit,
  }
}
