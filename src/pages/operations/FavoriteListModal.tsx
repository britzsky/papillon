import LoadingScreen from '../../components/LoadingScreen'
import type { IngredientOption, MenuManagerItem } from '../../api/operations'

type FavoriteListModalProps =
  | {
      type: 'menu'
      title: string
      isLoading: boolean
      items: MenuManagerItem[]
      onClose: () => void
      onSelect?: (item: MenuManagerItem) => void
    }
  | {
      type: 'ingredient'
      title: string
      isLoading: boolean
      items: IngredientOption[]
      onClose: () => void
      onSelect?: (item: IngredientOption) => void
    }

function FavoriteListModal(props: FavoriteListModalProps) {
  return (
    <div className="menu-manager-modal-backdrop" role="presentation" onClick={props.onClose}>
      <section className="menu-manager-favorite-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="menu-manager-image-modal__header">
          <div>
            <h2>{props.title}</h2>
            <span>{props.isLoading ? '조회 중' : `${props.items.length}건`}</span>
          </div>
          <button type="button" className="menu-manager-select-button" onClick={props.onClose}>
            닫기
          </button>
        </div>
        <div className="menu-manager-favorite-modal__body">
          {props.isLoading ? <LoadingScreen compact message={`${props.title}을 불러오는 중입니다.`} /> : null}
          {!props.isLoading && props.items.length === 0 ? <div className="menu-manager-empty">조회된 내용이 없습니다.</div> : null}
          {!props.isLoading && props.items.length > 0 ? (
            <div className="menu-manager-favorite-list">
              {props.type === 'menu'
                ? props.items.map((item) => (
                    <button
                      key={item.menu_id}
                      type="button"
                      className="menu-manager-favorite-list__item"
                      onClick={() => props.onSelect?.(item)}
                    >
                      <strong>{item.menu_name || item.menu_id}</strong>
                      <span>{[item.meal_category, item.menu_type, item.menu_gubun].filter(Boolean).join(' / ') || '-'}</span>
                    </button>
                  ))
                : props.items.map((item) => (
                    <button
                      key={item.ingredient_id}
                      type="button"
                      className="menu-manager-favorite-list__item"
                      onClick={() => props.onSelect?.(item)}
                    >
                      <strong>{item.ingredient_name || item.ingredient_id}</strong>
                      <span>{[item.category_name, item.base_unit].filter(Boolean).join(' / ') || '-'}</span>
                    </button>
                  ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default FavoriteListModal
