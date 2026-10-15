import { useState } from 'react'
import { DEFAULT_CATEGORIES, type SanitationCategory } from '../../features/sanitation/useSanitationInspection'

/** 거래처별 위생 점검 카테고리 추가·이름/설명 수정·순서 변경·삭제 (저장 전까지는 초안만 바뀜) */
export default function SanitationCategoryModal({ accountName, categories, hasData, onSave, onClose }: {
  accountName: string
  categories: SanitationCategory[]
  hasData: (categoryId: string) => boolean
  onSave: (next: SanitationCategory[]) => void
  onClose: () => void
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
  const remove = (index: number) => {
    const row = draft[index]
    if (hasData(row.id) && !window.confirm(`'${row.name}'에 입력한 사진·메모가 있습니다. 카테고리를 삭제하면 화면에서 함께 사라집니다. 삭제할까요?`)) return
    setDraft(rows => rows.filter((_, i) => i !== index))
  }
  const save = () => {
    const rows = draft.map(row => ({ ...row, name: row.name.trim(), description: row.description.trim() }))
    if (rows.some(row => !row.name)) return setError('카테고리 이름을 입력해주세요.')
    if (new Set(rows.map(row => row.name)).size !== rows.length) return setError('같은 이름의 카테고리가 있습니다.')
    onSave(rows)
    onClose()
  }

  return <div className="vs-modal" role="presentation" onClick={onClose}>
    <section className="vs-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="vs-category-title" onClick={event => event.stopPropagation()}>
      <header className="vs-modal__head">
        <div><h2 id="vs-category-title">카테고리 관리</h2><p>{accountName || '선택한 거래처'}에만 적용됩니다.</p></div>
        <button type="button" className="vs-btn" onClick={onClose}>닫기</button>
      </header>
      <ol className="vs-category-list">
        {draft.map((row, index) => <li key={row.id}>
          <span className="vs-category-list__order">{index + 1}</span>
          <input aria-label={`${index + 1}번 카테고리 이름`} placeholder="이름 (예: 주방 위생)" value={row.name} onChange={event => { update(index, { name: event.target.value }); setError('') }} />
          <input aria-label={`${index + 1}번 카테고리 설명`} placeholder="점검 기준 설명" value={row.description} onChange={event => update(index, { description: event.target.value })} />
          <span className="vs-category-list__actions">
            <button type="button" className="vs-btn" aria-label="위로" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className="vs-btn" aria-label="아래로" disabled={index === draft.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="vs-btn is-danger" onClick={() => remove(index)}>삭제</button>
          </span>
        </li>)}
        {!draft.length ? <li className="vs-category-list__empty">카테고리가 없습니다. 아래에서 추가해주세요.</li> : null}
      </ol>
      <div className="vs-modal__tools">
        <button type="button" className="vs-btn is-add" onClick={() => setDraft(rows => [...rows, { id: `cat-${Date.now()}`, name: '', description: '' }])}>+ 카테고리 추가</button>
        <button type="button" className="vs-btn" onClick={() => setDraft(DEFAULT_CATEGORIES)}>기본 카테고리로 되돌리기</button>
      </div>
      {error ? <p className="vs-modal__error" role="alert">{error}</p> : null}
      <footer className="vs-modal__foot">
        <button type="button" className="vs-btn" onClick={onClose}>취소</button>
        <button type="button" className="vs-btn is-save" onClick={save}>적용</button>
      </footer>
    </section>
  </div>
}
