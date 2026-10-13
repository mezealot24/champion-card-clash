import { useCallback, useEffect, useState } from 'react'

// tiny loader: re-run with reload() after a save
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(() => {
    run().then(setData, (e: Error) => setError(e.message))
  }, [run])
  useEffect(reload, [reload])
  return { data, error, reload }
}

export function must<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}
