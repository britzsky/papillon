import type { IngredientOption, MenuIngredientItem } from '../../api/operations'

type IngredientLikeItem = Pick<MenuIngredientItem | IngredientOption, 'ingredient_id' | 'ingredient_name' | 'like'>

type IngredientLikeConfirmModalProps = {
  ingredient: IngredientLikeItem
  isSaving: boolean
  onCancel: () => void
  onConfirm: () => void
}

function IngredientLikeConfirmModal({ ingredient, isSaving, onCancel, onConfirm }: IngredientLikeConfirmModalProps) {
  const isLiked = ingredient.like === 'Y'

  return (
    <div className="menu-manager-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="menu-manager-confirm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="menu-manager-confirm-modal__body">
          <strong>{ingredient.ingredient_name || ingredient.ingredient_id}</strong>
          <p>{isLiked ? '나만의 식자재에서 해제하시겠습니까?' : '나만의 식자재를 등록하시겠습니까?'}</p>
        </div>
        <div className="menu-manager-confirm-modal__actions">
          <button type="button" className="menu-manager-select-button" onClick={onCancel} disabled={isSaving}>
            아니오
          </button>
          <button type="button" className="menu-manager-save-button" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? '저장 중...' : '예'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default IngredientLikeConfirmModal
