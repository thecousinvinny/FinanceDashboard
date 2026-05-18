export type ToastType = 'add' | 'payment' | 'delete'

export interface ToastUndo {
  onUndo:   () => void
  onCommit: () => void
}

export interface ToastItem {
  id:       string
  message:  string
  type:     ToastType
  duration: number
  undo?:    ToastUndo
}

type Listener = (items: ToastItem[]) => void

let _items: ToastItem[] = []
const _listeners = new Set<Listener>()

function _emit() { _listeners.forEach(fn => fn([..._items])) }

export function showToast(
  message: string,
  opts: { type?: ToastType; undo?: ToastUndo } = {},
): void {
  const id = Math.random().toString(36).slice(2, 9)
  _items = [
    { id, message, type: opts.type ?? 'add', duration: opts.undo ? 5000 : 2500, undo: opts.undo },
    ..._items,
  ]
  _emit()
}

export function dismissToast(id: string, action: 'commit' | 'undo'): void {
  const item = _items.find(t => t.id === id)
  if (item?.undo) {
    if (action === 'undo') item.undo.onUndo()
    else item.undo.onCommit()
  }
  _items = _items.filter(t => t.id !== id)
  _emit()
}

export function subscribeToasts(fn: Listener): () => void {
  _listeners.add(fn)
  fn([..._items])
  return () => { _listeners.delete(fn) }
}
