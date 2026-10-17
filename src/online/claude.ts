// Bridge to the claude.ai Artifact runtime (window.claude.use). Outside an Artifact viewer every capability is null,
// so the online and "vs Tuktah" modes simply don't show up there.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Use = (name: string) => Promise<any>

export function capability<T = any>(name: string): Promise<T | null> {
  const claudeUse = (window as unknown as { claude?: { use?: Use } }).claude?.use
  if (!claudeUse) return Promise.resolve(null)
  return claudeUse(name).catch(() => null)
}

/** The few db calls the online mode makes (see the runtime's db.d.ts for the full surface). */
export type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
export type DocRef = {
  get(): Promise<Snap>
  set(data: Record<string, unknown>): Promise<void>
  update(data: Record<string, unknown>): Promise<void>
  onSnapshot(next: (s: Snap) => void, error?: (e: { code: string }) => void): () => void
  collection(path: string): CollRef
}
export type Query = {
  where(field: string, op: string, value: unknown): Query
  orderBy(field: string, dir?: 'asc' | 'desc'): Query
  limit(n: number): Query
  onSnapshot(next: (s: { docs: Snap[] }) => void, error?: (e: { code: string }) => void): () => void
}
export type CollRef = Query & { doc(id?: string): DocRef }
export type Db = { doc(path: string): DocRef; collection(path: string): CollRef }
export type User = { id(): Promise<string | null> }
export type Sample = {
  json<T = unknown>(input: string, opts?: { modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean }): Promise<T>
}
