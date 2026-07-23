import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import logoImage from '../../assets/image/thefull_sign_1.png'
import { requestAiSanitationNote } from '../../api/ai'
import './VendorSanitation.css'

type PhotoSection = {
  key: string
  title: string
  note: string
}

type SectionNote = {
  before: string
  after: string
}

type InspectionMode = '조치전' | '조치후'

const vendorOptions = ['전체 거래처', '더풀 급식센터', '스마일 푸드', '한빛 유통']
const inspectionModes: InspectionMode[] = ['조치전', '조치후']

const photoSections: PhotoSection[] = [
  { key: 'kitchen', title: '주방사진', note: '조리대와 바닥 상태를 정리했습니다.' },
  { key: 'refrigerator', title: '냉장고 사진', note: '냉장고 내부 정리와 온도 점검을 완료했습니다.' },
  { key: 'certificate', title: '보건증 부착 사진', note: '보건증 게시 위치를 다시 정돈했습니다.' },
  { key: 'vending', title: '자판기 사진', note: '자판기 외부 청결 상태를 확인했습니다.' },
  { key: 'license', title: '영업신고증 사진', note: '영업신고증 부착 상태를 재점검했습니다.' },
  { key: 'worker', title: '근무자 사진', note: '근무자 위생복과 위생모 착용 상태를 확인했습니다.' },
]

function getToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

