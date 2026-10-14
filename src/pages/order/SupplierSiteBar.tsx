import type { ReactNode } from 'react'

export type SiteOption = { code: string; name: string; sub?: string }
type Props = {
  supplierName: string
  sites: SiteOption[]
  selected: string
  onSelect?: (code: string) => void
  disabled?: boolean
  emptyText: string
  facts: [string, ReactNode][]
  updated: string
  notice?: ReactNode
  actions: ReactNode
}

/** 공급사 통합 연동 — 사업장 정보 줄(웰스토리·아워홈 공통). 검색조건처럼 한 줄: 사업장 선택 · 사업장 정보 · 작업. */
export default function SupplierSiteBar({ supplierName, sites, selected, onSelect, disabled, emptyText, facts, updated, notice, actions }: Props) {
  const current = sites.find(site => site.code === selected)
  return <section className="supplier-site-bar" aria-label={`${supplierName} 사업장`}>
    <div className="supplier-site-bar__row">
      <label className="supplier-site-bar__site">
        <span>{supplierName} 사업장 <small>{sites.length}개</small></span>
        {sites.length > 1
          ? <select value={selected} disabled={disabled} onChange={event => onSelect?.(event.target.value)}>{sites.map(site => <option key={site.code} value={site.code}>{site.name || site.code} ({site.code})</option>)}</select>
          : current ? <strong>{current.name || current.code}</strong> : <em>{emptyText}</em>}
      </label>
      {facts.length > 0 && <dl className="supplier-site-bar__facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      <div className="supplier-site-bar__actions"><small>{updated}</small>{actions}</div>
    </div>
    {notice}
  </section>
}
