import { useEffect } from 'react'
import type { RecipeRequest } from '../api/recipe'
import { isHeadquarters } from '../features/workspace/workspaceAccount'
import './AiRecipeModal.css'

export type RecipeActionMenuState = {
  request: RecipeRequest
  x: number
  y: number
  orderMenuId?: string
  /** 부른 곳에서만 쓰는 항목(예: 식단표 편집 칸의 '특식으로 바꾸기'). 맨 위에 보인다 */
  extraAction?: { label: string; run: () => void }
}

type RecipeActionMenuProps = {
  state: RecipeActionMenuState | null
  onClose: () => void
  onViewAi: (request: RecipeRequest) => void
  onViewBasic: (request: RecipeRequest) => void
  onRegister: (request: RecipeRequest) => void
  onOrder?: (menuId: string) => void
  /** 식단표: 이 업장(거래처) 레시피 수정 창 열기 */
  onEditAccountRecipe?: (request: RecipeRequest) => void
  /** 식단표: 나만의 메뉴 지정·해제(불러온 식단의 메뉴도 여기서) */
  isFavorite?: (menuId: string) => boolean
  onToggleFavorite?: (menuId: string) => void
}

function RecipeActionMenu({ state, onClose, onViewAi, onViewBasic, onRegister, onOrder, onEditAccountRecipe, isFavorite, onToggleFavorite }: RecipeActionMenuProps) {
  useEffect(() => {
    if (!state) {
      return
    }

    const handleClose = () => onClose()
    window.addEventListener('click', handleClose)
    window.addEventListener('scroll', handleClose, true)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('scroll', handleClose, true)
    }
  }, [onClose, state])

  if (!state) {
    return null
  }

  return (
    <div
      className="recipe-action-menu"
      // 화면 오른쪽·아래 끝에서 눌러도 메뉴가 잘리지 않게(폭 최대 220px·항목 7개 높이 기준)
      style={{ left: Math.max(8, Math.min(state.x, window.innerWidth - 228)), top: Math.max(8, Math.min(state.y, window.innerHeight - 300)) }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
    >
      {/* 어떤 메뉴의 항목인지 맨 위에 작게(긴 이름은 말줄임) */}
      {state.request.menu_name ? <div className="recipe-action-menu__title" title={state.request.menu_name}>{state.request.menu_name}</div> : null}
      {state.extraAction ? (
        <button
          type="button"
          role="menuitem"
          className="recipe-action-menu__extra"
          onClick={() => {
            state.extraAction?.run()
            onClose()
          }}
        >
          {state.extraAction.label}
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="recipe-action-menu__ai"
        onClick={() => {
          onViewAi(state.request)
          onClose()
        }}
      >
        <span className="recipe-action-menu__ai-label">AI</span> 레시피 보기
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onViewBasic(state.request)
          onClose()
        }}
      >
        기본 레시피 보기
      </button>
      {onEditAccountRecipe && state.request.menu_id && state.request.account_id ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onEditAccountRecipe(state.request)
            onClose()
          }}
        >
          이 업장 레시피 수정
        </button>
      ) : null}
      {onToggleFavorite && state.request.menu_id ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            if (state.request.menu_id) {
              onToggleFavorite(state.request.menu_id)
            }
            onClose()
          }}
        >
          {/* 2026-10-28: 저장된 나만의 메뉴는 빨간 하트 */}
          {isFavorite?.(state.request.menu_id) ? <><span style={{ color: '#e02424' }}>♥</span> 나만의 메뉴 해제</> : '♡ 나만의 메뉴로 저장'}
        </button>
      ) : null}
      {/* 레시피 등록·수정은 본사만(서버 /Menu/RecipeSave 본사 전용). 저장된 레시피가 있으면 창이 불러와 수정한다 */}
      {isHeadquarters() ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onRegister(state.request)
            onClose()
          }}
        >
          레시피 등록·수정
        </button>
      ) : null}
      {state.orderMenuId && onOrder ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            if (state.orderMenuId) {
              onOrder(state.orderMenuId)
            }
            onClose()
          }}
        >
          발주하러 가기
        </button>
      ) : null}
    </div>
  )
}

export default RecipeActionMenu