function VendorSanitation() {
  const [searchParams] = useSearchParams()
  const initialVendor = searchParams.get('type') === 'vendor' ? searchParams.get('name') ?? searchParams.get('q') ?? vendorOptions[0] : vendorOptions[0]
  const selectableVendorOptions = useMemo(
    () => (vendorOptions.includes(initialVendor) ? vendorOptions : [initialVendor, ...vendorOptions]),
    [initialVendor],
  )
  const [vendor, setVendor] = useState(initialVendor)
  const [inspectionDate, setInspectionDate] = useState(getToday())
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>('조치전')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [aiNoteMessage, setAiNoteMessage] = useState('')
  const [isAiNoteLoading, setIsAiNoteLoading] = useState(false)
  const [notes, setNotes] = useState<Record<string, SectionNote>>(() =>
    Object.fromEntries(
      photoSections.map((section) => [
        section.key,
        {
          before: section.note,
          after: '',
        },
      ]),
    ),
  )

  const photoGroups = useMemo(
    () =>
      photoSections.map((section) => ({
        ...section,
        beforeImages: Array.from({ length: 5 }, (_, index) => ({
          id: `${section.key}-before-${index + 1}`,
          src: logoImage,
          alt: `${section.title} 조치전 ${index + 1}`,
          label: `조치전 ${index + 1}`,
        })),
        afterImages: Array.from({ length: 5 }, (_, index) => ({
          id: `${section.key}-after-${index + 1}`,
          src: logoImage,
          alt: `${section.title} 조치후 ${index + 1}`,
          label: `조치후 ${index + 1}`,
        })),
      })),
    [],
  )

  const handleGenerateAiNotes = async () => {
    try {
      setIsAiNoteLoading(true)
      setAiNoteMessage('')
      const result = await requestAiSanitationNote({
        vendor_name: vendor,
        inspection_date: inspectionDate,
        inspection_mode: inspectionMode,
        sections: photoSections.map((section) => ({
          key: section.key,
          title: section.title,
          before_note: notes[section.key]?.before ?? '',
          after_note: notes[section.key]?.after ?? '',
        })),
      })

      setNotes((current) => {
        const next = { ...current }
        result.sections.forEach((section) => {
          next[section.key] = {
            before: section.before_note || next[section.key]?.before || '',
            after: section.after_note || next[section.key]?.after || '',
          }
        })
        return next
      })
      setAiNoteMessage(result.summary)
    } catch (error) {
      setAiNoteMessage(error instanceof Error ? error.message : 'AI 위생 점검 메모를 생성하지 못했습니다.')
    } finally {
      setIsAiNoteLoading(false)
    }
  }

  return (
    <div className="vendor-sanitation-page">
      <main className="vendor-sanitation-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="거래처별 위생관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '위생관리' },
                { label: '거래처별 위생관리' },
              ]}
            />
          }
        >
          <section className="vendor-sanitation-filters">
            <div className="vendor-sanitation-field">
              <label htmlFor="vendor">거래처</label>
              <select id="vendor" value={vendor} onChange={(event) => setVendor(event.target.value)}>
                {selectableVendorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="vendor-sanitation-field">
              <label htmlFor="inspectionDate">일자</label>
              <input
                id="inspectionDate"
                type="date"
                value={inspectionDate}
                onChange={(event) => setInspectionDate(event.target.value)}
              />
            </div>

            <div className="vendor-sanitation-field">
              <label htmlFor="inspectionMode">조회조건</label>
              <select
                id="inspectionMode"
                value={inspectionMode}
                onChange={(event) => setInspectionMode(event.target.value as InspectionMode)}
              >
                {inspectionModes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="vendor-sanitation-actions">
              <button
                type="button"
                className="vendor-sanitation-button is-secondary"
                onClick={() => void handleGenerateAiNotes()}
                disabled={isAiNoteLoading}
              >
                {isAiNoteLoading ? 'AI 생성 중' : 'AI 메모'}
              </button>
              <button type="button" className="vendor-sanitation-button is-secondary is-summary">
                조회
              </button>
              <button type="button" className="vendor-sanitation-button is-primary is-summary">
                저장
              </button>
            </div>
          </section>

          {aiNoteMessage ? <div className="vendor-sanitation-ai-note">{aiNoteMessage}</div> : null}

          <section className="vendor-sanitation-gallery-shell">
            <div className="vendor-sanitation-grid">
              {photoGroups.map((group) => (
                <article key={group.key} className="vendor-sanitation-card">
                  <div className="vendor-sanitation-card__header">
                    <h2>{group.title}</h2>
                    <strong>
                      {inspectionMode === '조치전'
                        ? '사진 5장 + 전달내용'
                        : '조치전 / 조치후 + 전달내용 / 조치내용'}
                    </strong>
                  </div>

                  <div className="vendor-sanitation-card__body">
                    {inspectionMode === '조치후' ? (
                      <div className="vendor-sanitation-block">
                        <div className="vendor-sanitation-block__title">조치전 사진</div>
                        <div className="vendor-sanitation-photo-grid">
                          {group.beforeImages.map((image) => (
                            <button
                              key={image.id}
                              type="button"
                              className="vendor-sanitation-photo"
                              onClick={() => setSelectedImage(image.src)}
                            >
                              <img src={image.src} alt={image.alt} />
                              <span>{image.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="vendor-sanitation-photo-grid">
                        {group.beforeImages.map((image) => (
                          <button
                            key={image.id}
                            type="button"
                            className="vendor-sanitation-photo"
                            onClick={() => setSelectedImage(image.src)}
                          >
                            <img src={image.src} alt={image.alt} />
                            <span>{image.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="vendor-sanitation-note">
                      <label htmlFor={`note-before-${group.key}`}>전달내용</label>
                      <input
                        id={`note-before-${group.key}`}
                        type="text"
                        value={notes[group.key]?.before ?? ''}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [group.key]: {
                              ...current[group.key],
                              before: event.target.value,
                            },
                          }))
                        }
                        placeholder="전달내용을 입력하세요."
                      />
                    </div>

                    {inspectionMode === '조치후' ? (
                      <>
                        <div className="vendor-sanitation-block">
                          <div className="vendor-sanitation-block__title">조치후 사진</div>
                          <div className="vendor-sanitation-photo-grid">
                            {group.afterImages.map((image) => (
                              <button
                                key={image.id}
                                type="button"
                                className="vendor-sanitation-photo"
                                onClick={() => setSelectedImage(image.src)}
                              >
                                <img src={image.src} alt={image.alt} />
                                <span>{image.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="vendor-sanitation-note">
                          <label htmlFor={`note-after-${group.key}`}>조치내용</label>
                          <input
                            id={`note-after-${group.key}`}
                            type="text"
                            value={notes[group.key]?.after ?? ''}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [group.key]: {
                                  ...current[group.key],
                                  after: event.target.value,
                                },
                              }))
                            }
                            placeholder="조치내용을 입력하세요."
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </SideMenuLayout>
      </main>

      {selectedImage ? (
        <div className="vendor-sanitation-lightbox" role="presentation" onClick={() => setSelectedImage(null)}>
          <div
            className="vendor-sanitation-lightbox__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="이미지 확대 보기"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="vendor-sanitation-lightbox__close"
              onClick={() => setSelectedImage(null)}
            >
              닫기
            </button>
            <img src={selectedImage} alt="확대 이미지" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default VendorSanitation
