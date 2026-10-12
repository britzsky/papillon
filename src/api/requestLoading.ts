import { API_ORIGIN } from '../config/api'

/**
 * 앱 전체 서버 요청의 진행 상태. 화면마다 로딩을 따로 넣지 않고 fetch를 한 곳에서 감싸 센다.
 * - 조회(GET·HEAD): read  → 화면을 막지 않는 상단 진행률 막대
 * - 저장·발주 등(그 외 메서드): write → 진행률 로딩 화면(중복 클릭 방지)
 * 사용자가 기다리지 않는 백그라운드 요청(주기 조회·상태 폴링)은 세지 않는다.
 * 개별 요청을 빼려면 fetch(url, { ...init, loading: false }).
 */
declare global {
  interface RequestInit {
    /** false면 전역 로딩 표시에서 제외(백그라운드 요청) */
    loading?: boolean
  }
}

export type LoadingSnapshot = { read: number; write: number }

// 주기적으로 스스로 도는 요청: 마감 알림, 업무 알림 갱신, 납품일 상품 준비 상태 폴링
const BACKGROUND_PATHS = ['/Procurement/DeadlineAlerts', '/v2/workspace/notifications', '/v2/workspace/alerts', '/v2/supplier-integration/preparation']

let snapshot: LoadingSnapshot = { read: 0, write: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const change = (kind: keyof LoadingSnapshot, delta: number) => {
  snapshot = { ...snapshot, [kind]: Math.max(0, snapshot[kind] + delta) }
  emit()
}

export function subscribeLoading(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const getLoadingSnapshot = () => snapshot

let installed = false
/** installWorkspaceSession 다음에 호출한다(세션 래퍼까지 포함한 전체 요청 시간을 잰다). */
export function installRequestLoading() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  const base = new URL(API_ORIGIN.endsWith('/') ? API_ORIGIN : `${API_ORIGIN}/`)
  window.fetch = (input, init) => {
    const request = input instanceof Request ? input : null
    let url: URL
    try { url = new URL(request ? request.url : String(input), window.location.href) } catch { return original(input, init) }
    const api = url.origin === base.origin && url.pathname.startsWith(base.pathname)
    if (!api || init?.loading === false || BACKGROUND_PATHS.some(path => url.pathname.includes(path))) return original(input, init)
    const method = (init?.method || request?.method || 'GET').toUpperCase()
    const kind: keyof LoadingSnapshot = method === 'GET' || method === 'HEAD' ? 'read' : 'write'
    change(kind, 1)
    let finished = false
    const done = () => { if (!finished) { finished = true; change(kind, -1) } }
    try {
      return original(input, init).finally(done)
    } catch (error) {
      done()
      throw error
    }
  }
}
