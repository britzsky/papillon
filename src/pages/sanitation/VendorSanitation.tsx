import { useEffect, useState } from 'react'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import SanitationCategoryModal from './SanitationCategoryModal'
import './VendorSanitation.css'
import {
  MAX_PHOTOS, photoCountLabel, sanitationStatus, STATUS_LABEL, useSanitationInspection,
  type SanitationCategory, type SanitationItem, type SanitationPhoto, type SanitationSide, type SanitationStatus,
} from '../../features/sanitation/useSanitationInspection'

const SIDE_LABEL: Record<SanitationSide, string> = { before: '조치 전', after: '조치 후' }
const NOTE_LABEL: Record<SanitationSide, string> = { before: '전달 메모', after: '조치 내용' }
const NOTE_FIELD = { before: 'beforeNote', after: 'afterNote' } as const
const REMARK_FIELD = { before: 'beforeRemark', after: 'afterRemark' } as const
const STATUS_CLASS: Record<SanitationStatus, string> = { NONE: 'is-none', CHECK: 'is-check', DONE: 'is-done' }

type Board = ReturnType<typeof useSanitationInspection>

function SanitationCard({ category, item, board }: { category: SanitationCategory; item: SanitationItem; board: Board }) {
  const open = Boolean(board.expanded[category.id])
  const editing = Boolean(board.editing[category.id])
  const status = sanitationStatus(item)
  const toggle = () => board.setExpanded(current => ({ ...current, [category.id]: !open }))

  const viewSide = (side: SanitationSide) => {
    const photos = item[side]
    const key = `${category.id}:${side}`
    const active = Math.min(board.activePhoto[key] ?? 0, Math.max(0, photos.length - 1))
    const main = photos[active]
    return <div className="vs-side">
      <div className="vs-side__head"><span className={`vs-pill is-${side}`}>{SIDE_LABEL[side]}</span><small>{photos.length ? `사진 ${photos.length}장 · 썸네일을 누르면 큰 사진이 바뀝니다` : '등록된 사진이 없습니다'}</small></div>
      <button type="button" className="vs-main-photo" disabled={!main} onClick={() => main && board.setLightbox({ photos, index: active })} aria-label={main ? `${category.name} ${SIDE_LABEL[side]} 대표사진 원본 보기` : undefined}>
        {main ? <img src={main.src} alt={`${category.name} ${SIDE_LABEL[side]} 대표사진`} /> : <span className="vs-main-photo__empty">사진 없음</span>}
        <span className="vs-main-photo__tag">{SIDE_LABEL[side]} 대표사진</span>
      </button>
      <div className="vs-thumbs">
        {Array.from({ length: MAX_PHOTOS }, (_, index) => photos[index]
          ? <button type="button" key={photos[index].id} className={`vs-thumb${index === active ? ' is-active' : ''}`} aria-label={`사진 ${index + 1} 크게 보기`} aria-pressed={index === active} onClick={() => board.setActivePhoto(current => ({ ...current, [key]: index }))}><img src={photos[index].src} alt="" /></button>
          : <span key={`empty-${index}`} className="vs-thumb is-empty">사진 {index + 1}</span>)}
      </div>
      <p className="vs-field-label">{NOTE_LABEL[side]}</p>
      <p className="vs-readonly">{item[NOTE_FIELD[side]] || '—'}</p>
    </div>
  }

  const editSide = (side: SanitationSide) => {
    const photos = item[side]
    const room = MAX_PHOTOS - photos.length
    const inputId = `vs-file-${category.id}-${side}`
    return <div className="vs-side">
      <div className="vs-side__head"><span className={`vs-pill is-${side}`}>{SIDE_LABEL[side]}</span><small>{room ? `사진 추가 가능 (${photos.length}/${MAX_PHOTOS})` : `최대 ${MAX_PHOTOS}장까지 등록했습니다`}</small></div>
      <div className="vs-edit-grid">
        {photos.map((photo, index) => <span key={photo.id} className="vs-thumb is-filled">
          <button type="button" className="vs-thumb__view" aria-label={`사진 ${index + 1} 원본 보기`} onClick={() => board.setLightbox({ photos, index })}><img src={photo.src} alt="" /></button>
          <button type="button" className="vs-thumb__remove" aria-label={`사진 ${index + 1} 삭제`} onClick={() => board.removePhoto(category.id, side, photo.id)}>×</button>
        </span>)}
        {Array.from({ length: room }, (_, index) => <span key={`slot-${index}`} className="vs-thumb is-empty">사진 {photos.length + index + 1}</span>)}
        {room ? <label htmlFor={inputId} className="vs-add-photo"><b>+</b>사진 추가
          <input id={inputId} type="file" accept="image/*" multiple onChange={event => { board.addPhotos(category.id, side, event.target.files); event.target.value = '' }} />
        </label> : null}
      </div>
      <label className="vs-field-label" htmlFor={`${inputId}-note`}>{NOTE_LABEL[side]}</label>
      <textarea id={`${inputId}-note`} rows={2} value={item[NOTE_FIELD[side]]} placeholder={side === 'before' ? '조치가 필요한 내용을 적어주세요.' : '조치한 내용을 적어주세요.'}
        onChange={event => board.updateItem(category.id, () => ({ [NOTE_FIELD[side]]: event.target.value }))} />
      <label className="vs-field-label" htmlFor={`${inputId}-remark`}>비고</label>
      <input id={`${inputId}-remark`} value={item[REMARK_FIELD[side]]} placeholder="비고"
        onChange={event => board.updateItem(category.id, () => ({ [REMARK_FIELD[side]]: event.target.value }))} />
    </div>
  }

  const remarks = [item.beforeRemark.trim(), item.afterRemark.trim()]
  const remarkText = remarks[0] === remarks[1] || !remarks[0] || !remarks[1] ? remarks[0] || remarks[1] : `조치 전: ${remarks[0]} / 조치 후: ${remarks[1]}`

  return <article className={`vs-card${open ? ' is-open' : ''}`}>
    <header className="vs-card__head">
      <button type="button" className="vs-card__title" onClick={toggle} aria-expanded={open}><strong>{category.name}</strong><small>{category.description}</small></button>
      <div className="vs-card__badges">
        <span className="vs-badge">{photoCountLabel(item)}</span>
        <span className={`vs-badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
        {open ? <button type="button" className={`vs-btn${editing ? ' is-save' : ''}`} onClick={() => board.setEditing(current => ({ ...current, [category.id]: !editing }))}>{editing ? '입력 완료' : '사진·메모 입력'}</button> : null}
        <button type="button" className="vs-link" onClick={toggle}>{open ? '접기 ‹' : '펼치기 ›'}</button>
      </div>
    </header>
    {open ? <div className="vs-card__body">
      <div className="vs-compare">{editing ? <>{editSide('before')}{editSide('after')}</> : <>{viewSide('before')}{viewSide('after')}</>}</div>
      {!editing ? <><p className="vs-field-label">비고</p><p className="vs-readonly">{remarkText || '—'}</p></> : null}
    </div> : null}
  </article>
}

function Lightbox({ photos, index, onMove, onClose }: { photos: SanitationPhoto[]; index: number; onMove: (index: number) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') onMove((index - 1 + photos.length) % photos.length)
      else if (event.key === 'ArrowRight') onMove((index + 1) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onMove, onClose])
  const photo = photos[index]
  return <div className="vs-lightbox" role="presentation" onClick={onClose}>
    <div className="vs-lightbox__dialog" role="dialog" aria-modal="true" aria-label="사진 원본 보기" onClick={event => event.stopPropagation()}>
      <img src={photo.src} alt={photo.name} />
      <div className="vs-lightbox__bar">
        <button type="button" className="vs-btn" disabled={photos.length < 2} onClick={() => onMove((index - 1 + photos.length) % photos.length)}>‹ 이전</button>
        <span>{index + 1} / {photos.length} · 키보드 ← → 로 이동</span>
        <button type="button" className="vs-btn" disabled={photos.length < 2} onClick={() => onMove((index + 1) % photos.length)}>다음 ›</button>
        <button type="button" className="vs-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  </div>
}

function VendorSanitation() {
  const board = useSanitationInspection()
  const { accounts, accountId, setAccountId, accountName, inspectionDate, setInspectionDate, inspector, setInspector, statusFilter, setStatusFilter, categoryFilter, setCategoryFilter, categories, visibleCategories, saveCategories, itemOf, lightbox, setLightbox, aiNoteMessage, isAiNoteLoading, handleGenerateAiNotes } = board
  const [categoryModal, setCategoryModal] = useState(false)
  const [alert, setAlert] = useState<AppAlertState | null>(null)
  const hasData = (categoryId: string) => sanitationStatus(itemOf(categoryId)) !== 'NONE' || Boolean(itemOf(categoryId).beforeNote || itemOf(categoryId).afterNote)

  return (
    <div className="vendor-sanitation-page">
      <main className="vendor-sanitation-content">
        <SideMenuLayout header={<HeaderBar title="위생 점검 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '위생관리' }, { label: '위생 점검 관리' }]} />}>
          <div className="vs-page rd rd-page rd-vs">
            <header className="rd-page__head">
              <div>
                <h1 className="rd-h1">위생 점검 관리</h1>
                <p className="rd-muted">거래처별 조치 전 · 조치 후 사진으로 위생 상태를 확인합니다.</p>
              </div>
              <div className="rd-page__actions">
                <div className="vs-ai-banner rd-vs__ai"><span className="rd-chip is-info">AI</span><p>{aiNoteMessage || '조치 전 사진과 전달 메모를 기준으로 조치 요청 문구를 자동 생성하고, 담당자가 수정할 수 있습니다.'}</p></div>
                <button type="button" className="rd-btn" onClick={() => setCategoryModal(true)} disabled={!accountId}>카테고리 관리</button>
                <button type="button" className="rd-btn" onClick={() => void handleGenerateAiNotes()} disabled={isAiNoteLoading}>{isAiNoteLoading ? 'AI 생성 중' : 'AI 메모'}</button>
                <button type="button" className="rd-btn" onClick={() => setAlert({ type: 'error', title: '조회', message: '위생 점검 조회 서버 기능은 아직 연결되지 않았습니다. 지금은 이 화면에서 입력한 내용만 보입니다.' })}>조회</button>
                <button type="button" className="rd-btn is-primary" onClick={() => setAlert({ type: 'error', title: '저장', message: '위생 점검 저장 서버 기능은 아직 연결되지 않았습니다. 입력한 사진·메모·카테고리는 새로고침하면 사라집니다.' })}>저장</button>
              </div>
            </header>

            <section className="rd-card rd-page__filters">
              <label className="rd-vs__field"><span>거래처</span>
                <select className="rd-input" value={accountId} onChange={event => { setAccountId(event.target.value); setCategoryFilter('') }}>
                  {!accounts.length ? <option value={accountId}>{accountName || '거래처 불러오는 중'}</option> : null}
                  {accounts.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
                </select>
              </label>
              <label className="rd-vs__field"><span>점검일</span>
                <input className="rd-input" type="date" value={inspectionDate} onChange={event => setInspectionDate(event.target.value)} />
              </label>
              <label className="rd-vs__field"><span>점검자</span>
                <input className="rd-input" value={inspector} placeholder="점검자 이름" onChange={event => setInspector(event.target.value)} />
              </label>
              <label className="rd-vs__field"><span>상태</span>
                <select className="rd-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value as SanitationStatus | '')}>
                  <option value="">전체</option>
                  {(Object.keys(STATUS_LABEL) as SanitationStatus[]).map(key => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
                </select>
              </label>
              <span className="rd-vs__guide"><strong>사진 4:3 비율 · 최대 {MAX_PHOTOS}장</strong><small className="rd-muted">미리보기는 잘려 보이고, 누르면 원본 전체를 봅니다</small></span>
            </section>

            <div className="rd-pills" role="group" aria-label="카테고리">
              <button type="button" className={!categoryFilter ? 'is-active' : ''} aria-pressed={!categoryFilter} onClick={() => setCategoryFilter('')}>전체</button>
              {categories.map(category => <button type="button" key={category.id} className={categoryFilter === category.id ? 'is-active' : ''} aria-pressed={categoryFilter === category.id} onClick={() => setCategoryFilter(category.id)}>{category.name}</button>)}
            </div>


            <section className="vs-list" aria-label="점검 항목">
              <div className="vs-list__head"><h2 className="rd-h2">점검 항목 <span className="rd-chip is-done">{categories.length}개 카테고리</span></h2><small className="rd-muted">조치 전 → 조치 후 비교 중심 보기</small></div>
              {visibleCategories.map(category => <SanitationCard key={category.id} category={category} item={itemOf(category.id)} board={board} />)}
              {!visibleCategories.length ? <p className="vs-empty">{categories.length ? '선택한 조건에 해당하는 점검 항목이 없습니다.' : '카테고리가 없습니다. 카테고리 관리에서 추가해주세요.'}</p> : null}
            </section>
          </div>
        </SideMenuLayout>
      </main>

      {categoryModal ? <SanitationCategoryModal accountName={accountName} categories={categories} hasData={hasData} onSave={saveCategories} onClose={() => setCategoryModal(false)} /> : null}
      {lightbox ? <Lightbox photos={lightbox.photos} index={lightbox.index} onMove={index => setLightbox({ ...lightbox, index })} onClose={() => setLightbox(null)} /> : null}
      <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </div>
  )
}

export default VendorSanitation
