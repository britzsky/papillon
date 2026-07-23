import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
    }
  }, [isOpen, selectedName, value])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus()
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
    setIsOpen(false)
    setQuery('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="menu-manager-search-select" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={`menu-manager-cell-input menu-manager-search-select__trigger${className ? ` ${className}` : ''}`}
        aria-controls={searchInputId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selectedOption?.ingredient_name || selectedName || placeholder}</span>
      </button>

      {isOpen ? (
        <div className="menu-manager-search-select__dropdown">
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
        </div>
      ) : null}
    </div>
  )
}

export default IngredientSearchSelect
