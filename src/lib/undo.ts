import { useEffect, useState } from 'react'

// One-step undo for 25 seconds after any change. The save helpers in data.ts register how to put things back.
export type Undoable = { id: number; label: string; run: () => Promise<void>; expires: number }
const UNDO_MS = 25_000
let current: Undoable | null = null
let seq = 0
const listeners = new Set<(u: Undoable | null) => void>()
const emit = () => listeners.forEach(l => l(current))

export function offerUndo(label: string, run: () => Promise<void>) {
  const u = { id: ++seq, label, run, expires: Date.now() + UNDO_MS }
  current = u; emit()
  setTimeout(() => { if (current?.id === u.id) { current = null; emit() } }, UNDO_MS)
}
export async function undoNow() {
  const u = current; if (!u) return
  current = null; emit()
  await u.run()
}
export function dismissUndo() { current = null; emit() }
export function useUndo() {
  const [u, setU] = useState<Undoable | null>(current)
  useEffect(() => { listeners.add(setU); return () => { listeners.delete(setU) } }, [])
  return u
}
