import { useMemo, useState } from 'react'
import type { AccountOption } from '../api/operations'
import { supplierBackground, supplierLabel, type AccountSuppliers } from '../features/workspace/accountSuppliers'
import TouchIcon from './TouchIcon'

/** 매핑 색 층. 전역 button 규칙이 background-image를 !important로 지우므로 버튼 안 뒤쪽 층에 칠한다(PC SupplierTint와 같은 방식) */
function Tint({ flags }: { flags?: AccountSuppliers }) {
  const background = supplierBackground(flags)
  return background ? <span className="t-account-tint" style={{ background }} aria-hidden="true" /> : null
}

/**
 * 터치 '관리 거래처' 고르기(본사). 기본 select 목록은 줄마다 색을 칠할 수 없어, PC(WorkspaceAccountPicker)처럼
 * 공급사 사업장 매핑 색(왼쪽 웰스토리 주황 · 오른쪽 아워홈 파랑)이 보이는 목록 창으로 고른다.
 */
export default function TouchAccountPicker({ accounts, accountId, suppliers, onChange }: {
  accounts: AccountOption[]
  accountId: string
  suppliers: Map<string, AccountSuppliers>
  onChange: (accountId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? accounts.filter(option => `${option.text} ${option.value}`.toLowerCase().includes(q)) : accounts
  }, [accounts, query])
  const name = accountId ? accounts.find(option => option.value === accountId)?.text || accountId : '전체 거래처'
  const close = () => { setOpen(false); setQuery('') }
  const choose = (value: string) => {
    close()
    if (value !== accountId) onChange(value)
  }
  const current = supplierLabel(suppliers.get(accountId))

  return <>
    <button type="button" className="t-chip t-chip--select t-account-trigger" aria-haspopup="dialog" aria-label={`거래처: ${name}${current ? ` (${current} 매핑)` : ''}`}
      title={current || undefined} onClick={() => setOpen(true)}>
      <Tint flags={suppliers.get(accountId)} /><TouchIcon name="store" /><span>{name}</span>
    </button>
    {open && <div className="t-sheet-backdrop" role="presentation" onClick={close}>
      <section className="t-sheet t-account-sheet" role="dialog" aria-modal="true" aria-labelledby="t-account-title" onClick={e => e.stopPropagation()}>
        <header className="t-sheet__head">
          <h2 id="t-account-title">관리 거래처</h2>
          <p className="t-account-legend" aria-hidden="true"><i className="is-welstory" />웰스토리 <i className="is-ourhome" />아워홈 <span>매핑된 사업장</span></p>
          <label className="t-chip t-account-search">
            <TouchIcon name="search" />
            <input type="search" enterKeyHint="search" placeholder="거래처 이름 검색" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && filtered[0]) choose(filtered[0].value) }} />
          </label>
        </header>
        <div className="t-sheet__body">
          <div className="t-account-list" role="listbox" aria-label="관리 거래처 선택">
            {!query && <button type="button" role="option" aria-selected={accountId === ''} className={accountId === '' ? 'is-selected' : ''} onClick={() => choose('')}>
              <span>전체 거래처<small>홈에서 모든 거래처 현황</small></span>
            </button>}
            {filtered.map(option => {
              const flags = suppliers.get(option.value)
              const label = supplierLabel(flags)
              return <button type="button" role="option" key={option.value} aria-selected={option.value === accountId} className={option.value === accountId ? 'is-selected' : ''}
                aria-label={label ? `${option.text || option.value} (${label} 매핑)` : undefined} onClick={() => choose(option.value)}>
                <Tint flags={flags} /><span>{option.text || option.value}</span>
                {option.value === accountId && <TouchIcon name="check" size={20} />}
              </button>
            })}
            {!filtered.length && <p className="t-msg">검색 결과가 없습니다.</p>}
          </div>
        </div>
        <footer className="t-sheet__actions"><button type="button" className="t-btn" onClick={close}>닫기</button></footer>
      </section>
    </div>}
  </>
}
