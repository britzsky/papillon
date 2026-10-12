import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'
import SideMenuLayout from '../components/SideMenuLayout'
import { getAccountOptions, getIngredientOptions, getMenuManagerList, type AccountOption, type IngredientOption, type MenuManagerItem } from '../api/operations'
import { getHygieneGuides, getPopularSearches, trackAction, trackSearch, type HygieneGuide, type SearchEntity } from '../api/analytics'
import './SearchAssistant.css'

type Result = SearchEntity & { title: string; description: string; category: string; path: string }
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '')

function SearchAssistant() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(initialQuery)
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery)
  const [menus, setMenus] = useState<MenuManagerItem[]>([])
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [guides, setGuides] = useState<HygieneGuide[]>([])
  const [popular, setPopular] = useState<Array<{ query: string; search_count: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getMenuManagerList(), getIngredientOptions(), getAccountOptions(), getHygieneGuides(), getPopularSearches()])
      .then(([menuData, ingredientData, accountData, guideData, popularData]) => {
        setMenus(menuData); setIngredients(ingredientData); setAccounts(accountData); setGuides(guideData); setPopular(popularData)
      })
      .finally(() => setLoading(false))
  }, [])

  const results = useMemo<Result[]>(() => {
    const needle = normalize(submittedQuery)
    if (!needle) return []
    const tokens = submittedQuery.split(/[\s,?.!]+/).map(normalize).filter((token) => token.length >= 2 && !['메뉴','추천','검색','만들','있는','해줘','알려줘'].includes(token))
    const includes = (...values: string[]) => values.some((value) => {
      const normalizedValue = normalize(value)
      return normalizedValue.includes(needle) || needle.includes(normalizedValue) || tokens.some((token) => normalizedValue.includes(token) || token.includes(normalizedValue))
    })
    const menuResults = menus.filter((item) => includes(item.menu_name, item.meal_category ?? '')).slice(0, 8).map((item) => ({
      entity_type: 'MENU' as const, entity_id: item.menu_id, title: item.menu_name,
      description: `${item.meal_category || '메뉴'} · 식단과 레시피를 확인합니다.`, category: '메뉴', path: `/operations/menu?q=${encodeURIComponent(item.menu_name)}`,
    }))
    const ingredientResults = ingredients.filter((item) => includes(item.ingredient_name, item.ingredient_id)).slice(0, 8).map((item) => ({
      entity_type: 'INGREDIENT' as const, entity_id: item.ingredient_id, title: item.ingredient_name,
      description: '재고, 발주 필요량과 연결 메뉴를 확인합니다.', category: '식자재', path: `/inventory/account?q=${encodeURIComponent(item.ingredient_name)}`,
    }))
    const accountResults = accounts.filter((item) => includes(item.text, item.value)).slice(0, 5).map((item) => ({
      entity_type: 'VENDOR' as const, entity_id: item.value, title: item.text,
      description: '사업장 메뉴와 식단 운영정보를 확인합니다.', category: '사업장', path: `/operations/account-menu?account_id=${encodeURIComponent(item.value)}`,
    }))
    const hygieneResults = guides.filter((item) => includes(item.title, item.category, item.guidance_text)).slice(0, 5).map((item) => ({
      entity_type: 'HYGIENE_GUIDE' as const, entity_id: String(item.guide_id), title: item.title,
      description: `${item.risk_level} · ${item.guidance_text}`, category: '위생', path: `/sanitation/vendor?q=${encodeURIComponent(submittedQuery)}`,
    }))
    return [...menuResults, ...ingredientResults, ...accountResults, ...hygieneResults].map((item, index) => ({ ...item, position_no: index + 1 }))
  }, [accounts, guides, ingredients, menus, submittedQuery])

  useEffect(() => {
    if (!submittedQuery || loading) return
    void trackSearch({ query: submittedQuery, intent: 'INTEGRATED_SEARCH', screen: 'SEARCH_ASSISTANT', results })
  }, [loading, results, submittedQuery])

  const runSearch = (value = query) => {
    const next = value.trim()
    if (!next) return
    setQuery(next); setSubmittedQuery(next)
  }

  const submit = (event: FormEvent) => { event.preventDefault(); runSearch() }
  const selectResult = (result: Result) => {
    void trackAction({ action_type: 'CLICK', screen: 'SEARCH_ASSISTANT', entity_type: result.entity_type, entity_id: result.entity_id, position_no: result.position_no, context: { query: submittedQuery, destination: result.path } })
    navigate(result.path)
  }

  return <div className="assistant-page"><SideMenuLayout header={<HeaderBar title="통합 추천 검색" breadcrumbs={[{ label: '홈' }, { label: '통합 추천 검색' }]} />}>
    <main className="assistant-content">
      <section className="assistant-hero"><p>THE FULL SEARCH</p><h1>메뉴·식자재·위생 상황을 한 번에 검색하세요</h1>
        <form onSubmit={submit}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 감자로 만들 수 있는 메뉴, 냉장고 온도가 높을 때 조치" autoFocus/><button>검색</button></form>
        <div className="assistant-examples">{['현재 재고로 만들 수 있는 메뉴','감자 활용 메뉴','냉장고 온도가 높을 때 조치'].map((text) => <button key={text} onClick={() => runSearch(text)}>{text}</button>)}</div>
      </section>
      {!submittedQuery && popular.length > 0 ? <section className="assistant-popular"><h2>최근 인기 검색어</h2><div>{popular.map((item, i) => <button key={item.query} onClick={() => runSearch(item.query)}><b>{i + 1}</b>{item.query}<span>{item.search_count}회</span></button>)}</div></section> : null}
      {submittedQuery ? <section className="assistant-results"><div className="assistant-results__head"><h2>“{submittedQuery}” 검색 결과</h2><span>{loading ? '검색 중' : `${results.length}건`}</span></div>
        {!loading && results.length === 0 ? <div className="assistant-empty"><strong>일치하는 결과가 없습니다.</strong><p>이 검색어는 결과 없음 항목으로 기록되어 서비스 개선에 활용됩니다.</p></div> : null}
        <div className="assistant-result-grid">{results.map((result) => <button className="assistant-result" key={`${result.entity_type}-${result.entity_id}`} onClick={() => selectResult(result)}><span>{result.category}</span><strong>{result.title}</strong><p>{result.description}</p><em>관련 화면으로 이동 →</em></button>)}</div>
      </section> : null}
    </main></SideMenuLayout></div>
}
export default SearchAssistant
