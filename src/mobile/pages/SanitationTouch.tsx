import { useState } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import { inspectionModes, useVendorSanitation } from '../../features/sanitation/useVendorSanitation'
import './SanitationTouch.css'

/**
 * 위생 점검(태블릿·휴대폰): 거래처·일자·조치전/조치후 → 항목(주방·냉장고 등) 칸 → 오른쪽에서 사진 크게 보기와 전달·조치 내용 입력.
 * 로직은 PC와 같은 useVendorSanitation. 아직 시안이라 거래처 목록·사진이 고정이고 조회·저장 서버 기능이 없다(화면에 안내).
 */
export default function SanitationTouch() {
  const s = useVendorSanitation()
  const [sectionKey, setSectionKey] = useState(() => s.photoGroups[0]?.key ?? '')
  const group = s.photoGroups.find(item => item.key === sectionKey) ?? s.photoGroups[0]
  const after = s.inspectionMode === '조치후'
  const setNote = (field: 'before' | 'after', value: string) => s.setNotes(current => ({ ...current, [group.key]: { ...current[group.key], [field]: value } }))

  const toolbar = <>
    <label className="t-chip t-chip--select"><TouchIcon name="store" /><select aria-label="거래처" value={s.vendor} onChange={e => s.setVendor(e.target.value)}>
      {s.selectableVendorOptions.map(option => <option key={option} value={option}>{option}</option>)}
    </select></label>
    <label className="t-chip sn-date"><TouchIcon name="calendar" /><input type="date" aria-label="점검일" value={s.inspectionDate} onChange={e => s.setInspectionDate(e.target.value)} /></label>
    <div className="t-segment" role="group" aria-label="조회조건">{inspectionModes.map(mode => <button key={mode} type="button" className={s.inspectionMode === mode ? 'is-active' : ''} onClick={() => s.setInspectionMode(mode)}>{mode}</button>)}</div>
  </>

  const aside = group && <div className="sn-panel">
    <div className="sn-panel__head"><h2>{group.title}</h2><p>{after ? '조치 전·후 사진과 전달·조치 내용' : '사진 5장과 전달 내용'}</p></div>
    <div className="sn-panel__body">
      <label className="sn-field">전달내용<textarea rows={3} value={s.notes[group.key]?.before ?? ''} placeholder="전달내용을 입력하세요." onChange={e => setNote('before', e.target.value)} /></label>
      {after && <label className="sn-field">조치내용<textarea rows={3} value={s.notes[group.key]?.after ?? ''} placeholder="조치내용을 입력하세요." onChange={e => setNote('after', e.target.value)} /></label>}
      {s.aiNoteMessage && <p className="t-msg sn-ai">{s.aiNoteMessage}</p>}
      <p className="t-msg is-warn sn-notice">시안 화면입니다. 거래처 목록과 사진이 고정 값이고, 조회·저장은 아직 서버에 연결되지 않았습니다.</p>
    </div>
    <div className="sn-panel__actions">
      <button type="button" className="t-btn is-soft is-block" disabled={s.isAiNoteLoading} onClick={() => void s.handleGenerateAiNotes()}>{s.isAiNoteLoading ? 'AI 메모 만드는 중…' : 'AI로 메모 채우기'}</button>
      <button type="button" className="t-btn is-primary is-large is-block" disabled title="저장 기능은 아직 준비 중입니다">저장 (준비 중)</button>
    </div>
  </div>

  return <TouchLayout title="위생 점검" subtitle={`${s.vendor} · ${s.inspectionDate}`} toolbar={toolbar} aside={aside || undefined} hideAccount>
    <div className="t-tabs" role="tablist" aria-label="점검 항목">{s.photoGroups.map(item => {
      const filled = Boolean(s.notes[item.key]?.before) && (!after || Boolean(s.notes[item.key]?.after))
      return <button key={item.key} type="button" role="tab" aria-selected={item.key === group?.key} className={`t-tab${item.key === group?.key ? ' is-active' : ''}`} onClick={() => setSectionKey(item.key)}>
        <TouchIcon name={filled ? 'check' : 'sanitation'} /><strong>{item.title}</strong><small>{filled ? '작성됨' : '작성 필요'}</small>
      </button>
    })}</div>

    {group && <>
      <h2 className="t-section-title">{after ? '조치 전 사진' : '사진'}</h2>
      <div className="sn-photos">{group.beforeImages.map(image => <button key={image.id} type="button" className="t-card sn-photo" onClick={() => s.setSelectedImage(image.src)}>
        <img src={image.src} alt={image.alt} /><span>{image.label}</span>
      </button>)}</div>
      {after && <>
        <h2 className="t-section-title">조치 후 사진</h2>
        <div className="sn-photos">{group.afterImages.map(image => <button key={image.id} type="button" className="t-card sn-photo" onClick={() => s.setSelectedImage(image.src)}>
          <img src={image.src} alt={image.alt} /><span>{image.label}</span>
        </button>)}</div>
      </>}
    </>}

    {s.selectedImage && <div className="t-sheet-backdrop" role="presentation" onClick={() => s.setSelectedImage(null)}>
      <section className="t-sheet sn-zoom" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={e => e.stopPropagation()}>
        <div className="t-sheet__body"><img src={s.selectedImage} alt="확대 사진" /></div>
        <footer className="t-sheet__actions"><button type="button" className="t-btn is-large" onClick={() => s.setSelectedImage(null)}>닫기</button></footer>
      </section>
    </div>}
  </TouchLayout>
}
