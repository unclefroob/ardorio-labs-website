import { useCallback, useState } from 'react'

export interface SetF<T> {
  <K extends keyof T>(k: K, v: T[K]): void
  (patch: Partial<T>): void
}

export function useF<T extends object>(init: T | (() => T)): [T, SetF<T>] {
  const [f, setF] = useState<T>(init)
  const set = useCallback((k: keyof T | Partial<T>, v?: T[keyof T]) => {
    setF(p => ({ ...p, ...(typeof k === 'object' ? k : { [k]: v }) }))
  }, [])
  // One overloaded signature over two call shapes, so the implementation is widened once here.
  return [f, set as SetF<T>]
}
