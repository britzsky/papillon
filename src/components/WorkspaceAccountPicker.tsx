import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getAccountOptions, type AccountOption } from '../api/operations'
import { accountSwitchUrl, isHeadquarters, rememberWorkspaceAccount, workspaceAccountId } from '../features/workspace/workspaceAccount'
import { supplierBackground, supplierLabel, useAccountSuppliers, type AccountSuppliers } from '../features/workspace/accountSuppliers'

/** 공급사 사업장 매핑 색(왼쪽 웰스토리 주황 · 오른쪽 아워홈 파랑). 전역 button 배경 규칙(!important)을 피하려고 버튼 안 뒤쪽 층에 칠한다 */
function SupplierTint({ flags }: { flags?: AccountSuppliers }) {
  const background = supplierBackground(flags)
  return background ? <span className="workspace-account__tint" style={{ background }} aria-hidden="true" /> : null
}

/**
 * 머리 줄의 '관리 거래처'(2026-10-16 사용자 결정). 화면마다 따로 고르지 않고 여기 한 곳에서 고른다.
 * 본사: 모든 거래처 검색·선택(+ 전체 거래처), 바꾸면 지금 화면을 그 거래처로 다시 연다. 거래처 계정: 자기 거래처 이름만(바꿀 수 없음).
 * 본사 목록은 공급사 사업장 매핑을 색으로 보여 준다(2026-10-26): 웰스토리 왼쪽 절반 주황, 아워홈 오른쪽 절반 파랑.
 */
export default function WorkspaceAccountPicker() {
  const location = useLocation()
  const navigate = useNavigate()
  const headquarters = isHeadquarters()
  const current = workspaceAccountId(location.search)
  const [options, setOptions] = useState<AccountOption[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const suppliers = useAccountSuppliers(headquarters)
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!headquarters) return
    let alive = true
    getAccountOptions().then(items => { if (alive) setOptions(items) }).catch(() => { if (alive) setOptions([]) })
    return () => { alive = false }
  }, [headquarters])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => `${o.text} ${o.value}`.toLowerCase().includes(q)) : options
  }, [options, query])

  if (!headquarters) {
    const name = localStorage.getItem('account_name') || current
    return <div className="rd workspace-account is-fixed" title="거래처 계정은 자기 거래처만 관리합니다"><span className="rd-muted">거래처</span><strong>{name}</strong></div>
  }

  const name = current ? options.find(o => o.value === current)?.text || current : '전체 거래처'
  const choose = (accountId: string) => {
    setOpen(false); setQuery('')
    if (accountId === current) return
    rememberWorkspaceAccount(accountId)
    navigate(accountSwitchUrl(location.pathname, location.search, accountId))
  }
  return (
    <div className="rd workspace-account" ref={box}>
      <span className="rd-muted">관리 거래처</span>
      <button type="button" className="workspace-account__trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <SupplierTint flags={suppliers.get(current)} /><strong title={supplierLabel(suppliers.get(current)) || undefined}>{name}</strong><span aria-hidden="true">▾</span>
      </button>
      {open ? <div className="workspace-account__pop" role="listbox" aria-label="관리 거래처 선택">
        <input autoFocus className="rd-input" placeholder="거래처 이름 검색" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && filtered[0]) choose(filtered[0].value) }} />
        <p className="workspace-account__legend" aria-hidden="true"><i className="is-welstory" />웰스토리 <i className="is-ourhome" />아워홈 <span>매핑된 사업장</span></p>
        <div className="workspace-account__list">
          {!query ? <button type="button" role="option" aria-selected={current === ''} className={current === '' ? 'is-selected' : ''} onClick={() => choose('')}>전체 거래처<small>홈에서 모든 거래처 현황</small></button> : null}
          {filtered.map(o => {
            const flags = suppliers.get(o.value)
            const label = supplierLabel(flags)
            return <button type="button" role="option" key={o.value} aria-selected={o.value === current} className={o.value === current ? 'is-selected' : ''}
              aria-label={label ? `${o.text || o.value} (${label} 매핑)` : undefined} onClick={() => choose(o.value)}>
              <SupplierTint flags={flags} /><span>{o.text || o.value}</span>
            </button>
          })}
          {!filtered.length ? <p className="rd-muted">검색 결과가 없습니다.</p> : null}
        </div>
      </div> : null}
    </div>
  )
}
