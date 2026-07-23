import type { MenuManagerItem } from '../../api/operations'

type MenuLikeConfirmModalProps = {
  isSaving: boolean
  menu: MenuManagerItem
  onCancel: () => void
  onConfirm: () => void
}

function MenuLikeConfirmModal({ isSaving, menu, onCancel, onConfirm }: MenuLikeConfirmModalProps) {
  const isLiked = menu.like === 'Y'

  return (
    <div className="menu-manager-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="menu-manager-confirm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="menu-manager-confirm-modal__body">
          <strong>{menu.menu_name || menu.menu_id}</strong>
          <p>{isLiked ? '나만의 메뉴에서 해제하시겠습니까?' : '나만의 메뉴를 등록하시겠습니까?'}</p>
        </div>
        <div className="menu-manager-confirm-modal__actions">
          <button type="button" className="menu-manager-select-button" onClick={onCancel} disabled={isSaving}>
            아니요
          </button>
          <button type="button" className="menu-manager-save-button" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? '저장 중...' : '네'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default MenuLikeConfirmModal
