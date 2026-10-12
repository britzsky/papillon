import { buildApiUrl } from '../config/api'

/** 식단표 PDF 등에 적힌 메뉴 표기 → 거래처 메뉴. 사람이 한 번 고른 연결을 거래처별로 기억한다. */
export type MenuAlias = { alias_id: number; alias_name: string; alias_key: string; menu_id: string; menu_name: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { message?: string }).message || '메뉴 연결을 처리하지 못했습니다.')
  return data as T
}

export const getMenuAliases = (accountId: string, menuId?: string) =>
  call<MenuAlias[]>(`/v2/menu-management/aliases?${new URLSearchParams({ account_id: accountId, ...(menuId ? { menu_id: menuId } : {}) })}`)

export const saveMenuAliases = (accountId: string, aliases: { alias_name: string; menu_id: string }[]) =>
  call<{ saved_count: number; skipped_count: number }>('/v2/menu-management/aliases', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, user_id: localStorage.getItem('user_id') || '', aliases }),
  })

export const deleteMenuAlias = (accountId: string, aliasId: number) =>
  call('/v2/menu-management/aliases', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, alias_id: aliasId }),
  })
