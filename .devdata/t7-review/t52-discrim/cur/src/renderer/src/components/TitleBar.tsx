import { useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.windowIsMaximized().then(setMaximized)
    return window.api.onWindowMaximizeChange(setMaximized)
  }, [])

  return (
    <header className="tb">
      <div className="tb-logo">
        <span className="tb-logo-mark" />
        <span>
          NEBULA <span className="gradient-text">PLAYER</span>
        </span>
      </div>
      <div className="tb-titlebar" />
      <div className="tb-controls no-drag">
        <button className="tb-btn" title="最小化" onClick={() => window.api.windowMinimize()}>
          <Minus size={14} />
        </button>
        <button
          className="tb-btn"
          title={maximized ? '还原' : '最大化'}
          onClick={() => void window.api.windowMaximizeToggle().then(setMaximized)}
        >
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button className="tb-btn close" title="关闭" onClick={() => window.api.windowClose()}>
          <X size={15} />
        </button>
      </div>
    </header>
  )
}
