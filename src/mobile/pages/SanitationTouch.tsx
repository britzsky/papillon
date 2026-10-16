import { useState } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import {
  DEFAULT_CATEGORIES, MAX_PHOTOS, photoCountLabel, sanitationStatus, STATUS_LABEL, useSanitationInspection,
  type SanitationCategory, type SanitationPhoto, type SanitationSide, type SanitationStatus,
} from '../../features/sanitation/useSanitationInspection'
import './SanitationTouch.css'

const SIDE_LABEL: Record<SanitationSide, string> = { before: '조치 전', after: '조치 후' }
const NOTE = { before: { field: 'beforeNote', label: '전달 메모', placeholder: '조치가 필요한 내용을 적어주세요.' }, after: { field: 'afterNote', label: '조치 내용', placeholder: '조치한 내용을 적어주세요.' } } as const
const REMARK = { before: 'beforeRemark', after: 'afterRemark' } as const
const STATUS_TONE: Record<SanitationStatus, string> = { NONE: '', CHECK: 'is-warn', DONE: 'is-ok' }
const STATUS_ICON = { NONE: 'sanitation', CHECK: 'alert', DONE: 'check' } as const

/**
 * 위생 점검(태블릿·휴대폰). PC 위생 점검 관리와 같은 useSanitationInspection(카테고리·조치 전/후 사진·메모·상태·AI 메모).
 * 화면: 위 점검일·점검자·AI 메모·카테고리 → 상태 거르기 → 카테고리 칸 → 고른 카테고리의 조치 전·후(태블릿은 나란히, 휴대폰은 위아래).
 * 거래처는 위 '관리 거래처'(본사 선택, 거래처 계정 고정). 서버 저장은 아직 없어 화면에 안내한다.
 */
