/**
 * E2E smoke driver for the running dev app (CDP on 127.0.0.1:9222).
 * Usage: node scripts/e2e.mjs scan|play|chat|all [testMusicDir]
 */
import { readFile } from 'fs/promises'

const PORT = 9222
const testMusic = process.argv[3] ?? 'C:\\博830\\vibecoding\\nebula-player\\.devdata\\test-music'
const mode = process.argv[2] ?? 'all'

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  return res.json()
}

async function main() {
  const list = await targets()
  const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
  if (!page) throw new Error('dev page not found: ' + JSON.stringify(list.map((t) => ({ url: t.url, type: t.type }))))

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  }

  const evaluate = (expression, awaitPromise = true) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise, returnByValue: true }
        })
      )
    }).then((r) => {
      if (r.exceptionDetails) {
        throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails))
      }
      return r.result?.value
    })

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const out = {}

  if (mode === 'scan' || mode === 'all') {
    out.scan = JSON.parse(
      await evaluate(`(async () => {
        const T = ${JSON.stringify(testMusic)}
        const scanRes = await window.api.libraryScan([T])
        await window.__nebula.library.getState().load()
        const lib = await window.api.libraryGet()
        return JSON.stringify({
          scan: scanRes,
          tracks: lib.tracks.map(t => ({title: t.title, artist: t.artist, album: t.album, genre: t.genre, ext: t.ext, duration: t.duration, folderName: t.folderName, cover: !!t.coverPath}))
        })
      })()`)
    )
  }

  if (mode === 'play' || mode === 'all') {
    out.play = JSON.parse(
      await evaluate(`(async () => {
        const N = window.__nebula
        const lib = await window.api.libraryGet()
        const tracks = lib.tracks
        if (!tracks.length) return JSON.stringify({error: 'no tracks'})
        await N.player.getState().playTracks(tracks, 0)
        await new Promise(r => setTimeout(r, 1500))
        const p = N.player.getState()
        const mid = { current: p.current?.title, isPlaying: p.isPlaying, loading: p.isLoading, time: Math.round(p.currentTime), duration: Math.round(p.duration), mode: p.mode }
        p.seek(p.duration / 2)
        await new Promise(r => setTimeout(r, 600))
        const after = N.player.getState()
        p.setVolume(0.3)
        p.setMode('shuffle')
        p.next()
        await new Promise(r => setTimeout(r, 1200))
        const nxt = N.player.getState()
        p.prev()
        await new Promise(r => setTimeout(r, 800))
        const prv = N.player.getState()
        p.toggle()
        await new Promise(r => setTimeout(r, 300))
        const toggled = N.player.getState()
        p.toggle()
        return JSON.stringify({
          first: mid,
          seekTime: Math.round(after.currentTime),
          nextTitle: nxt.current?.title,
          prevTitle: prv.current?.title,
          pausedAfterToggle: !toggled.isPlaying,
          volume: after.volume,
          mode: after.mode
        })
      })()`)
    )
  }

  if (mode === 'playlists' || mode === 'all') {
    out.playlists = JSON.parse(
      await evaluate(`(async () => {
        const N = window.__nebula
        const lib = await window.api.libraryGet()
        const pl = N.playlists.getState()
        const created = pl.create('E2E测试歌单')
        pl.addTracks(created.id, lib.tracks.map(t => t.id))
        const fav1 = pl.toggleFavorite(lib.tracks[0].id)
        const fav2 = pl.toggleFavorite(lib.tracks[0].id)
        const state = N.playlists.getState()
        await new Promise(r => setTimeout(r, 600))
        return JSON.stringify({
          created: created.name,
          count: state.playlists.find(x => x.id === created.id)?.trackIds.length,
          favOn: fav1, favOff: fav2,
          favCount: state.playlists.find(x => x.builtin === 'favorites')?.trackIds.length ?? -1,
          persisted: (await window.api.playlistLoad()).playlists.length
        })
      })()`)
    )
  }

  if (mode === 'chat' || mode === 'all') {
    out.chat = JSON.parse(
      await evaluate(`(async () => {
        const C = window.__nebula.chat
        C.getState().setDraft('测试：暂停播放并介绍一下爵士乐')
        await C.getState().send()
        await new Promise(r => setTimeout(r, 5000))
        const st = C.getState()
        const last = st.messages[st.messages.length - 1]
        return JSON.stringify({ busy: st.busy, lastRole: last?.role, lastContent: (last?.content ?? '').slice(0, 80) })
      })()`)
    )
  }

  if (mode === 'ai') {
    // configure the mock endpoint then run a real chat round (tool calling)
    out.ai = JSON.parse(
      await evaluate(`(async () => {
        await window.api.settingsSetApi({ baseURL: 'http://127.0.0.1:9999/v1', model: 'mock-model', apiKey: 'sk-mock' })
        const conf = await window.api.settingsGet()
        const test = await window.api.settingsTestApi()
        const C = window.__nebula.chat
        await C.getState().load()
        C.getState().setDraft('帮我找一下歌曲并播放')
        await C.getState().send()
        await new Promise(r => setTimeout(r, 6000))
        const st = C.getState()
        const last = st.messages[st.messages.length - 1]
        return JSON.stringify({
          configured: { baseURL: conf.api.baseURL, model: conf.api.model, hasKey: conf.api.hasKey },
          testOk: test.ok,
          busy: st.busy,
          chips: last?.chips ?? [],
          lastContent: (last?.content ?? '').slice(0, 60),
          totalMessages: st.messages.length
        })
      })()`)
    )
  }

  if (mode === 'clean') {
    out.clean = JSON.parse(
      await evaluate(`(async () => {
        await window.api.settingsSetApi({ baseURL: '', model: '', apiKey: '' })
        const N = window.__nebula
        const st = N.playlists.getState()
        for (const p of st.playlists.filter(p => !p.builtin && p.name.startsWith('E2E'))) st.remove(p.id)
        N.chat.setState({ messages: [], bubbles: [] })
        await window.api.chatSave([])
        return JSON.stringify({ ok: true })
      })()`)
    )
  }

  if (mode === 'state') {
    out.state = JSON.parse(
      await evaluate(`(async () => {
        const raw = localStorage.getItem('nebula.player.state')
        const st = window.__nebula.player.getState()
        return JSON.stringify({ persisted: raw ? JSON.parse(raw) : null, current: st.current?.title ?? null, mode: st.mode, volume: st.volume })
      })()`)
    )
  }

  console.log(JSON.stringify(out, null, 2))
  ws.close()

  // cleanup created artifacts (run with mode=playlists to keep them)
  if (mode === 'all') {
    await evaluate(
      `(async () => {
        const N = window.__nebula
        const st = N.playlists.getState()
        for (const p of st.playlists.filter(p => !p.builtin && p.name.startsWith('E2E'))) st.remove(p.id)
        await window.api.chatSave([])
        N.chat.setState({ messages: [], bubbles: [] })
        return 'cleaned'
      })()`
    ).catch(() => {})
  }
  await sleep(300)
  process.exit(0)
}

main().catch((err) => {
  console.error('E2E failed:', err.message)
  process.exit(1)
})
