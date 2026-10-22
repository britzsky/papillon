import { useState } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { STORAGE_OPTIONS, isIngredientChanged, useIngredientMaster, type EditableIngredientMasterItem } from '../../features/inventory/useIngredientMaster'
import { qtyUnitOptions } from '../../pages/operations/menuManagerShared'
import './IngredientMasterTouch.css'

const PAGE = 60
const STORAGE_ICON: Record<string, TouchIconName> = { '': 'inventory', ROOM: 'store', REFRIGERATED: 'box', FROZEN: 'box', OTHER: 'box' }
const storageName = (value: string) => STORAGE_OPTIONS.find(option => option.value === value)?.text || value

/**
 * 식자재 관리(본사 식자재 목록, 태블릿·휴대폰): 위 보관유형 칸·분류 → 식자재 카드, 오른쪽에서 한 개씩 고쳐 저장.
 * 로직은 PC 표 편집과 같은 useIngredientMaster(한 개 저장은 save([행])).
 */
export default function IngredientMasterTouch() {
  const m = useIngredientMaster()
  const [selectedId, setSelectedId] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const selected = m.items.find(item => item.row_id === selectedId) || null
  const countByStorage = (value: string) => m.items.filter(item => (!value || item.storage_type === value)
    && (!m.category || item.category_name === m.category)
    && (!m.keyword.trim() || [item.ingredient_id, item.ingredient_name, item.category_name].some(v => v.toLowerCase().includes(m.keyword.trim().toLowerCase())))).length

  const toolbar = <>
    <label className="t-chip im-search">
      <TouchIcon name="search" />
      <input type="search" value={m.keyword} placeholder="식자재명 · ID 검색" onChange={e => { m.setKeyword(e.target.value); setLimit(PAGE) }} />
    </label>
    <button type="button" className="t-btn is-primary" onClick={() => { const row = m.addRow(); setSelectedId(row.row_id); setMessage(null) }}><span aria-hidden="true">＋</span>새 식자재</button>
  </>

  const aside = selected
    ? <EditPanel key={selected.row_id} item={selected} categories={m.categories} saving={m.isSaving} dirty={isIngredientChanged(selected, m.originals)} message={message}
      onChange={patch => { m.updateItem(selected.row_id, patch); setMessage(null) }}
      onClose={() => setSelectedId('')}
      onSave={async () => { const result = await m.save([selected]); setMessage({ ok: result.ok, text: result.message }) }} />
    : <div className="im-panel">
      <div className="im-panel__head"><h2>본사 식자재</h2><p>표준 식자재 목록입니다. 실제로 살 상품은 거래처 식재료에서 연결합니다.</p></div>
      <div className="im-panel__body">
        <div className="im-stats">{STORAGE_OPTIONS.map(option => <div key={option.value}><span>{option.text}</span><strong>{m.items.filter(item => item.storage_type === option.value).length}</strong></div>)}</div>
        <p className="im-panel__hint">식자재를 누르면 이름·분류·보관유형·기준단위를 여기서 고칠 수 있습니다.</p>
      </div>
    </div>

  return <TouchLayout title="식자재 관리" subtitle={`${m.filteredItems.length}개`} toolbar={toolbar} aside={aside} hideAccount>
    <div className="t-tabs" role="tablist" aria-label="보관유형">
      {[{ value: '', text: '전체' }, ...STORAGE_OPTIONS].map(option => <button key={option.value} type="button" role="tab" aria-selected={m.storageType === option.value}
        className={`t-tab${m.storageType === option.value ? ' is-active' : ''}`} onClick={() => { m.setStorageType(option.value); setLimit(PAGE) }}>
        <TouchIcon name={STORAGE_ICON[option.value]} /><strong>{option.text}</strong><small>{countByStorage(option.value)}개</small>
      </button>)}
    </div>
    {m.categories.length > 0 && <div className="im-cats" role="group" aria-label="카테고리">
      {['', ...m.categories].map(value => <button key={value || 'all'} type="button" className={m.category === value ? 'is-active' : ''} onClick={() => { m.setCategory(value); setLimit(PAGE) }}>{value || '모든 분류'}</button>)}
    </div>}

    {m.error && <p className="t-msg is-error">{m.error}</p>}
    {m.isLoading && <p className="t-msg" role="status">식자재를 불러오는 중…</p>}
    {!m.isLoading && !m.error && m.filteredItems.length === 0 && <p className="t-msg">조건에 맞는 식자재가 없습니다.</p>}

    <div className="im-grid">
      {m.filteredItems.slice(0, limit).map(item => {
        const dirty = isIngredientChanged(item, m.originals)
        return <button key={item.row_id} type="button" className={`t-card im-card${item.row_id === selectedId ? ' is-selected' : ''}`} onClick={() => { setSelectedId(item.row_id === selectedId ? '' : item.row_id); setMessage(null) }}>
          <span className="im-card__top">
            <span className="t-badge">{storageName(item.storage_type)}</span>
            {dirty && <span className="t-badge is-yellow">저장 안 됨</span>}
          </span>
          <strong>{item.ingredient_name || '(이름 없음)'}</strong>
          <small>{item.category_name || '분류 없음'} · {item.base_unit}</small>
          <span className="im-card__id">{item.ingredient_id}</span>
        </button>
      })}
    </div>
    {m.filteredItems.length > limit && <button type="button" className="t-btn is-soft is-block im-more" onClick={() => setLimit(v => v + PAGE)}>더 보기 ({m.filteredItems.length - limit}개 남음)</button>}
  </TouchLayout>
}

