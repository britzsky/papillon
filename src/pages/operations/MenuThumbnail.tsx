import { useState } from 'react'
import ImageZoom from '../../components/ImageZoom'

type MenuThumbnailProps = {
  name: string
  src?: string
  isDirty?: boolean
  zoomable?: boolean
  onEdit?: () => void
}

function MenuThumbnail({ name, src, isDirty = false, zoomable = false, onEdit }: MenuThumbnailProps) {
  const trimmedSrc = src?.trim()
  // 로드에 실패한 주소를 기억해 두고, 주소가 바뀌면 자동으로 오류 상태가 풀리게 한다
  const [failedSrc, setFailedSrc] = useState<string>()
  const hasError = Boolean(trimmedSrc) && failedSrc === trimmedSrc
  const setHasError = () => setFailedSrc(trimmedSrc)
  const initial = name.trim().slice(0, 1) || '-'

  if (onEdit) {
    const hasImage = Boolean(trimmedSrc) && !hasError
    const actionLabel = hasImage ? '사진 변경' : '사진 등록'
    return (
      <button
        type="button"
        className={`menu-manager-thumbnail-frame menu-manager-photo-button${isDirty ? ' is-dirty' : ''}`}
        aria-label={`${name || '메뉴'} ${actionLabel}`}
        onClick={(event) => {
          event.stopPropagation()
          onEdit()
        }}
      >
        {hasImage ? (
          <img className="menu-manager-thumbnail" src={trimmedSrc} alt={name || '메뉴'}
            loading="lazy" onError={setHasError} />
        ) : <span className="menu-manager-thumbnail is-empty" aria-hidden="true" />}
      </button>
    )
  }

  if (!trimmedSrc || hasError) {
    return (
      <span className={`menu-manager-thumbnail-frame${isDirty ? ' is-dirty' : ''}`}>
        <span className="menu-manager-thumbnail is-empty" aria-hidden="true" title={trimmedSrc || undefined}>
          {initial}
        </span>
        {isDirty ? <span className="menu-manager-thumbnail-badge">수정</span> : null}
      </span>
    )
  }

  const thumbnail = (
    <span className={`menu-manager-thumbnail-frame${isDirty ? ' is-dirty' : ''}`}>
      <img
        className="menu-manager-thumbnail"
        src={trimmedSrc}
        alt={name || 'menu'}
        loading="lazy"
        title={trimmedSrc}
        onError={setHasError}
      />
      {isDirty ? <span className="menu-manager-thumbnail-badge">수정</span> : null}
    </span>
  )
  return zoomable ? <ImageZoom src={trimmedSrc} name={name}>{thumbnail}</ImageZoom> : thumbnail
}

export default MenuThumbnail
