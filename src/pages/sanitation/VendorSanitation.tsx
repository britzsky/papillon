import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import './VendorSanitation.css'
import { useVendorSanitation, type InspectionMode, inspectionModes } from '../../features/sanitation/useVendorSanitation'

function VendorSanitation() {
  const { selectableVendorOptions, vendor, setVendor, inspectionDate, setInspectionDate, inspectionMode, setInspectionMode, selectedImage, setSelectedImage, aiNoteMessage, isAiNoteLoading, notes, setNotes, photoGroups, handleGenerateAiNotes } = useVendorSanitation()
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