function EditPanel({ item, categories, saving, dirty, message, onChange, onClose, onSave }: {
  item: EditableIngredientMasterItem
  categories: string[]
  saving: boolean
  dirty: boolean
  message: { ok: boolean; text: string } | null
  onChange: (patch: Partial<EditableIngredientMasterItem>) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const [newCategory, setNewCategory] = useState(false)
  return <div className="im-panel">
    <div className="im-panel__head im-panel__head--edit">
      <div><h2>{item.is_new ? '새 식자재' : '식자재 고치기'}</h2><p>{item.ingredient_id}</p></div>
      <button type="button" className="t-btn is-icon is-ghost" aria-label="닫기" onClick={onClose}><TouchIcon name="close" /></button>
    </div>
    <div className="im-panel__body im-form">
      {message && <p className={`t-msg ${message.ok ? 'im-ok' : 'is-error'}`} role="status">{message.text}</p>}
      <label className="im-form__label" htmlFor="im-name">식자재명</label>
      <input id="im-name" className="im-input" value={item.ingredient_name} placeholder="예: 양파" onChange={e => onChange({ ingredient_name: e.target.value })} />

      <label className="im-form__label" htmlFor="im-category">카테고리</label>
      {newCategory || categories.length === 0
        ? <input id="im-category" className="im-input" value={item.category_name} placeholder="새 카테고리 이름" onChange={e => onChange({ category_name: e.target.value })} />
        : <select id="im-category" className="im-input" value={item.category_name} onChange={e => e.target.value === '__new' ? (setNewCategory(true), onChange({ category_name: '' })) : onChange({ category_name: e.target.value })}>
          <option value="">카테고리 선택</option>
          {categories.map(option => <option key={option} value={option}>{option}</option>)}
          <option value="__new">＋ 새 카테고리</option>
        </select>}

      <span className="im-form__label">보관유형</span>
      <div className="t-segment">{STORAGE_OPTIONS.map(option => <button key={option.value} type="button" className={item.storage_type === option.value ? 'is-active' : ''} onClick={() => onChange({ storage_type: option.value })}>{option.text}</button>)}</div>

      <span className="im-form__label">기준단위</span>
      <div className="im-units">{qtyUnitOptions.map(unit => <button key={unit} type="button" className={item.base_unit === unit ? 'is-active' : ''} onClick={() => onChange({ base_unit: unit })}>{unit}</button>)}</div>

      <label className="im-form__label" htmlFor="im-cost">표준 단가 (원/{item.base_unit || '기준단위'})</label>
      <input id="im-cost" className="im-input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="미등록 · 입고 전 식단 원가에 씀" value={item.standard_unit_cost} onChange={e => onChange({ standard_unit_cost: e.target.value })} />
      <label className="im-form__label" htmlFor="im-note">비고</label>
      <input id="im-note" className="im-input" value={item.note} onChange={e => onChange({ note: e.target.value })} />
    </div>
    <div className="im-panel__actions">
      <button type="button" className="t-btn is-primary is-large is-block" disabled={saving || !dirty} onClick={() => void onSave()}>{saving ? '저장 중…' : dirty ? '저장' : '바뀐 내용 없음'}</button>
    </div>
  </div>
}
