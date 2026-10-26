import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { HygieneCategory, HygieneRecord } from '../../api/hygiene'
import { hygieneStatus, SIDE_LABEL, STATUS_LABEL, UNCATEGORIZED, type HygieneBoardState, type HygieneSide, type HygieneStatus } from '../../features/sanitation/useHygieneBoard'
import './HygieneBoard.css'

const NOTE_FIELD = { problem: 'problem_note', clean: 'clean_note' } as const
const IMAGE_FIELD = { problem: 'problem_image', clean: 'clean_image' } as const
const NOTE_PLACEHOLDER: Record<HygieneSide, string> = { problem: '부적합 내용 (예: 후드 내부 청소 미흡)', clean: '조치한 내용 (예: 후드 필터 세척 완료)' }

/**
 * 위생 점검 관리 본문(PC VendorSanitation·터치 SanitationTouch 공용). 기간·상태·카테고리 거르기 → 기록 카드(부적합 | 조치) →
 * 등록·수정 창(사진 칸마다 1장, ERP 구조) · 사진 크게 보기 · 카테고리 관리(본사).
 */
export default function HygieneBoard({ board }: { board: HygieneBoardState }) {
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const b = board

  if (!b.accountId) return <p className="hg-empty">위 '관리 거래처'에서 거래처를 고르면 위생 점검 기록이 나옵니다.</p>

  return <div className="hg">
    <section className="hg-filters" aria-label="조회 조건">
      <div className="hg-filters__row">
        <label className="hg-field"><span>등록 월</span>
          <input type="month" value={b.month} disabled={!b.month} onChange={event => b.setMonth(event.target.value)} />
        </label>
        <label className="hg-check"><input type="checkbox" checked={!b.month} onChange={event => b.setMonth(event.target.checked ? '' : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7))} /> 전체 기간</label>
        <div className="hg-segment" role="group" aria-label="상태">
          {([['', '전체', b.records.length], ['CHECK', STATUS_LABEL.CHECK, b.counts.CHECK], ['DONE', STATUS_LABEL.DONE, b.counts.DONE]] as const).map(([value, label, count]) =>
            <button key={value || 'all'} type="button" className={`hg-btn t-btn is-small${b.statusFilter === value ? ' is-active' : ''}`} aria-pressed={b.statusFilter === value}
              onClick={() => b.setStatusFilter(value as HygieneStatus | '')}>{label} {count}</button>)}
        </div>
        <span className="hg-filters__actions">
          {b.headquarters ? <button type="button" className="hg-btn t-btn" onClick={() => setCategoryOpen(true)}>카테고리 관리</button> : null}
          <button type="button" className="hg-btn t-btn is-primary" onClick={b.startNew}>＋ 부적합 등록</button>
        </span>
      </div>
      <div className="hg-pills" role="group" aria-label="카테고리">
        <button type="button" className={`hg-pill${!b.categoryFilter ? ' is-active' : ''}`} aria-pressed={!b.categoryFilter} onClick={() => b.setCategoryFilter('')}>전체</button>
        {b.categories.map(row => <button type="button" key={row.category_key} className={`hg-pill${b.categoryFilter === row.category_key ? ' is-active' : ''}`}
          aria-pressed={b.categoryFilter === row.category_key} title={row.description || undefined} onClick={() => b.setCategoryFilter(row.category_key)}>{row.category_name}</button>)}
        {b.hasUncategorized ? <button type="button" className={`hg-pill${b.categoryFilter === UNCATEGORIZED ? ' is-active' : ''}`} aria-pressed={b.categoryFilter === UNCATEGORIZED} onClick={() => b.setCategoryFilter(UNCATEGORIZED)}>분류 없음</button> : null}
      </div>
    </section>

    {b.notice ? <p className="hg-msg is-ok" role="status">{b.notice}</p> : null}
    {b.error && !b.draft ? <p className="hg-msg is-error" role="alert">{b.error}</p> : null}
    {b.loading ? <p className="hg-msg" role="status">위생 점검 기록을 불러오는 중…</p> : null}

    {!b.loading ? <section className="hg-list" aria-label="점검 기록">
      {b.visibleRecords.map(record => <RecordCard key={record.idx ?? record.reg_dt} record={record} board={b} onView={setViewer} />)}
      {!b.visibleRecords.length ? <p className="hg-empty">{b.records.length ? '조건에 맞는 기록이 없습니다.' : `${b.month ? `${b.month.replace('-', '년 ')}월에` : '아직'} 등록된 위생 점검 기록이 없습니다.`}</p> : null}
    </section> : null}

    {b.draft ? <RecordEditor board={b} onView={setViewer} /> : null}
    {viewer ? createPortal(<div className="hg-viewer" role="presentation" onClick={() => setViewer(null)}>
      <figure role="dialog" aria-modal="true" aria-label={`${viewer.label} 사진 크게 보기`} onClick={event => event.stopPropagation()}>
        <img src={viewer.url} alt={viewer.label} />
        <figcaption>{viewer.label}<button type="button" className="hg-btn t-btn" onClick={() => setViewer(null)}>닫기</button></figcaption>
      </figure>
    </div>, document.body) : null}
    {categoryOpen ? <CategoryEditor board={b} onClose={() => setCategoryOpen(false)} /> : null}
  </div>
}

