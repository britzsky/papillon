import { buildApiUrl } from '../config/api'
import { newRequestKey } from '../utils/requestKey'

export type SearchEntity = {
  entity_type: 'MENU' | 'INGREDIENT' | 'VENDOR' | 'HYGIENE_GUIDE'
  entity_id: string
  position_no?: number
  context?: Record<string, unknown>
}

const SESSION_KEY = 'analytics_search_session_id'

function getSessionId() {
  if (typeof window === 'undefined') return newRequestKey()
  const existing = sessionStorage.getItem(SESSION_KEY)
  if (existing) return existing
  const created = newRequestKey()
  sessionStorage.setItem(SESSION_KEY, created)
  return created
}

function identity() {
  if (typeof window === 'undefined') return { account_id: '', user_id: '' }
  return {
    account_id: localStorage.getItem('account_id') ?? '',
    user_id: localStorage.getItem('user_id') ?? '',
  }
}

async function post(path: string, payload: Record<string, unknown>) {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  })
  if (!response.ok) throw new Error(`Analytics request failed: ${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

export async function trackSearch(params: {
  query: string
  intent: string
  screen: string
  results: SearchEntity[]
  filters?: Record<string, unknown>
}) {
  const query = params.query.trim()
  if (!query) return null
  return post('/Analytics/Search', {
    ...identity(),
    search_session_id: getSessionId(),
    channel: 'SEARCH',
    query_raw: query,
    intent_type: params.intent,
    result_count: params.results.length,
    screen: params.screen,
    filters: params.filters ?? {},
    results: params.results,
  })
}

export async function trackSearchSelection(params: {
  query: string
  intent: string
  screen: string
  selected: SearchEntity
  results: SearchEntity[]
  context?: Record<string, unknown>
}) {
  try {
    const search = await trackSearch(params)
    await post('/Analytics/Action', {
      ...identity(),
      search_session_id: getSessionId(),
      search_event_id: search?.search_event_id,
      action_type: 'CLICK',
      screen: params.screen,
      entity_type: params.selected.entity_type,
      entity_id: params.selected.entity_id,
      position_no: params.selected.position_no,
      context: params.context ?? {},
    })
  } catch {
    // 분석 수집 실패가 사용자의 업무 이동을 막지 않도록 한다.
  }
}

export async function trackAction(params: {
  action_type: string
  screen: string
  entity_type?: SearchEntity['entity_type']
  entity_id?: string
  position_no?: number
  context?: Record<string, unknown>
}) {
  try {
    await post('/Analytics/Action', {
      ...identity(), search_session_id: getSessionId(), ...params,
    })
  } catch {
    // 분석 수집 실패가 사용자 업무를 막지 않도록 한다.
  }
}

export async function getPopularSearches(limit = 8) {
  const params = new URLSearchParams({
    account_id: identity().account_id,
    days: '30',
    limit: String(limit),
  })
  const response = await fetch(`${buildApiUrl('/Analytics/PopularSearches')}?${params.toString()}`)
  if (!response.ok) return []
  return (await response.json()) as Array<{ query: string; search_count: number }>
}

export type SearchDashboard = {
  summary: { total_searches?: number; total_sessions?: number; no_result_searches?: number; result_rate?: number }
  popular_searches: Array<{ query: string; search_count: number; session_count?: number; last_searched_at?: string }>
  no_result_searches: Array<{ query: string; search_count: number; last_searched_at?: string }>
  intent_summary: Array<{ intent_type: string; search_count: number }>
}

export async function getSearchDashboard(days = 30): Promise<SearchDashboard> {
  const params = new URLSearchParams({ account_id: identity().account_id, days: String(days), limit: '20' })
  const response = await fetch(`${buildApiUrl('/Analytics/Dashboard')}?${params.toString()}`)
  if (!response.ok) throw new Error('검색어 통계를 불러오지 못했습니다.')
  return (await response.json()) as SearchDashboard
}

export type HygieneGuide = {
  guide_id: number
  category: string
  situation_code: string
  title: string
  risk_level: string
  guidance_text: string
  source_name: string
  source_url?: string
}

export async function getHygieneGuides() {
  const response = await fetch(buildApiUrl('/Analytics/Hygiene/Guides'))
  if (!response.ok) return []
  return (await response.json()) as HygieneGuide[]
}
