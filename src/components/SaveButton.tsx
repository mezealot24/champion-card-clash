import { useState } from 'react'

export function SaveButton({ onSave, disabled, label = 'Save' }: { onSave: () => Promise<void>; disabled?: boolean; label?: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  async function click() {
    setState('saving')
    try {
      await onSave()
      setState('saved')
    } catch (e) {
      setState((e as Error).message)
    }
  }
  return (
    <div className="save">
      <button onClick={click} disabled={disabled || state === 'saving'}>{state === 'saving' ? 'Saving…' : label}</button>
      {state === 'saved' && <span className="ok">Saved</span>}
      {!['idle', 'saving', 'saved'].includes(state) && <span className="error">{state}</span>}
    </div>
  )
}