export default function SanitationTouch() {
  const b = useSanitationInspection()
  const [selectedId, setSelectedId] = useState('')
  const [categorySheet, setCategorySheet] = useState(false)
  const category = b.visibleCategories.find(row => row.id === selectedId) ?? b.visibleCategories[0]
  const item = category ? b.itemOf(category.id) : null
  const counts = b.categories.reduce((acc, row) => { acc[sanitationStatus(b.itemOf(row.id))] += 1; return acc }, { NONE: 0, CHECK: 0, DONE: 0 } as Record<SanitationStatus, number>)

  const toolbar = <>
    <label className="t-chip sn-date"><TouchIcon name="calendar" /><input type="date" aria-label="점검일" value={b.inspectionDate} onChange={e => b.setInspectionDate(e.target.value)} /></label>
    <label className="t-chip sn-inspector"><TouchIcon name="users" /><input aria-label="점검자" value={b.inspector} placeholder="점검자" onChange={e => b.setInspector(e.target.value)} /></label>
    <button type="button" className="t-btn is-soft" disabled={b.isAiNoteLoading} onClick={() => void b.handleGenerateAiNotes()}>{b.isAiNoteLoading ? 'AI 메모 만드는 중…' : 'AI 메모'}</button>
    <button type="button" className="t-btn" disabled={!b.accountId} onClick={() => setCategorySheet(true)}>카테고리</button>
  </>

  const aside = <div className="sn-panel">
    <div className="sn-panel__head"><h2>점검 현황</h2><p>{b.inspectionDate} · {b.categories.length}개 카테고리</p></div>
    <div className="sn-panel__body">
      <ul className="sn-summary">
        {b.categories.map(row => { const status = sanitationStatus(b.itemOf(row.id)); return <li key={row.id}>
          <button type="button" className={row.id === category?.id ? 'is-active' : ''} onClick={() => { b.setStatusFilter(''); setSelectedId(row.id) }}>
            <span>{row.name}</span><span className={`t-badge ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
          </button>
        </li> })}
      </ul>
      <p className="t-msg is-warn sn-notice">조회·저장은 아직 서버에 연결되지 않았습니다. 입력한 사진·메모·카테고리는 새로고침하면 사라집니다.</p>
    </div>
    <div className="sn-panel__actions">
      <button type="button" className="t-btn is-primary is-large is-block" disabled title="저장 기능은 아직 준비 중입니다">저장 (준비 중)</button>
    </div>
  </div>

  return <TouchLayout title="위생 점검" subtitle={`${b.accountName} · ${b.inspectionDate}`} toolbar={toolbar} aside={aside}>
    <div className="t-segment sn-status" role="group" aria-label="상태">
      {([['', '전체', b.categories.length], ['NONE', '미점검', counts.NONE], ['CHECK', '확인 필요', counts.CHECK], ['DONE', '조치 완료', counts.DONE]] as const).map(([value, label, count]) =>
        <button key={value || 'all'} type="button" className={b.statusFilter === value ? 'is-active' : ''} aria-pressed={b.statusFilter === value} onClick={() => b.setStatusFilter(value as SanitationStatus | '')}>{label} {count}</button>)}
    </div>

    <p className="t-msg sn-ai"><span className="t-badge is-info">AI</span>{b.aiNoteMessage || '조치 전 사진과 전달 메모를 기준으로 조치 요청 문구를 자동 생성하고, 담당자가 수정할 수 있습니다.'}</p>

    <div className="t-tabs" role="tablist" aria-label="점검 항목">{b.visibleCategories.map(row => {
      const rowItem = b.itemOf(row.id)
      const status = sanitationStatus(rowItem)
      return <button key={row.id} type="button" role="tab" aria-selected={row.id === category?.id} className={`t-tab${row.id === category?.id ? ' is-active' : ''}`} onClick={() => setSelectedId(row.id)}>
        <TouchIcon name={STATUS_ICON[status]} /><strong>{row.name}</strong><small>{STATUS_LABEL[status]} · {photoCountLabel(rowItem)}</small>
      </button>
    })}</div>
    {!b.visibleCategories.length && <p className="t-msg">{b.categories.length ? '선택한 상태에 해당하는 점검 항목이 없습니다.' : "카테고리가 없습니다. 위 '카테고리'에서 추가해주세요."}</p>}

    {category && item && <section className="sn-detail" aria-label={`${category.name} 점검`}>
      <header className="sn-detail__head"><div><h2>{category.name}</h2><p>{category.description}</p></div>
        <span className={`t-badge ${STATUS_TONE[sanitationStatus(item)]}`}>{STATUS_LABEL[sanitationStatus(item)]}</span></header>
      <div className="sn-sides">{(['before', 'after'] as const).map(side => {
        const photos = item[side]
        const room = MAX_PHOTOS - photos.length
        const inputId = `sn-file-${category.id}-${side}`
        return <div key={side} className={`t-card sn-side is-${side}`}>
          <div className="sn-side__head"><span className={`t-badge ${side === 'after' ? 'is-ok' : 'is-warn'}`}>{SIDE_LABEL[side]}</span><small>사진 {photos.length}/{MAX_PHOTOS}</small></div>
          <div className="sn-grid">
            {photos.map((photo, index) => <span key={photo.id} className="sn-thumb">
              <button type="button" className="sn-thumb__view" aria-label={`${SIDE_LABEL[side]} 사진 ${index + 1} 크게 보기`} onClick={() => b.setLightbox({ photos, index })}><img src={photo.src} alt="" /></button>
              <button type="button" className="sn-thumb__remove" aria-label={`${SIDE_LABEL[side]} 사진 ${index + 1} 삭제`} onClick={() => b.removePhoto(category.id, side, photo.id)}><TouchIcon name="close" size={16} /></button>
            </span>)}
            {room > 0 && <label htmlFor={inputId} className="sn-add"><b>+</b>사진 추가
              <input id={inputId} type="file" accept="image/*" multiple onChange={e => { b.addPhotos(category.id, side, e.target.files); e.target.value = '' }} />
            </label>}
          </div>
          <label className="sn-field">{NOTE[side].label}<textarea rows={3} value={item[NOTE[side].field]} placeholder={NOTE[side].placeholder}
            onChange={e => b.updateItem(category.id, () => ({ [NOTE[side].field]: e.target.value }))} /></label>
          <label className="sn-field">비고<input className="t-input" value={item[REMARK[side]]} placeholder="비고" onChange={e => b.updateItem(category.id, () => ({ [REMARK[side]]: e.target.value }))} /></label>
        </div>
      })}</div>
    </section>}

    {b.lightbox && <PhotoSheet photos={b.lightbox.photos} index={b.lightbox.index} onMove={index => b.setLightbox({ ...b.lightbox!, index })} onClose={() => b.setLightbox(null)} />}
    {categorySheet && <CategorySheet accountName={b.accountName} categories={b.categories}
      hasData={id => sanitationStatus(b.itemOf(id)) !== 'NONE' || Boolean(b.itemOf(id).beforeNote || b.itemOf(id).afterNote)}
      onSave={next => { b.saveCategories(next); setCategorySheet(false) }} onClose={() => setCategorySheet(false)} />}
  </TouchLayout>
}

function PhotoSheet({ photos, index, onMove, onClose }: { photos: SanitationPhoto[]; index: number; onMove: (index: number) => void; onClose: () => void }) {
  const photo = photos[index]
  return <div className="t-sheet-backdrop" role="presentation" onClick={onClose}>
    <section className="t-sheet sn-zoom" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={e => e.stopPropagation()}>
      <div className="t-sheet__body"><img src={photo.src} alt={photo.name} /></div>
      <footer className="t-sheet__actions">
        <button type="button" className="t-btn is-large" disabled={photos.length < 2} onClick={() => onMove((index - 1 + photos.length) % photos.length)}><TouchIcon name="chevronLeft" />이전</button>
        <span className="sn-zoom__count">{index + 1} / {photos.length}</span>
        <button type="button" className="t-btn is-large" disabled={photos.length < 2} onClick={() => onMove((index + 1) % photos.length)}>다음<TouchIcon name="chevronRight" /></button>
        <button type="button" className="t-btn is-primary is-large" onClick={onClose}>닫기</button>
      </footer>
    </section>
  </div>
}

/** 거래처별 카테고리 추가·이름/설명 수정·순서·삭제(PC 카테고리 관리와 같은 규칙: 기록이 있는 카테고리는 삭제 불가) */
function CategorySheet({ accountName, categories, hasData, onSave, onClose }: {
  accountName: string; categories: SanitationCategory[]; hasData: (id: string) => boolean; onSave: (next: SanitationCategory[]) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(categories)
  const [error, setError] = useState('')
  const update = (index: number, patch: Partial<SanitationCategory>) => setDraft(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  const move = (index: number, step: number) => setDraft(rows => {
    const next = [...rows]; const target = index + step
    if (target < 0 || target >= next.length) return rows
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const save = () => {
    const names = draft.map(row => row.name.trim())
    if (names.some(name => !name)) { setError('카테고리 이름을 모두 입력해주세요.'); return }
    if (new Set(names).size !== names.length) { setError('같은 이름의 카테고리가 있습니다.'); return }
    onSave(draft.map(row => ({ ...row, name: row.name.trim(), description: row.description.trim() })))
  }
  return <div className="t-sheet-backdrop" role="presentation" onClick={onClose}>
    <section className="t-sheet sn-categories" role="dialog" aria-modal="true" aria-labelledby="sn-cat-title" onClick={e => e.stopPropagation()}>
      <header className="t-sheet__head"><h2 id="sn-cat-title">점검 카테고리</h2><p>{accountName} · 순서대로 점검 칸에 보입니다</p></header>
      <div className="t-sheet__body">
        <ol className="sn-cat-list">{draft.map((row, index) => <li key={row.id}>
          <span className="sn-cat-list__no">{index + 1}</span>
          <div className="sn-cat-list__fields">
            <input className="t-input" aria-label={`${index + 1}번 이름`} value={row.name} placeholder="카테고리 이름" onChange={e => update(index, { name: e.target.value })} />
            <input className="t-input" aria-label={`${index + 1}번 설명`} value={row.description} placeholder="점검할 내용" onChange={e => update(index, { description: e.target.value })} />
          </div>
          <div className="sn-cat-list__actions">
            <button type="button" className="t-btn is-icon" aria-label="위로" disabled={index === 0} onClick={() => move(index, -1)}><TouchIcon name="chevronLeft" /></button>
            <button type="button" className="t-btn is-icon" aria-label="아래로" disabled={index === draft.length - 1} onClick={() => move(index, 1)}><TouchIcon name="chevronRight" /></button>
            <button type="button" className="t-btn is-icon" aria-label="삭제" disabled={hasData(row.id)} title={hasData(row.id) ? '사진·메모가 있는 카테고리는 삭제할 수 없습니다' : undefined} onClick={() => setDraft(rows => rows.filter((_, i) => i !== index))}><TouchIcon name="close" /></button>
          </div>
        </li>)}</ol>
        <button type="button" className="t-btn is-soft is-block" onClick={() => setDraft(rows => [...rows, { id: `custom-${Date.now()}`, name: '', description: '' }])}>+ 카테고리 추가</button>
        {error && <p className="t-msg is-error" role="alert">{error}</p>}
      </div>
      <footer className="t-sheet__actions">
        <button type="button" className="t-btn is-large" onClick={() => setDraft(DEFAULT_CATEGORIES)}>기본값으로</button>
        <button type="button" className="t-btn is-large" onClick={onClose}>닫기</button>
        <button type="button" className="t-btn is-primary is-large" onClick={save}>적용</button>
      </footer>
    </section>
  </div>
}
