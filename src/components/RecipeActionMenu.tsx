import { useEffect } from 'react'
import type { RecipeRequest } from '../api/recipe'
import './AiRecipeModal.css'

export type RecipeActionMenuState = {
  request: RecipeRequest
  x: number
  y: number
  orderMenuId?: string
}

type RecipeActionMenuProps = {
  state: RecipeActionMenuState | null
  onClose: () => void
  onViewAi: (request: RecipeRequest) => void
  onViewBasic: (request: RecipeRequest) => void
  onRegister: (request: RecipeRequest) => void
  onOrder?: (menuId: string) => void
}

function RecipeActionMenu({ state, onClose, onViewAi, onViewBasic, onRegister, onOrder }: RecipeActionMenuProps) {
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
      style={{ left: state.x, top: state.y }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
    >
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
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onRegister(state.request)
          onClose()
        }}
      >
        레시피 등록
      </button>
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
