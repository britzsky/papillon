type MenuLikeButtonProps = {
  isLiked: boolean
  menuName: string
  onClick: () => void
}

function MenuLikeButton({ isLiked, menuName, onClick }: MenuLikeButtonProps) {
  return (
    <button
      type="button"
      className={`menu-manager-like-button${isLiked ? ' is-liked' : ''}`}
      aria-label={`${menuName || 'menu'} like menu`}
      title="Like menu"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <span aria-hidden="true">{'\u2665'}</span>
    </button>
  )
}

export default MenuLikeButton
