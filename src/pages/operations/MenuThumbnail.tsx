import { useEffect, useState } from 'react'

type MenuThumbnailProps = {
  name: string
  src?: string
  isDirty?: boolean
}

function MenuThumbnail({ name, src, isDirty = false }: MenuThumbnailProps) {
  const [hasError, setHasError] = useState(false)
  const trimmedSrc = src?.trim()
  const initial = name.trim().slice(0, 1) || '-'

  useEffect(() => {
    setHasError(false)
  }, [trimmedSrc])

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

  return (
    <span className={`menu-manager-thumbnail-frame${isDirty ? ' is-dirty' : ''}`}>
      <img
        className="menu-manager-thumbnail"
        src={trimmedSrc}
        alt={name || 'menu'}
        loading="lazy"
        title={trimmedSrc}
        onError={() => setHasError(true)}
      />
      {isDirty ? <span className="menu-manager-thumbnail-badge">수정</span> : null}
    </span>
  )
}

export default MenuThumbnail
