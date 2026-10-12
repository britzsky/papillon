export type WorkspaceIconName = 'home' | 'order' | 'inventory' | 'sanitation' | 'headquarters' | 'operations' | 'product'

const paths: Record<WorkspaceIconName, string> = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  order: 'M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01',
  inventory: 'm3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10M7 5l10 4',
  sanitation: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6ZM8 12l3 3 5-6',
  headquarters: 'M4 21V7h6V3h10v18M2 21h20M7 10v1m0 3v1m6-9v1m4-1v1m-4 3v1m4-1v1m-4 3v1m4-1v1m-5 2v3',
  operations: 'M8 3H5v18h14V3h-3M8 2h8v4H8ZM8 10h8M8 14h8M8 18h5',
  product: 'm12 3 9 5-9 5-9-5Zm-9 5v9l9 5 9-5V8M12 13v9',
}

export default function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  return <svg className="workspace-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
