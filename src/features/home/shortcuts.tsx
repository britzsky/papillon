import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { visibleForRole } from '../workspace/roleScreens'
import { workspaceAccountId } from '../workspace/workspaceAccount'

export type Shortcut = { key: string; label: string; paths: string[]; icon: ReactNode }

const svg = (children: ReactNode) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

/**
 * 자주 가는 화면. paths는 앞에서부터 이 역할이 볼 수 있는 첫 화면으로 간다
 * (메뉴 관리: 현장 = 거래처 메뉴, 본사 = 본사 메뉴). 볼 수 있는 화면이 없으면 버튼을 뺀다.
 */
const SHORTCUTS: Shortcut[] = [
  { key: 'meals', label: '식단표 관리', paths: ['/operations/table-meals'],
    icon: svg(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" /></>) },
  { key: 'order', label: '발주하기', paths: ['/order_manager/order'],
    icon: svg(<><path d="M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>) },
  { key: 'orders', label: '발주·입고', paths: ['/order_manager/orders'],
    icon: svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13l2 2 4-4" /></>) },
  { key: 'inventory', label: '재고 관리', paths: ['/inventory/account'],
    icon: svg(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>) },
  { key: 'menu', label: '메뉴 관리', paths: ['/operations/account-menu', '/operations/menu'],
    icon: svg(<><path d="M4 13h16a8 8 0 0 1-16 0z" /><path d="M2 21h20M12 5v3M8.5 6.5l1 2M15.5 6.5l-1 2" /></>) },
  { key: 'sanitation', label: '위생 점검', paths: ['/sanitation/vendor'],
    icon: svg(<><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>) },
  { key: 'mall', label: '더채움몰', paths: ['/mall'],
    icon: svg(<><path d="M4 8h16l-1.5 12h-13z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>) },
]

/**
 * 이 역할이 볼 수 있는 바로가기와 갈 주소(관리 거래처 account_id 포함). keys를 주면 그 순서로 그것만.
 * 홈 바로가기 줄(HomeShortcuts)과 오른쪽 인사 카드(HomeProfileCard) 버튼 4개가 같이 쓴다.
 */
export function useShortcutLinks(keys?: string[]) {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  const withAccount = (to: string) => accountId ? `${to}?${new URLSearchParams({ account_id: accountId })}` : to
  const list = keys ? keys.map(key => SHORTCUTS.find(item => item.key === key)).filter((item): item is Shortcut => Boolean(item)) : SHORTCUTS
  return list
    .map(item => ({ ...item, to: item.paths.find(path => visibleForRole(path)) }))
    .filter((item): item is Shortcut & { to: string } => Boolean(item.to))
    .map(item => ({ ...item, to: withAccount(item.to) }))
}
