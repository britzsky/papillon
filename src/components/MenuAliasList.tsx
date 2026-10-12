import { useEffect, useState } from 'react'
import { deleteMenuAlias, getMenuAliases, type MenuAlias } from '../api/menuAliases'

/** 거래처 메뉴 관리: 이 메뉴로 자동 연결되는 식단표 표기 목록. 잘못 연결된 표기를 지우는 곳. */
export default function MenuAliasList({ accountId, menuId }: { accountId: string; menuId: string }) {
  const [aliases, setAliases] = useState<MenuAlias[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let alive = true
    getMenuAliases(accountId, menuId)
      .then(rows => { if (alive) { setAliases(rows); setError('') } })
      .catch(e => { if (alive) { setAliases([]); setError(e instanceof Error ? e.message : '') } })
    return () => { alive = false }
  }, [accountId, menuId, revision])

  const remove = async (alias: MenuAlias) => {
    if (!window.confirm(`'${alias.alias_name}' 표기를 이 메뉴에 자동 연결하지 않을까요?\n다음 식단표 PDF부터는 다시 직접 골라야 합니다.`)) return
    try { await deleteMenuAlias(accountId, alias.alias_id); setRevision(r => r + 1) }
    catch (e) { setError(e instanceof Error ? e.message : '연결을 삭제하지 못했습니다.') }
  }

  if (!aliases.length && !error) return null
  return <div className="menu-alias-list">
    <strong>식단표 표기 연결</strong>
    {aliases.map(alias => <span key={alias.alias_id} className="menu-alias-list__item">
      {alias.alias_name}
      <button type="button" aria-label={`${alias.alias_name} 연결 삭제`} title="연결 삭제" onClick={() => void remove(alias)}>×</button>
    </span>)}
    {error && <small role="alert">{error}</small>}
  </div>
}
