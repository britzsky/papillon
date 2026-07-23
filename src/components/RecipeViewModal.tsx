import { useEffect, useState } from 'react'
import { requestAiRecipe } from '../api/ai'
import { getRecipeDetail, type Recipe, type RecipeRequest, type RecipeVideo } from '../api/recipe'
import './AiRecipeModal.css'

export type RecipeViewMode = 'ai' | 'basic'

type RecipeViewModalProps = {
  request: RecipeRequest | null
  mode: RecipeViewMode
  onClose: () => void
  onRegister: (request: RecipeRequest) => void
}

function toRecipeFromAi(result: Awaited<ReturnType<typeof requestAiRecipe>>): Recipe {
  return {
    recipe_id: result.recipe_id,
    menu_id: result.menu_id,
    menu_name: result.menu_name,
    title: result.title,
    summary: result.summary,
    servings_note: result.servings_note,
    ingredients: result.ingredients,
    steps: result.steps,
    tips: result.tips,
    storage: result.storage,
    allergens: result.allergens,
    images: [],
    videos: [],
  }
}

function getYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '').trim()
    }
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v')?.trim() ?? ''
    }
  } catch {
    return ''
  }

  return ''
}

function getEmbeddedVideoUrl(url: string) {
  const youtubeId = getYouTubeVideoId(url)
  return youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : ''
}

function isDirectVideoFile(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
}

function RecipeVideoCard({ video }: { video: RecipeVideo }) {
  const embeddedVideoUrl = getEmbeddedVideoUrl(video.url)
  const canPlayDirectly = isDirectVideoFile(video.url)

  return (
    <article className="ai-recipe-modal__video-card">
      <div className="ai-recipe-modal__video-frame">
        {embeddedVideoUrl ? (
          <iframe
            src={embeddedVideoUrl}
            title={video.title || 'Recipe video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : canPlayDirectly ? (
          <video controls preload="metadata">
            <source src={video.url} />
          </video>
        ) : (
          <div className="ai-recipe-modal__video-fallback">이 링크는 미리보기 재생을 지원하지 않습니다.</div>
        )}
      </div>
      <div className="ai-recipe-modal__video-meta">
        <strong>{video.title || '조리 영상'}</strong>
        <a href={video.url} target="_blank" rel="noreferrer" className="ai-recipe-modal__video-link">
          YouTube로 열기
        </a>
      </div>
    </article>
  )
}

function RecipeViewModal({ request, mode, onClose, onRegister }: RecipeViewModalProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadRecipe = async () => {
      if (!request) {
        setRecipe(null)
        setError('')
        return
      }

      try {
        setIsLoading(true)
        setError('')
        const result = mode === 'ai' ? toRecipeFromAi(await requestAiRecipe(request)) : await getRecipeDetail(request)
        if (!isMounted) return
        setRecipe(result)
      } catch (loadError) {
        if (!isMounted) return
        setRecipe(null)
        setError(loadError instanceof Error ? loadError.message : '레시피를 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadRecipe()
    return () => {
      isMounted = false
    }
  }, [mode, request])

  if (!request) {
    return null
  }

  return (
    <div className="ai-recipe-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="ai-recipe-modal ai-recipe-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-view-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ai-recipe-modal__header">
          <div>
            <p>{mode === 'ai' ? <span className="ai-recipe-modal__ai-chip">AI</span> : 'Recipe'}</p>
            <h2 id="recipe-view-modal-title">{recipe?.title ?? `${request.menu_name} 레시피`}</h2>
            <span>{request.menu_name} · {request.account_name || request.source}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            X
          </button>
        </header>

        <div className="ai-recipe-modal__body">
          {isLoading ? <div className="ai-recipe-modal__notice">레시피를 불러오는 중입니다.</div> : null}
          {!isLoading && error ? <div className="ai-recipe-modal__notice is-error">{error}</div> : null}

          {!isLoading && !error && !recipe ? (
            <div className="ai-recipe-modal__notice">등록된 레시피가 없습니다. 레시피 등록 버튼으로 새 레시피를 작성할 수 있습니다.</div>
          ) : null}

          {!isLoading && recipe ? (
            <>
              <section className="ai-recipe-modal__overview">
                {recipe.summary ? (
                  <article className="ai-recipe-modal__overview-card is-summary">
                    <span className="ai-recipe-modal__overview-label">요약</span>
                    <p>{recipe.summary}</p>
                  </article>
                ) : null}
                {recipe.servings_note ? (
                  <article className="ai-recipe-modal__overview-card is-serving">
                    <span className="ai-recipe-modal__overview-label">인분 / 배식</span>
                    <p>{recipe.servings_note}</p>
                  </article>
                ) : null}
                {recipe.allergens.length > 0 ? (
                  <article className="ai-recipe-modal__overview-card is-alert">
                    <span className="ai-recipe-modal__overview-label">알레르기</span>
                    <ul className="ai-recipe-modal__tag-list">
                      {recipe.allergens.map((item, index) => (
                        <li key={`allergen-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </article>
                ) : null}
              </section>

              <div className="ai-recipe-modal__layout">
                <div className="ai-recipe-modal__content">
                  {recipe.steps.length > 0 ? (
                    <section className="ai-recipe-modal__section ai-recipe-modal__workflow">
                      <div className="ai-recipe-modal__section-head">
                        <h3>조리 순서</h3>
                        <span>{recipe.steps.length}단계</span>
                      </div>
                      <div className="ai-recipe-modal__step-list">
                        {recipe.steps.map((step, index) => (
                          <article key={`step-${index}`} className="ai-recipe-modal__step-card">
                            <div className="ai-recipe-modal__step-badge">STEP {index + 1}</div>
                            <p>{step}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>

                <aside className="ai-recipe-modal__sidebar">
                  {recipe.images.length > 0 ? (
                    <section className="ai-recipe-modal__section">
                      <div className="ai-recipe-modal__section-head">
                        <h3>참고 사진</h3>
                        <span>{recipe.images.length}개</span>
                      </div>
                      <div className={`ai-recipe-modal__image-stack${recipe.images.length > 1 ? ' is-scrollable' : ' is-single'}`}>
                        {recipe.images.map((image, index) => (
                          <figure key={`${image.url}-${index}`} className="ai-recipe-modal__image-card">
                            <img src={image.url} alt={image.name || `${recipe.menu_name} 이미지 ${index + 1}`} />
                            <figcaption>{image.name || `사진 ${index + 1}`}</figcaption>
                          </figure>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {recipe.videos.length > 0 ? (
                    <section className="ai-recipe-modal__section">
                      <div className="ai-recipe-modal__section-head">
                        <h3>조리 영상</h3>
                        <span>{recipe.videos.length}개</span>
                      </div>
                      <div className={`ai-recipe-modal__video-list${recipe.videos.length > 1 ? ' is-scrollable' : ' is-single'}`}>
                        {recipe.videos.map((video, index) => (
                          <RecipeVideoCard key={`${video.url}-${index}`} video={video} />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </aside>
              </div>
            </>
          ) : null}
        </div>

        <footer className="ai-recipe-modal__actions">
          <button type="button" className="is-secondary" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="is-primary" onClick={() => onRegister(request)}>
            레시피 등록
          </button>
        </footer>
      </section>
    </div>
  )
}

export default RecipeViewModal
