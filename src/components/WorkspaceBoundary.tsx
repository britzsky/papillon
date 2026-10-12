import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { buildApiUrl } from '../config/api'

type Session = { userId: string; userType: string; accountId: string }
function ProtectedWorkspace({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const location = useLocation()
  useEffect(() => {
    const controller = new AbortController()
    void fetch(buildApiUrl('/User/Session'), { signal: controller.signal }).then(async response => {
      if (!response.ok) { if (!controller.signal.aborted) setState(response.status === 401 || response.status === 403 ? 'login' : 'error'); return }
      const user = await response.json() as Session
      if (!['2', '3'].includes(user.userType)) { setState('login'); return }
      localStorage.setItem('user_id', user.userId)
      localStorage.setItem('user_type', user.userType)
      if (user.userType === '3') localStorage.setItem('account_id', user.accountId)
      if (!controller.signal.aborted) setState('ready')
    }).catch(() => { if (!controller.signal.aborted) setState('error') })
    return () => controller.abort()
  }, [revision])
  if (state === 'login') return <Navigate to="/" replace />
  if (state === 'loading') return <p role="status">로그인 정보를 확인하고 있습니다.</p>
  if (state === 'error') return <div role="alert"><p>서버 연결을 확인하지 못했습니다.</p><button onClick={() => { setState('loading'); setRevision(value => value + 1) }}>다시 확인</button></div>
  const hqOnly = ['/order_manager/suppliers', '/order_manager/supplier-sites', '/order_manager/welstory', '/inventory/ingredients', '/operations/menu', '/operations/account', '/operations/search-analytics']
  if (localStorage.getItem('user_type') === '3' && hqOnly.includes(location.pathname)) return <Navigate to="/home" replace />
  return children
}
export default function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  if (pathname === '/' || pathname.startsWith('/payment') || pathname.startsWith('/billing')) return children
  return <ProtectedWorkspace>{children}</ProtectedWorkspace>
}
