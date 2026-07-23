import { useEffect, useMemo, useState } from 'react'
import AppAlert, { type AppAlertState } from './AppAlert'
import { buildEmptyRecipe, saveRecipe, type Recipe, type RecipeImage, type RecipeRequest, type RecipeVideo } from '../api/recipe'
import './AiRecipeModal.css'

type RecipeRegisterModalProps = {
  request: RecipeRequest | null
  onClose: () => void
  onSaved?: () => void
}

type RecipeTab = 'basic' | 'ingredients' | 'steps' | 'safety' | 'media'

const recipeTabs: Array<{ key: RecipeTab; label: string }> = [
  { key: 'basic', label: '기본정보' },
  { key: 'ingredients', label: '식자재' },
  { key: 'steps', label: '조리순서' },
  { key: 'safety', label: '위생/보관' },
  { key: 'media', label: '미디어' },
]

function normalizeItems(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean)
}

function EditableList({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}) {
  const safeItems = items.length > 0 ? items : ['']

  return (
    <section className="recipe-register__block">
      <div className="recipe-register__block-header">
        <h3>{label}</h3>
        <button type="button" onClick={() => onChange([...safeItems, ''])}>
          추가
        </button>
      </div>
      <div className="recipe-register__list">
        {safeItems.map((item, index) => (
          <div key={`${label}-${index}`} className="recipe-register__row">
            <input
              value={item}
              placeholder={placeholder}
              onChange={(event) => {
                const next = [...safeItems]
                next[index] = event.target.value
                onChange(next)
              }}
            />
            <button
              type="button"
              onClick={() => onChange(safeItems.filter((_, itemIndex) => itemIndex !== index))}
              disabled={safeItems.length === 1}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function RecipeRegisterModal({ request, onClose, onSaved }: RecipeRegisterModalProps) {
  const [activeTab, setActiveTab] = useState<RecipeTab>('basic')
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [alert, setAlert] = useState<AppAlertState | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!request) {
      setRecipe(null)
      setAlert(null)
      setActiveTab('basic')
      return
    }

    setRecipe(buildEmptyRecipe(request))
    setAlert(null)
    setActiveTab('basic')
  }, [request])

  const recipeJson = useMemo(() => {
    if (!recipe) {
      return ''
    }

    return JSON.stringify(
      {
        recipe: {
          ...recipe,
          ingredients: normalizeItems(recipe.ingredients),
          steps: normalizeItems(recipe.steps),
          tips: normalizeItems(recipe.tips),
          storage: normalizeItems(recipe.storage),
          allergens: normalizeItems(recipe.allergens),
          images: recipe.images.map(({ file: _file, ...image }) => image),
        },
      },
      null,
      2,
    )
  }, [recipe])

  const updateRecipe = (patch: Partial<Recipe>) => {
    setRecipe((current) => (current ? { ...current, ...patch } : current))
  }

  const updateImage = (index: number, patch: Partial<RecipeImage>) => {
    if (!recipe) return
    updateRecipe({
      images: recipe.images.map((image, imageIndex) => (imageIndex === index ? { ...image, ...patch } : image)),
    })
  }

  const updateVideo = (index: number, patch: Partial<RecipeVideo>) => {
    if (!recipe) return
    updateRecipe({
      videos: recipe.videos.map((video, videoIndex) => (videoIndex === index ? { ...video, ...patch } : video)),
    })
  }

  const handleSave = async () => {
    if (!recipe || !request) {
      return
    }

    try {
      setIsSaving(true)
      setAlert(null)
      await saveRecipe(
        {
          ...recipe,
          ingredients: normalizeItems(recipe.ingredients),
          steps: normalizeItems(recipe.steps),
          tips: normalizeItems(recipe.tips),
          storage: normalizeItems(recipe.storage),
          allergens: normalizeItems(recipe.allergens),
        },
        request,
      )
      setAlert({ type: 'success', title: '저장 완료', message: '레시피 등록이 완료되었습니다.' })
      onSaved?.()
    } catch (error) {
      setAlert({
        type: 'error',
        title: '저장 실패',
        message: error instanceof Error ? error.message : '레시피를 저장하지 못했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!request || !recipe) {
    return null
  }

  return (
    <div className="ai-recipe-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="ai-recipe-modal recipe-register"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-register-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ai-recipe-modal__header">
          <div>
            <p>Recipe Register</p>
            <h2 id="recipe-register-title">레시피 등록</h2>
            <span>{request.menu_name}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            X
          </button>
        </header>

        <div className="recipe-register__tabs" role="tablist">
          {recipeTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? 'is-active' : ''}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ai-recipe-modal__body">
          {activeTab === 'basic' ? (
            <section className="recipe-register__form-grid">
              <label>
                <span>메뉴 ID</span>
                <input value={recipe.menu_id ?? ''} onChange={(event) => updateRecipe({ menu_id: event.target.value })} />
              </label>
              <label>
                <span>메뉴명</span>
                <input value={recipe.menu_name} onChange={(event) => updateRecipe({ menu_name: event.target.value })} />
              </label>
              <label className="is-wide">
                <span>레시피 제목</span>
                <input value={recipe.title} onChange={(event) => updateRecipe({ title: event.target.value })} />
              </label>
              <label className="is-wide">
                <span>요약</span>
                <textarea value={recipe.summary} onChange={(event) => updateRecipe({ summary: event.target.value })} />
              </label>
              <label className="is-wide">
                <span>기준 인분/메모</span>
                <textarea
                  value={recipe.servings_note}
                  onChange={(event) => updateRecipe({ servings_note: event.target.value })}
                />
              </label>
            </section>
          ) : null}

          {activeTab === 'ingredients' ? (
            <EditableList
              label="식자재"
              items={recipe.ingredients}
              placeholder="쇠고기 20kg"
              onChange={(ingredients) => updateRecipe({ ingredients })}
            />
          ) : null}

          {activeTab === 'steps' ? (
            <EditableList
              label="조리 순서"
              items={recipe.steps}
              placeholder="재료를 규격에 맞게 손질합니다."
              onChange={(steps) => updateRecipe({ steps })}
            />
          ) : null}

          {activeTab === 'safety' ? (
            <>
              <EditableList
                label="대량급식 팁"
                items={recipe.tips}
                placeholder="소스를 나누어 볶으면 수분 발생을 줄일 수 있습니다."
                onChange={(tips) => updateRecipe({ tips })}
              />
              <EditableList
                label="보관/위생"
                items={recipe.storage}
                placeholder="조리 후 중심온도 60도 이상을 유지합니다."
                onChange={(storage) => updateRecipe({ storage })}
              />
              <EditableList
                label="알레르기"
                items={recipe.allergens}
                placeholder="대두"
                onChange={(allergens) => updateRecipe({ allergens })}
              />
            </>
          ) : null}

          {activeTab === 'media' ? (
            <>
              <section className="recipe-register__block">
                <div className="recipe-register__block-header">
                  <h3>이미지</h3>
                  <button
                    type="button"
                    onClick={() => updateRecipe({ images: [...recipe.images, { name: '', url: '', is_primary: recipe.images.length === 0 }] })}
                  >
                    추가
                  </button>
                </div>
                {recipe.images.map((image, index) => (
                  <div key={`image-${index}`} className="recipe-register__media-row">
                    <input
                      value={image.name}
                      placeholder="이미지명"
                      onChange={(event) => updateImage(index, { name: event.target.value })}
                    />
                    <input
                      value={image.url}
                      placeholder="/uploads/recipe/M001/main.jpg"
                      onChange={(event) => updateImage(index, { url: event.target.value })}
                    />
                    <label className="recipe-register__check">
                      <input
                        type="checkbox"
                        checked={image.is_primary}
                        onChange={(event) => updateImage(index, { is_primary: event.target.checked })}
                      />
                      대표
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        updateImage(index, {
                          file,
                          name: image.name || file.name,
                          url: image.url || file.name,
                        })
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => updateRecipe({ images: recipe.images.filter((_, imageIndex) => imageIndex !== index) })}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </section>

              <section className="recipe-register__block">
                <div className="recipe-register__block-header">
                  <h3>동영상 URL</h3>
                  <button type="button" onClick={() => updateRecipe({ videos: [...recipe.videos, { title: '', url: '', description: '' }] })}>
                    추가
                  </button>
                </div>
                {recipe.videos.map((video, index) => (
                  <div key={`video-${index}`} className="recipe-register__media-row">
                    <input value={video.title} placeholder="영상 제목" onChange={(event) => updateVideo(index, { title: event.target.value })} />
                    <input value={video.url} placeholder="https://..." onChange={(event) => updateVideo(index, { url: event.target.value })} />
                    <input
                      value={video.description}
                      placeholder="설명"
                      onChange={(event) => updateVideo(index, { description: event.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => updateRecipe({ videos: recipe.videos.filter((_, videoIndex) => videoIndex !== index) })}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </section>

              <section className="recipe-register__block">
                <div className="recipe-register__block-header">
                  <h3>저장 JSON 미리보기</h3>
                </div>
                <pre className="recipe-register__json">{recipeJson}</pre>
              </section>
            </>
          ) : null}
        </div>

        <footer className="ai-recipe-modal__actions">
          <button type="button" className="is-secondary" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="is-primary is-summary" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? '저장 중' : '저장'}
          </button>
        </footer>
        <AppAlert alert={alert} onClose={() => setAlert(null)} />
      </section>
    </div>
  )
}

export default RecipeRegisterModal
