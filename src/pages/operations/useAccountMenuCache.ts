import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

// Keep drafts and original snapshots separate for each account, including late responses.
export function useAccountMenuCache<T>(accountId: string): [Record<string, T>, Dispatch<SetStateAction<Record<string, T>>>] {
  const [accounts, setAccounts] = useState<Record<string, Record<string, T>>>({})
  const current = useMemo(() => accounts[accountId] ?? {}, [accounts, accountId])
  const setCurrent = useCallback<Dispatch<SetStateAction<Record<string, T>>>>(update => {
    setAccounts(previous => ({ ...previous, [accountId]: typeof update === 'function'
      ? update(previous[accountId] ?? {}) : update }))
  }, [accountId])
  return [current, setCurrent]
}
