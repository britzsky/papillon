import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { IngredientOption } from '../../api/operations'

type IngredientSearchSelectProps = {
  className?: string
  options: IngredientOption[]
  placeholder: string
  selectedName: string
  value: string
  onChange: (ingredientId: string) => void
}

const searchPlaceholder = '\uAC80\uC0C9'
const noResultsText = '\uAC80\uC0C9 \uACB0\uACFC \uC5C6\uC74C'

function IngredientSearchSelect({
  className = '',
  options,
  placeholder,
  selectedName,
  value,
  onChange,
}: IngredientSearchSelectProps) {
  const searchInputId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [query, setQuery] = useState('')

  // 닫힐 때마다 검색어를 비운다 (effect에서 초기화하면 렌더가 한 번 더 일어남)
  const close = () => {
    setIsOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  // 목록은 body에 띄워(표의 스크롤 칸·셀에 잘리지 않게) 버튼 바로 아래(공간이 모자라면 위)에 고정한다. 스크롤·창 크기에 따라 다시 맞춤
  useLayoutEffect(() => {
    if (!isOpen) return
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(300, Math.max(rect.width, 220))
      const height = dropdownRef.current?.offsetHeight ?? 280
      const below = window.innerHeight - rect.bottom
      const top = below < height + 8 && rect.top > below ? Math.max(4, rect.top - height - 4) : rect.bottom + 4
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - width - 4))
      setDropdownStyle({ position: 'fixed', top, left, width, zIndex: 4000 })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus({ preventScroll: true })
    }
  }, [isOpen])

  const selectedOption = useMemo(() => {
    return options.find((option) => option.ingredient_id === value) ?? null
  }, [options, value])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) => option.ingredient_name.toLowerCase().includes(normalizedQuery))
  }, [options, query])

  const handleSelect = (ingredientId: string) => {
    onChange(ingredientId)
    close()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      close()
    }
  }

  return (
    <div className="menu-manager-search-select" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={`menu-manager-cell-input menu-manager-search-select__trigger${className ? ` ${className}` : ''}`}
        aria-controls={searchInputId}
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <span>{selectedOption?.ingredient_name || selectedName || placeholder}</span>
      </button>

      {isOpen ? createPortal(
        <div className="menu-manager-search-select__dropdown" ref={dropdownRef} style={dropdownStyle} onKeyDown={handleKeyDown}>
          <input
            id={searchInputId}
            ref={searchInputRef}
            className="menu-manager-search-select__input"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="menu-manager-search-select__options">
            <button
              type="button"
              className={`menu-manager-search-select__option${value === '' ? ' is-selected' : ''}`}
              onClick={() => handleSelect('')}
            >
              {placeholder}
            </button>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  type="button"
                  key={option.ingredient_id}
                  className={`menu-manager-search-select__option${option.ingredient_id === value ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(option.ingredient_id)}
                >
                  {option.ingredient_name}
                </button>
              ))
            ) : (
              <div className="menu-manager-search-select__empty">{noResultsText}</div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

export default IngredientSearchSelect