function Side({ side, record, board, onView }: { side: HygieneSide; record: HygieneRecord; board: HygieneBoardState; onView: (photo: { url: string; label: string }) => void }) {
  const image = record[IMAGE_FIELD[side]]
  const note = record[NOTE_FIELD[side]]
  const url = board.photoUrl(image)
  return <div className={`hg-side is-${side}`}>
    <span className={`hg-tag is-${side}`}>{SIDE_LABEL[side]}</span>
    {url ? <button type="button" className="hg-photo" onClick={() => onView({ url, label: `${SIDE_LABEL[side]} 사진` })} aria-label={`${SIDE_LABEL[side]} 사진 크게 보기`}><img src={url} alt="" loading="lazy" /></button>
      : <span className="hg-photo is-empty">사진 없음</span>}
    <p className={`hg-note${note ? '' : ' is-empty'}`}>{note || (side === 'clean' ? '아직 조치 내용이 없습니다.' : '내용 없음')}</p>
  </div>
}

function RecordCard({ record, board, onView }: { record: HygieneRecord; board: HygieneBoardState; onView: (photo: { url: string; label: string }) => void }) {
  const status = hygieneStatus(record)
  const category = board.categoryName(record.category_key)
  return <article className={`hg-card is-${status.toLowerCase()}`}>
    <header className="hg-card__head">
      <span className={`hg-status is-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>
      {category ? <span className="hg-chip">{category}</span> : null}
      <small>등록 {record.reg_dt || '-'}{record.reg_user_name ? ` · ${record.reg_user_name}` : ''}{record.mod_dt && record.mod_dt !== record.reg_dt ? ` · 수정 ${record.mod_dt}${record.mod_user_name ? ` ${record.mod_user_name}` : ''}` : ''}</small>
      <span className="hg-card__actions">
        <button type="button" className="hg-btn t-btn is-small" onClick={() => board.startEdit(record)}>{status === 'CHECK' ? '조치 입력' : '수정'}</button>
        {board.headquarters ? <button type="button" className="hg-btn t-btn is-small is-ghost" disabled={board.busy === 'delete'} onClick={() => board.remove(record)}>삭제</button> : null}
      </span>
    </header>
    <div className="hg-card__body">
      <Side side="problem" record={record} board={board} onView={onView} />
      <Side side="clean" record={record} board={board} onView={onView} />
    </div>
    {record.note ? <p className="hg-card__remark"><b>비고</b>{record.note}</p> : null}
  </article>
}

function RecordEditor({ board, onView }: { board: HygieneBoardState; onView: (photo: { url: string; label: string }) => void }) {
  const draft = board.draft!
  const busy = Boolean(board.busy)
  const knownCategory = board.categories.some(row => row.category_key === draft.category_key)
  const side = (key: HygieneSide) => {
    const image = draft[IMAGE_FIELD[key]]
    const url = board.photoUrl(image)
    const inputId = `hg-file-${key}`
    return <div className={`hg-edit-side is-${key}`}>
      <span className={`hg-tag is-${key}`}>{SIDE_LABEL[key]}</span>
      <div className="hg-edit-photo">
        {url ? <button type="button" className="hg-photo" onClick={() => onView({ url, label: `${SIDE_LABEL[key]} 사진` })}><img src={url} alt={`${SIDE_LABEL[key]} 사진`} /></button>
          : <span className="hg-photo is-empty">{board.busy === `photo:${key}` ? '올리는 중…' : '사진 없음'}</span>}
        <span className="hg-edit-photo__actions">
          <label htmlFor={inputId} className={`hg-btn t-btn is-small${busy ? ' is-disabled' : ''}`}>{url ? '사진 바꾸기' : '사진 올리기'}
            <input id={inputId} type="file" accept="image/*" capture="environment" disabled={busy} onChange={event => { board.uploadPhoto(key, event.target.files?.[0]); event.target.value = '' }} />
          </label>
          {url ? <button type="button" className="hg-btn t-btn is-small is-ghost" disabled={busy} onClick={() => board.updateDraft(key === 'problem' ? { problem_image: '' } : { clean_image: '' })}>사진 빼기</button> : null}
        </span>
      </div>
      <label className="hg-field is-block"><span>{SIDE_LABEL[key]} 내용</span>
        <textarea rows={3} value={draft[NOTE_FIELD[key]]} placeholder={NOTE_PLACEHOLDER[key]}
          onChange={event => board.updateDraft(key === 'problem' ? { problem_note: event.target.value } : { clean_note: event.target.value })} />
      </label>
    </div>
  }
  return createPortal(<div className="hg-modal" role="presentation" onClick={() => { if (!busy) board.setDraft(null) }}>
    <section className="hg-dialog" role="dialog" aria-modal="true" aria-labelledby="hg-edit-title" onClick={event => event.stopPropagation()}>
      <header className="hg-dialog__head">
        <div><h2 id="hg-edit-title">{draft.idx ? '점검 기록 수정' : '부적합 등록'}</h2><p>{board.accountName}{draft.reg_dt ? ` · 등록 ${draft.reg_dt}` : ''}</p></div>
        <button type="button" className="hg-close t-btn is-ghost is-icon" aria-label="닫기" disabled={busy} onClick={() => board.setDraft(null)}>×</button>
      </header>
      <div className="hg-dialog__body">
        <label className="hg-field"><span>카테고리</span>
          <select value={knownCategory ? draft.category_key : ''} onChange={event => board.updateDraft({ category_key: event.target.value })}>
            <option value="">분류 없음</option>
            {board.categories.map(row => <option key={row.category_key} value={row.category_key}>{row.category_name}</option>)}
          </select>
        </label>
        <div className="hg-edit-sides">{side('problem')}{side('clean')}</div>
        <label className="hg-field is-block"><span>비고 (요청 사항·기한)</span>
          <input value={draft.note} maxLength={500} placeholder="예: 11/5까지 조치 사진 첨부 부탁드립니다." onChange={event => board.updateDraft({ note: event.target.value })} />
        </label>
        {board.error ? <p className="hg-msg is-error" role="alert">{board.error}</p> : null}
      </div>
      <footer className="hg-dialog__actions">
        <button type="button" className="hg-btn t-btn is-soft hg-ai" disabled={busy || (!draft.problem_note.trim() && !draft.clean_note.trim())} onClick={board.polishWithAi}>{board.busy === 'ai' ? 'AI 문구 만드는 중…' : 'AI로 문구 다듬기'}</button>
        <button type="button" className="hg-btn t-btn" disabled={busy} onClick={() => board.setDraft(null)}>취소</button>
        <button type="button" className="hg-btn t-btn is-primary" disabled={busy} onClick={board.saveDraft}>{board.busy === 'save' ? '저장 중…' : '저장'}</button>
      </footer>
    </section>
  </div>, document.body)
}

/** 거래처 위생 카테고리(본사). 저장하면 목록 전체가 ERP에 반영되고, 목록에서 뺀 카테고리의 기록은 '분류 없음'으로 보인다 */
function CategoryEditor({ board, onClose }: { board: HygieneBoardState; onClose: () => void }) {
  const [draft, setDraft] = useState<HygieneCategory[]>(() => board.categories.map(row => ({ ...row })))
  const [error, setError] = useState('')
  const used = (key: string) => board.records.filter(record => record.category_key === key).length
  const update = (index: number, patch: Partial<HygieneCategory>) => { setDraft(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row))); setError('') }
  const move = (index: number, step: number) => setDraft(rows => {
    const next = [...rows]; const target = index + step
    if (target < 0 || target >= next.length) return rows
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const remove = (index: number) => {
    const row = draft[index]
    const count = row.category_key ? used(row.category_key) : 0
    if (count && !window.confirm(`'${row.category_name}' 카테고리에 이 기간 기록 ${count}건이 있습니다. 카테고리를 빼면 그 기록은 '분류 없음'으로 보입니다. 뺄까요?`)) return
    setDraft(rows => rows.filter((_, i) => i !== index))
  }
  const save = async () => {
    const rows = draft.map(row => ({ ...row, category_name: row.category_name.trim(), description: row.description.trim(), manage_point: row.manage_point.trim() }))
    if (!rows.length) { setError('카테고리를 1개 이상 남겨주세요.'); return }
    if (rows.some(row => !row.category_name)) { setError('카테고리 이름을 입력해주세요.'); return }
    if (new Set(rows.map(row => row.category_name)).size !== rows.length) { setError('같은 이름의 카테고리가 있습니다.'); return }
    if (await board.saveCategories(rows)) onClose()
  }
  return createPortal(<div className="hg-modal" role="presentation" onClick={onClose}>
    <section className="hg-dialog is-wide" role="dialog" aria-modal="true" aria-labelledby="hg-cat-title" onClick={event => event.stopPropagation()}>
      <header className="hg-dialog__head">
        <div><h2 id="hg-cat-title">위생 점검 카테고리</h2><p>{board.accountName}에만 적용 · 기존 앱 위생점검과 같은 목록입니다</p></div>
        <button type="button" className="hg-close t-btn is-ghost is-icon" aria-label="닫기" onClick={onClose}>×</button>
      </header>
      <div className="hg-dialog__body">
        <ol className="hg-cat-list">
          {draft.map((row, index) => <li key={row.category_key || `new-${index}`}>
            <span className="hg-cat-list__no">{index + 1}</span>
            <input aria-label={`${index + 1}번 카테고리 이름`} placeholder="이름 (예: 냉장·냉동고)" value={row.category_name} onChange={event => update(index, { category_name: event.target.value })} />
            <input aria-label={`${index + 1}번 설명`} placeholder="점검 기준 설명" value={row.description} onChange={event => update(index, { description: event.target.value })} />
            <input aria-label={`${index + 1}번 관리 포인트`} placeholder="관리 포인트" value={row.manage_point} onChange={event => update(index, { manage_point: event.target.value })} />
            <span className="hg-cat-list__actions">
              <button type="button" className="hg-btn t-btn is-small" aria-label="위로" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button type="button" className="hg-btn t-btn is-small" aria-label="아래로" disabled={index === draft.length - 1} onClick={() => move(index, 1)}>↓</button>
              <button type="button" className="hg-btn t-btn is-small is-ghost" onClick={() => remove(index)}>빼기</button>
            </span>
          </li>)}
          {!draft.length ? <li className="hg-empty">카테고리가 없습니다. 아래에서 추가해주세요.</li> : null}
        </ol>
        <button type="button" className="hg-btn t-btn is-soft is-small" onClick={() => setDraft(rows => [...rows, { category_key: '', category_name: '', description: '', manage_point: '' }])}>＋ 카테고리 추가</button>
        {error || board.error ? <p className="hg-msg is-error" role="alert">{error || board.error}</p> : null}
      </div>
      <footer className="hg-dialog__actions">
        <button type="button" className="hg-btn t-btn" onClick={onClose}>취소</button>
        <button type="button" className="hg-btn t-btn is-primary" disabled={board.busy === 'categories'} onClick={() => void save()}>{board.busy === 'categories' ? '저장 중…' : '저장'}</button>
      </footer>
    </section>
  </div>, document.body)
}
