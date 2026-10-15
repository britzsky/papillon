import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { type AccountOption } from '../../api/operations'

type AccountSearchSelectProps = {
  id: string
  options: AccountOption[]
  placeholder: string
  value: string
  onChange: (accountId: string) => void
}

/** 거래처 고르기(검색 가능한 펼침 목록). 거래처 메뉴 관리·본사 메뉴 가져오기 공용 */
export default function AccountSearchSelect({ id, options, placeholder, value, onChange }: AccountSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const searchInputId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState({ top: 0, left: 0, width: 240, maxHeight: 300 })

  useEffect(() => {
    if (!isOpen) return
    const position = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16)
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const upward = below < 180 && above > below
      const maxHeight = Math.max(80, Math.min(300, upward ? above : below))
      setDropdownStyle({ top: upward ? rect.top - maxHeight - 4 : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [isOpen])
  const [query, setQuery] = useState('')


  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node) && !dropdownRef.current?.contains(event.target as Node)) {
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

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) =>
      `${option.text} ${option.value}`.toLowerCase().includes(normalizedQuery),
    )
  }, [options, query])

  const handleSelect = (accountId: string) => {
    onChange(accountId)
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
        id={id}
        type="button"
        className="menu-manager-cell-input menu-manager-search-select__trigger menu-manager-account-select__trigger"
        aria-controls={searchInputId}
        aria-expanded={isOpen}
        onClick={() => { setQuery(''); setIsOpen((current) => !current) }}
      >
        <span>{selectedOption?.text || placeholder}</span>
      </button>

      {isOpen ? createPortal(
        <div ref={dropdownRef} className="menu-manager-search-select__dropdown menu-manager-account-select__dropdown"
          style={{ ...dropdownStyle, position: 'fixed', right: 'auto', zIndex: 10000, overflow: 'auto' }} onKeyDown={handleKeyDown}>
          <input
            id={searchInputId}
            ref={searchInputRef}
            className="menu-manager-search-select__input"
            placeholder="검색"
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
                  key={option.value}
                  className={`menu-manager-search-select__option${option.value === value ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.text || option.value}
                </button>
              ))
            ) : (
              <div className="menu-manager-search-select__empty">검색 결과 없음</div>
            )}
          </div>
        </div>, document.body
      ) : null}
    </div>
  )
}
