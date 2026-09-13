import { useEffect, useState } from 'react'
import { Eye, EyeOff, FolderPlus, Loader2, PlugZap, RefreshCw, Trash2 } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLibraryStore } from '../stores/libraryStore'
import { useUiStore } from '../stores/uiStore'
import { formatDuration } from '../lib/format'
import type { UpdateStatus } from '../../../shared/types'
import type { Settings } from '../types'

type Tab = 'general' | 'ai' | 'about'

export function SettingsModal(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const close = (): void => useUiStore.getState().setSettingsOpen(false)

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">设 置</div>
          <button className="tb-btn" onClick={close}>
            ✕
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: '0 20px 10px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          {(
            [
              ['general', '通用'],
              ['ai', 'AI 配置'],
              ['about', '关于']
            ] as Array<[Tab, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              className={`nb-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {tab === 'general' && <GeneralTab />}
          {tab === 'ai' && <AiTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <label className="form-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function GeneralTab(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.data)
  const tracks = useLibraryStore((s) => s.tracks)
  const stats = useLibraryStore((s) => s.stats)
  const scanning = useLibraryStore((s) => s.scanning)
  const toast = useUiStore((s) => s.toast)
  const [busy, setBusy] = useState(false)

  if (!settings) return <div className="empty-sub">加载中…</div>

  const general = settings.general

  const addFolders = async (): Promise<void> => {
    const folders = await window.api.selectFolders()
    if (folders.length === 0) return
    const merged = Array.from(new Set([...general.scanFolders, ...folders]))
    await useSettingsStore.getState().updateGeneral({ scanFolders: merged })
    await useLibraryStore.getState().scan(folders)
  }

  const rescanAll = async (): Promise<void> => {
    if (general.scanFolders.length === 0) {
      toast('尚未添加扫描目录,请先添加', 'info')
      return
    }
    setBusy(true)
    try {
      await useLibraryStore.getState().scan(general.scanFolders)
    } finally {
      setBusy(false)
    }
  }

  const cleanupMissing = async (): Promise<void> => {
    const n = await useLibraryStore.getState().dropMissing()
    toast(n > 0 ? `已清理 ${n} 首缺失歌曲` : '没有缺失的歌曲', n > 0 ? 'info' : 'success')
  }

  return (
    <div>
      <div className="form-label" style={{ marginBottom: 4 }}>
        行为
      </div>
      <CheckRow
        label="关闭窗口时最小化到系统托盘"
        checked={general.closeToTray}
        onChange={(v) => void useSettingsStore.getState().updateGeneral({ closeToTray: v })}
      />
      <CheckRow
        label="启动时恢复上次播放进度"
        checked={general.resumeOnLaunch}
        onChange={(v) => void useSettingsStore.getState().updateGeneral({ resumeOnLaunch: v })}
      />
      <CheckRow
        label="启用系统媒体键控制（播放/暂停/切歌）"
        checked={general.mediaKeys}
        onChange={async (v) => {
          await useSettingsStore.getState().updateGeneral({ mediaKeys: v })
          await window.api.settingsMediaKeys(v)
          toast(v ? '媒体键已启用' : '媒体键已关闭', 'info')
        }}
      />

      <div className="form-label" style={{ margin: '16px 0 8px' }}>
        扫描目录
      </div>
      {general.scanFolders.length === 0 && (
        <div className="empty-sub" style={{ marginBottom: 8 }}>
          尚未添加目录 {tracks.length > 0 ? '（曲库由拖拽或「添加音乐」导入）' : ''}
        </div>
      )}
      {general.scanFolders.map((f) => (
        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              flex: 1,
              fontSize: 12,
              color: 'var(--text-dim)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {f}
          </span>
          <button
            className="btn icon-square"
            title="移除（不删除歌曲）"
            onClick={() =>
              void useSettingsStore.getState().updateGeneral({
                scanFolders: general.scanFolders.filter((x) => x !== f)
              })
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => void addFolders()}>
          <FolderPlus size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          添加目录并扫描
        </button>
        <button className="btn" onClick={() => void rescanAll()} disabled={busy || scanning}>
          <RefreshCw size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          重新扫描全部
        </button>
        <button className="btn" onClick={() => void cleanupMissing()}>
          <Trash2 size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          清理缺失文件
        </button>
      </div>

      <div className="form-label" style={{ margin: '18px 0 6px' }}>
        曲库概况
      </div>
      <div className="empty-sub">
        共 {stats.total} 首 · {stats.artists} 位歌手 · {stats.albums} 张专辑 · 总时长{' '}
        {formatDuration(stats.totalDuration)}
      </div>
    </div>
  )
}

function AiTab(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.data)
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; models?: string[] } | null>(
    null
  )
  const [dirty, setDirty] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const toast = useUiStore((s) => s.toast)

  // Re-seed the form whenever the persisted settings object changes identity.
  // This is React's documented "adjust state when a prop changes" pattern: the
  // state is corrected during render instead of in an effect, which avoids the
  // extra commit + cascading render that `setState` inside an effect caused.
  const [seededFrom, setSeededFrom] = useState<Settings | null>(null)
  if (settings && seededFrom !== settings) {
    setSeededFrom(settings)
    setBaseURL(settings.api.baseURL)
    setModel(settings.api.model)
    setDirty(false)
    setKey('')
  }

  if (!settings) return <div className="empty-sub">加载中…</div>

  const save = async (): Promise<void> => {
    await useSettingsStore.getState().setApi({ baseURL, model, apiKey: key || undefined })
    setKey('')
    setDirty(false)
    toast('AI 配置已保存（密钥已加密存储）', 'success')
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      // persist first so the test uses the fresh values
      await useSettingsStore.getState().setApi({ baseURL, model, apiKey: key || undefined })
      setKey('')
      const r = await window.api.settingsTestApi()
      setResult(r)
      setSuggestions(r.models ?? [])
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
      setSuggestions([])
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div className="empty-sub" style={{ marginBottom: 14 }}>
        兼容 OpenAI Chat Completions 接口（OpenAI / DeepSeek / Moonshot / 通义 / GLM 等）。 仅 AI
        功能需要联网，本地播放完全离线可用。
      </div>
      <div className="form-row">
        <label className="form-label">接口地址（Base URL）</label>
        <input
          className="form-input"
          placeholder="https://api.deepseek.com/v1"
          value={baseURL}
          onChange={(e) => {
            setBaseURL(e.target.value)
            setDirty(true)
          }}
        />
      </div>
      <div className="form-row">
        <label className="form-label">模型名称</label>
        <input
          className="form-input"
          placeholder="deepseek-chat"
          value={model}
          onChange={(e) => {
            setModel(e.target.value)
            setDirty(true)
          }}
        />
        {suggestions.length > 0 && (
          <div className="model-suggest">
            {suggestions.includes(model) ? (
              <div className="empty-sub" style={{ marginTop: 6 }}>
                当前模型已在支持列表中 ✓
              </div>
            ) : (
              <div className="empty-sub" style={{ marginTop: 6 }}>
                接口支持以下模型，点选即可：
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {suggestions.map((m) => (
                <button
                  key={m}
                  className={`chip-badge model-chip ${m === model ? 'sel' : ''}`}
                  style={{ cursor: 'pointer', padding: '5px 12px' }}
                  onClick={() => {
                    setModel(m)
                    setDirty(true)
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="form-row">
        <label className="form-label">
          API Key {settings.api.hasKey ? '（已保存，留空则不修改）' : ''}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="form-input"
            style={{ paddingRight: 36 }}
            type={showKey ? 'text' : 'password'}
            placeholder={settings.api.hasKey ? '••••••••••••' : 'sk-…'}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setDirty(true)
            }}
          />
          <button
            className="tb-btn"
            style={{ position: 'absolute', right: 4, top: 3 }}
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {settings.api.keyMode === 'plain' && (
        <div
          className="toast error"
          style={{ marginBottom: 12, animation: 'none', pointerEvents: 'auto' }}
        >
          当前系统安全存储不可用，API Key 以加密前处理方式保存在本地，请注意保管设备安全。
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={() => void save()} disabled={!dirty}>
          保存配置
        </button>
        <button
          className="btn"
          onClick={() => void test()}
          disabled={testing || !baseURL || !model}
        >
          {testing ? (
            <Loader2 size={13} className="muted-spin" />
          ) : (
            <PlugZap size={13} style={{ verticalAlign: '-2px' }} />
          )}
          <span style={{ marginLeft: 5 }}>测试连接</span>
        </button>
        {settings.api.hasKey && (
          <button
            className="btn danger"
            onClick={() => {
              void useSettingsStore.getState().setApi({ apiKey: '' })
              setKey('')
              setDirty(false)
              toast('API Key 已清除', 'info')
            }}
          >
            清除 Key
          </button>
        )}
      </div>
      {result && (
        <div
          className={`toast ${result.ok ? 'success' : 'error'}`}
          style={{ marginTop: 12, animation: 'none', pointerEvents: 'auto' }}
        >
          {result.ok ? '✓ ' : '✗ '}
          {result.message}
        </div>
      )}
    </div>
  )
}

function AboutTab(): React.JSX.Element {
  const [info, setInfo] = useState<{
    version: string
    platform: string
    userDataPath: string
  } | null>(null)
  const settings = useSettingsStore((s) => s.data)
  const [updateURL, setUpdateURL] = useState('')
  const [updStatus, setUpdStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const toast = useUiStore((s) => s.toast)

  useEffect(() => {
    void window.api.appInfo().then(setInfo)
  }, [])
  // Same "adjust state when a prop changes" pattern as AiTab: mirror the stored
  // update URL into the draft field during render, not from an effect.
  const [seededFrom, setSeededFrom] = useState<Settings | null>(null)
  if (settings && seededFrom !== settings) {
    setSeededFrom(settings)
    setUpdateURL(settings.general.updateURL)
  }

  useEffect(() => window.api.onUpdateStatus(setUpdStatus), [])

  const saveURL = async (): Promise<void> => {
    await useSettingsStore.getState().updateGeneral({ updateURL: updateURL.trim() })
    toast('更新源已保存', 'success')
  }

  const check = async (): Promise<void> => {
    await saveURL()
    setBusy(true)
    try {
      const s = await window.api.updateCheck()
      setUpdStatus(s)
    } finally {
      setBusy(false)
    }
  }

  const statusText =
    updStatus.state === 'idle'
      ? ''
      : updStatus.state === 'not-configured'
        ? '请先保存上面的更新源地址'
        : updStatus.state === 'checking'
          ? '正在检查更新…'
          : updStatus.state === 'none'
            ? '已是最新版本 ✓'
            : updStatus.state === 'available'
              ? `发现新版本 v${updStatus.version}`
              : updStatus.state === 'downloading'
                ? `正在下载更新 ${updStatus.percent}%`
                : updStatus.state === 'downloaded'
                  ? `v${updStatus.version} 已下载完成，可重启安装`
                  : updStatus.state === 'error'
                    ? `更新失败：${updStatus.message}`
                    : ''

  return (
    <div>
      <div className="empty-sub" style={{ lineHeight: 2.2 }}>
        <div>
          <span className="gradient-text" style={{ fontSize: 16, fontWeight: 700 }}>
            NEBULA Player
          </span>{' '}
          v{info?.version ?? '…'}
        </div>
        <div>深空黑科技风 · AI 本地音乐播放器</div>
        <div>平台：{info?.platform ?? '…'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>
            日志目录：
            <span style={{ color: 'var(--text-dim)' }}>userData/logs</span>
          </span>
          <button className="btn" onClick={() => void window.api.openLogDir()}>
            打开日志目录
          </button>
        </div>
        <div>
          数据目录：
          <span style={{ wordBreak: 'break-all', color: 'var(--text-dim)' }}>
            {info?.userDataPath ?? '…'}
          </span>
        </div>
        <div style={{ marginTop: 8, color: 'var(--text-faint)' }}>
          本地播放完全离线 · 仅 AI 对话联网 · 不读取不修改源文件 · API Key 系统级加密存储
        </div>
      </div>

      <div className="form-label" style={{ margin: '16px 0 6px' }}>
        自动更新 · 更新源地址（Generic 静态托管，需含 latest.yml 与安装包）
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="https://your-bucket.example.com/nebula-player/"
          value={updateURL}
          onChange={(e) => setUpdateURL(e.target.value)}
        />
        <button className="btn" onClick={() => void saveURL()}>
          保存
        </button>
      </div>
      <div className="empty-sub" style={{ marginTop: 6 }}>
        启动后 8 秒自动检查一次；也可手动检查。更新源内放置 <code>latest.yml</code>{' '}
        和最新安装包即可。
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button
          className="btn primary"
          onClick={() => void check()}
          disabled={busy || !updateURL.trim()}
        >
          <RefreshCw size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          检查更新
        </button>
        {(updStatus.state === 'available' || updStatus.state === 'downloaded') && (
          <button
            className="btn"
            onClick={() => {
              if (updStatus.state === 'available') {
                setBusy(true)
                void window.api
                  .updateDownload()
                  .then(setUpdStatus)
                  .finally(() => setBusy(false))
              } else {
                window.api.updateInstall()
              }
            }}
            disabled={busy}
          >
            {updStatus.state === 'available' ? '下载更新' : '重启并安装'}
          </button>
        )}
        {statusText && (
          <span
            className={`empty-sub ${updStatus.state === 'error' ? '' : ''}`}
            style={{ color: updStatus.state === 'error' ? '#ff8095' : 'var(--text-dim)' }}
          >
            {statusText}
          </span>
        )}
      </div>
    </div>
  )
}
