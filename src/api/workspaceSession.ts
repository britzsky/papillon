import { API_ORIGIN } from '../config/api'

let installed = false
export function installWorkspaceSession() {
  if (installed) return
  installed = true
  const original = window.fetch.bind(window)
  const base = new URL(API_ORIGIN.endsWith('/') ? API_ORIGIN : `${API_ORIGIN}/`)
  window.fetch = (input, init) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request ? request.url : String(input), window.location.href)
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return original(input, init)
    const method = (init?.method || request?.method || 'GET').toUpperCase()
    if (method === 'GET' && localStorage.getItem('user_type') === '3' && !url.searchParams.has('account_id')) {
      const account = localStorage.getItem('account_id')
      if (account) url.searchParams.set('account_id', account)
    }
    const headers = new Headers(init?.headers || request?.headers)
    if (!['GET', 'HEAD'].includes(method)) headers.set('X-Workspace-Request', '1')
    return original(request ? new Request(url, request) : url, { ...init, headers, credentials: 'include' })
  }
}
