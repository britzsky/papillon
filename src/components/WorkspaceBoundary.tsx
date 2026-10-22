import { visibleForRole } from '../features/workspace/roleScreens'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { buildApiUrl } from '../config/api'
import { rememberWorkspaceAccount, urlAccountId, workspaceAccountId } from '../features/workspace/workspaceAccount'

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
  // 역할에 맞지 않는 화면(현장 → 본사 전용, 본사 → 거래처 메뉴 관리 등)은 홈으로
  if (!visibleForRole(location.pathname)) return <Navigate to="/home" replace />
  return <AccountScope>{children}</AccountScope>
}

/**
 * 관리 거래처가 바뀌면 화면을 그 거래처로 처음부터 다시 연다(화면마다 상태로 들고 있는 거래처가 섞이지 않게).
 * 본사가 링크(?account_id)로 연 거래처는 '마지막으로 고른 거래처'로 기억한다.
 */
function AccountScope({ children }: { children: ReactNode }) {
  const location = useLocation()
  const fromUrl = urlAccountId(location.search)
  useEffect(() => { if (fromUrl) rememberWorkspaceAccount(fromUrl) }, [fromUrl])
  return <Fragment key={workspaceAccountId(location.search) || 'all'}>{children}</Fragment>
}
export default function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  if (pathname === '/' || pathname.startsWith('/payment') || pathname.startsWith('/billing')) return children
  return <ProtectedWorkspace>{children}</ProtectedWorkspace>
}
