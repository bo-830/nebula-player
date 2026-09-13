import { useUiStore } from '../stores/uiStore'

export function Toasts(): React.JSX.Element | null {
  const toasts = useUiStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type}`}
          onClick={() => useUiStore.getState().dismissToast(t.id)}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
