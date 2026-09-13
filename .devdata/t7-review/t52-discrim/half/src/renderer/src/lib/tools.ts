import type { ToolResult } from '../../../shared/types'
import { searchTracks } from './search'
import { withQueueContext } from './queue'
import { getPlayStats } from './playStats'
import { buildTasteProfile, recommendTracks, tasteSummary } from './recommend'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { useUiStore } from '../stores/uiStore'

/**
 * J: the assistant has a name — 薇拉 Vela. This constant is the SINGLE source of
 * truth for it, and `buildSystemPrompt()` writes it into the persona section of
 * the system prompt; the panel titles carry the same literal (their own copy,
 * since a component file may only export components — see
 * `react-refresh/only-export-components`). `__tests__/chatConfirm.test.ts` pins
 * both copies so they cannot drift apart.
 */
export const ASSISTANT_NAME = '薇拉 Vela'

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

function tool(name: string, description: string, properties: Record<string, unknown>): ToolDef {
  return { name, description, parameters: { type: 'object', properties } }
}

function strProp(desc: string): Record<string, unknown> {
  return { type: 'string', description: desc }
}

/** OpenAI-compatible tool schemas exposed to the model. */
export const MUSIC_TOOLS: ToolDef[] = [
  tool('search_music', '在本地曲库搜索歌曲。可按歌名/歌手/专辑/曲风过滤。', {
    query: strProp('关键词，匹配歌名/歌手/专辑'),
    artist: strProp('精确匹配歌手名'),
    album: strProp('精确匹配专辑名'),
    genre: strProp('曲风关键词，如 摇滚、爵士、流行'),
    limit: { type: 'integer', description: '返回条数上限，默认 10，最大 50' }
  }),
  tool('play_tracks', '播放指定歌曲（按下限传入歌曲 id，通常先调用 search_music 获取 id）', {
    ids: {
      type: 'array',
      items: { type: 'string' },
      description: '歌曲 id 列表，按此顺序加入播放队列'
    },
    start_index: { type: 'integer', description: '从第几首开始播放，默认 0' }
  }),
  tool('control_player', '控制播放器基本操作', {
    action: {
      type: 'string',
      enum: ['play', 'pause', 'toggle', 'next', 'prev', 'stop'],
      description: '播放/暂停/切换/上一首/下一首/停止'
    }
  }),
  tool('set_volume', '设置音量（平滑过渡）', {
    volume: { type: 'number', description: '0~1 之间的数值' },
    percent: { type: 'number', description: '0~100 的音量百分比（与 volume 二选一）' }
  }),
  tool('set_play_mode', '切换播放模式', {
    mode: {
      type: 'string',
      enum: ['list', 'one', 'shuffle'],
      description: '列表循环/单曲循环/随机播放'
    }
  }),
  tool('seek', '跳转播放进度', {
    seconds: { type: 'number', description: '跳转到第几秒' },
    percent: { type: 'number', description: '0~100 的进度百分比（与 seconds 二选一）' }
  }),
  tool('get_player_state', '获取当前播放状态', {}),
  tool('get_library_summary', '获取本地曲库概况（数量/歌手/专辑/曲风分布），用于推荐与统计', {}),
  tool('list_playlists', '列出所有歌单（含收藏）', {}),
  tool('create_playlist', '创建新歌单', {
    name: { type: 'string', description: '歌单名称' }
  }),
  tool('add_to_playlist', '把歌曲加入指定歌单（歌单不存在则自动创建）', {
    playlist: { type: 'string', description: '歌单名称或 id' },
    ids: { type: 'array', items: { type: 'string' }, description: '歌曲 id 列表' }
  }),
  tool('remove_from_playlist', '把歌曲移出指定歌单', {
    playlist: { type: 'string', description: '歌单名称或 id' },
    ids: { type: 'array', items: { type: 'string' }, description: '歌曲 id 列表' }
  }),
  tool('favorite_tracks', '收藏/取消收藏歌曲', {
    ids: { type: 'array', items: { type: 'string' }, description: '歌曲 id 列表' },
    favorite: { type: 'boolean', description: 'true 收藏，false 取消收藏' }
  }),
  tool(
    'get_listening_profile',
    '获取用户听歌口味画像（常听歌手、偏好曲风、播放统计）。做个性化推荐前先调用它',
    {}
  ),
  tool('recommend_music', '基于用户口味在本地曲库推荐歌曲（本地离线计算），返回歌曲与推荐理由', {
    limit: { type: 'integer', description: '推荐条数，默认 8，最大 30' },
    play: { type: 'boolean', description: 'true 表示直接开始播放推荐结果' }
  })
]

export function toolsForLLM(): Array<{ type: 'function'; function: ToolDef }> {
  return MUSIC_TOOLS.map((t) => ({ type: 'function' as const, function: t }))
}

/**
 * Tools that destroy user data. Calling them through the model must NOT take
 * effect immediately: `executeTool` returns a needs-confirm result and the chat
 * UI asks the user first.
 *
 * Deliberately NOT destructive: create_playlist / add_to_playlist (additive,
 * used by the 「创建一个叫「夜跑」的歌单」 flow) and favorite_tracks (a single,
 * trivially reversible toggle) — they keep their previous behaviour.
 */
export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set(['remove_from_playlist'])

/** short label used by the confirmation bar / card */
export const DESTRUCTIVE_LABELS: Readonly<Record<string, string>> = {
  remove_from_playlist: '移出歌单'
}

export function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOLS.has(name)
}

const CONFIRM_TOKEN_PREFIX = 'dconf'
const CONFIRM_TOKEN_SEP = '\u0000'

function tokenPart(value: string): string {
  // token fields must not contain the separator / token prefix
  return value.split(CONFIRM_TOKEN_SEP).join('_').split('|').join('_')
}

/** mint a one-shot token that only authorises THIS tool call in THIS run */
function mintConfirmToken(deps: ConfirmDeps, name: string): string {
  return [CONFIRM_TOKEN_PREFIX, deps.runId, name, deps.toolCallId, deps.nonce]
    .map(tokenPart)
    .join(CONFIRM_TOKEN_SEP)
}

function confirmTokenMatches(token: string | undefined, deps: ConfirmDeps, name: string): boolean {
  if (!token) return false
  const parts = token.split(CONFIRM_TOKEN_SEP)
  return (
    parts.length === 5 &&
    parts[0] === CONFIRM_TOKEN_PREFIX &&
    parts[1] === tokenPart(deps.runId) &&
    parts[2] === tokenPart(name) &&
    parts[3] === tokenPart(deps.toolCallId) &&
    parts[4] === tokenPart(deps.nonce)
  )
}

export interface ConfirmDeps {
  /** identifies the current assistant turn / tool loop */
  runId: string
  /** id of the tool call awaiting confirmation */
  toolCallId: string
  /** per-run random value, so a token cannot be guessed or replayed */
  nonce: string
  /** set only after the user pressed 「确认执行」 in the chat panel */
  confirmToken?: string
}

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  return typeof v === 'string' ? v.trim() : ''
}

function idListArg(args: Record<string, unknown>, key: string): string[] {
  return (Array.isArray(args[key]) ? (args[key] as unknown[]) : []).map(String).filter(Boolean)
}

/** turn raw track ids into 《title》 so the confirmation bar is readable */
function describeTracks(ids: string[]): string {
  const map = useLibraryStore.getState().map
  const names = ids.map((id) => (map[id]?.title ? `《${map[id].title}》` : id))
  const shown = names.slice(0, 3).join('、')
  return names.length > 3 ? `${shown} 等 ${names.length} 首` : shown
}

/**
 * Human-readable summary of a destructive call, derived from the parsed
 * arguments only (nothing is resolved through the stores here, so asking for
 * confirmation cannot itself mutate state).
 *
 * J: this string is the ONLY copy the confirmation bar shows, so it stays
 * deliberately blunt — it names the target playlist and the exact count, and it
 * never softens, never jokes and never carries an emoji (the persona allows
 * emoji in casual chat only; the rule is quoted in `buildSystemPrompt`). The
 * shape is 「从歌单《名字》移除 N 首：A、B、C」.
 */
export function summarizeDestructiveTool(name: string, args: Record<string, unknown>): string {
  const label = DESTRUCTIVE_LABELS[name] ?? name
  if (name === 'remove_from_playlist') {
    const ids = idListArg(args, 'ids')
    const playlist = strArg(args, 'playlist')
    const who = playlist ? `歌单《${playlist}》` : '歌单'
    if (ids.length === 0) return `从${who}移除歌曲：未指定歌曲（数量 0），需要你确认`
    return `从${who}移除 ${ids.length} 首：${describeTracks(ids)}`
  }
  return `执行「${label}」`
}

/**
 * Destructive-tool confirmation guard: returns the "pending confirmation"
 * result when the call must not run yet (or must not run at all), or null when
 * it may proceed.
 *
 * `deps.confirmToken` only bypasses the pause when it was minted for this exact
 * run + tool call (see `mintConfirmToken`), so the model can never self-approve.
 */
function destructiveGuard(
  name: string,
  args: Record<string, unknown>,
  deps: ConfirmDeps | undefined
): ToolResult | null {
  if (!isDestructiveTool(name)) return null
  if (deps && confirmTokenMatches(deps.confirmToken, deps, name)) return null
  const summary = summarizeDestructiveTool(name, args)
  return {
    ok: false,
    needsConfirm: true,
    content:
      `等待用户确认：${summary}。该操作尚未执行，用户确认后会用同一次调用继续执行，` +
      '请不要重复调用同一个工具。',
    chip: `待确认：${summary}`,
    confirmSummary: summary,
    confirmToken: deps ? mintConfirmToken(deps, name) : undefined
  }
}

function resolvePlaylist(nameOrId: string): string | null {
  const list = usePlaylistStore.getState().playlists
  const exact = list.find((p) => p.id === nameOrId || p.name === nameOrId)
  if (exact) return exact.id
  const lower = nameOrId.toLowerCase()
  if (lower.includes('收藏')) return list.find((p) => p.builtin === 'favorites')?.id ?? null
  const fuzzy = list.find(
    (p) =>
      !p.builtin && (p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))
  )
  return fuzzy?.id ?? null
}

/**
 * execute one tool call; never throws (errors become tool results).
 *
 * `deps` carries the confirmation state of the surrounding turn: when a
 * destructive tool is hit without a token approved by the user, the result is a
 * "pending confirmation" instead of an execution.
 */
export async function executeTool(
  name: string,
  rawArgs: string,
  deps?: ConfirmDeps
): Promise<ToolResult> {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}
  } catch {
    return { ok: false, content: '参数解析失败', chip: '参数解析失败' }
  }

  const pending = destructiveGuard(name, args, deps)
  if (pending) return pending

  const fail = (msg: string): ToolResult => ({ ok: false, content: msg, chip: msg })
  const player = usePlayerStore.getState()
  const library = useLibraryStore.getState()
  const playlist = usePlaylistStore.getState()
  const ui = useUiStore.getState()

  switch (name) {
    case 'search_music': {
      const q = String(args.query ?? '').trim()
      const artist = String(args.artist ?? '').trim()
      const album = String(args.album ?? '').trim()
      const genre = String(args.genre ?? '').trim()
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 10))
      const res = searchTracks(library.tracks, { text: q, artist, album, genre }).slice(0, limit)
      const payload = res.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration
      }))
      return {
        ok: true,
        content: JSON.stringify({ count: res.length, tracks: payload }),
        chip: res.length ? `找到 ${res.length} 首相关歌曲` : '未找到相关歌曲'
      }
    }

    case 'play_tracks': {
      const ids = (Array.isArray(args.ids) ? args.ids : []).map(String)
      if (ids.length === 0) return fail('没有指定歌曲')
      const requested = ids
        .map((id) => library.map[id])
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
      if (requested.length === 0) return fail('歌曲 id 无效（可能已被移除）')
      const start = Math.min(Math.max(0, Number(args.start_index) || 0), requested.length - 1)
      // queue context: a request for one/few songs should keep playing —
      // extend with the same album, then the same artist, then the library
      const tracks = withQueueContext(requested, library.tracks)
      await player.playTracks(tracks, start)
      return {
        ok: true,
        content: `已开始播放（队列 ${tracks.length} 首），当前：${tracks[start].title} - ${tracks[start].artist}`,
        chip: `▶ ${tracks[start].title}${tracks.length > 1 ? ` · 队列 ${tracks.length} 首` : ''}`
      }
    }

    case 'control_player': {
      const action = String(args.action ?? 'toggle')
      const label: Record<string, string> = {
        play: '播放已开始',
        pause: '已暂停播放',
        toggle: '已切换播放/暂停',
        next: '已切到下一首',
        prev: '已切到上一首',
        stop: '已停止播放'
      }
      switch (action) {
        case 'play':
          await player.toggle()
          break
        case 'pause':
          if (player.isPlaying) player.toggle()
          break
        case 'toggle':
          player.toggle()
          break
        case 'next':
          player.next()
          break
        case 'prev':
          player.prev()
          break
        case 'stop':
          player.stop()
          break
        default:
          return fail(`未知操作: ${action}`)
      }
      return { ok: true, content: `执行了 ${action}`, chip: label[action] ?? action }
    }

    case 'set_volume': {
      const pct =
        args.percent !== undefined
          ? Number(args.percent)
          : args.volume !== undefined
            ? Number(args.volume) * 100
            : NaN
      if (Number.isNaN(pct) || pct < 0 || pct > 100) return fail('音量值无效（0~100）')
      player.setVolume(pct / 100)
      return {
        ok: true,
        content: `音量设置为 ${Math.round(pct)}%`,
        chip: `音量 ${Math.round(pct)}%`
      }
    }

    case 'set_play_mode': {
      const mode = String(args.mode)
      if (!['list', 'one', 'shuffle'].includes(mode)) return fail('模式无效')
      player.setMode(mode as 'list' | 'one' | 'shuffle')
      const label = mode === 'list' ? '列表循环' : mode === 'one' ? '单曲循环' : '随机播放'
      return { ok: true, content: `模式切换为 ${label}`, chip: `模式: ${label}` }
    }

    case 'seek': {
      const dur = player.duration || player.current?.duration || 0
      let target: number
      if (args.seconds !== undefined) target = Number(args.seconds)
      else if (args.percent !== undefined) target = (Number(args.percent) / 100) * dur
      else return fail('缺少跳转参数')
      if (!Number.isFinite(target) || target < 0) return fail('跳转位置无效')
      player.seek(target)
      return {
        ok: true,
        content: `跳转到 ${Math.floor(target)} 秒`,
        chip: `跳转 ${Math.floor(target)}s`
      }
    }

    case 'get_player_state': {
      const cur = player.current
      return {
        ok: true,
        content: JSON.stringify({
          current: cur ? { title: cur.title, artist: cur.artist, album: cur.album } : null,
          isPlaying: player.isPlaying,
          volume: Math.round(player.volume * 100),
          muted: player.muted,
          mode: player.mode,
          currentTime: Math.floor(player.currentTime),
          duration: Math.floor(player.duration || 0)
        }),
        chip: '已获取播放状态'
      }
    }

    case 'get_library_summary': {
      const tracks = library.tracks
      const artists = new Set(tracks.map((t) => t.artist)).size
      const albums = new Set(tracks.map((t) => t.artist + '\u0000' + t.album)).size
      const genres: Record<string, number> = {}
      for (const t of tracks) {
        for (const g of t.genre.split('/')) {
          const k = g.trim()
          if (k && k !== '未知') genres[k] = (genres[k] ?? 0) + 1
        }
      }
      const topGenres = Object.entries(genres)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k, v]) => ({ genre: k, count: v }))
      return {
        ok: true,
        content: JSON.stringify({ total: tracks.length, artists, albums, topGenres }),
        chip: `曲库共 ${tracks.length} 首`
      }
    }

    case 'list_playlists': {
      return {
        ok: true,
        content: JSON.stringify(
          playlist.playlists.map((p) => ({
            id: p.id,
            name: p.name,
            count: p.trackIds.length,
            builtin: !!p.builtin
          }))
        ),
        chip: `共 ${playlist.playlists.length} 个歌单`
      }
    }

    case 'create_playlist': {
      const name = String(args.name ?? '').trim()
      if (!name) return fail('歌单名称为空')
      const p = playlist.create(name)
      ui.toast(`歌单「${p.name}」已创建`, 'success')
      return {
        ok: true,
        content: `已创建歌单 ${p.name} (id=${p.id})`,
        chip: `✓ 歌单「${p.name}」已创建`
      }
    }

    case 'add_to_playlist': {
      const nameOrId = String(args.playlist ?? '').trim()
      const ids = (Array.isArray(args.ids) ? args.ids : []).map(String)
      if (!nameOrId) return fail('未指定歌单')
      if (ids.length === 0) return fail('未指定歌曲')
      let pid = resolvePlaylist(nameOrId)
      if (!pid) {
        const p = playlist.create(nameOrId)
        pid = p.id
      }
      const added = playlist.addTracks(pid, ids)
      const pname = playlist.playlists.find((p) => p.id === pid)?.name ?? nameOrId
      return {
        ok: true,
        content: `向歌单 ${pname} 添加了 ${added} 首歌曲 (id=${pid})`,
        chip: `✓ 已加入「${pname}」${added} 首`
      }
    }

    case 'remove_from_playlist': {
      const nameOrId = strArg(args, 'playlist')
      const ids = idListArg(args, 'ids')
      const pid = resolvePlaylist(nameOrId)
      if (!pid) return fail('歌单不存在: ' + nameOrId)
      playlist.removeTracks(pid, ids)
      const pname = playlist.playlists.find((p) => p.id === pid)?.name ?? nameOrId
      return {
        ok: true,
        content: `从 ${pname} 移除了 ${ids.length} 首`,
        chip: `✓ 已移出「${pname}」${ids.length} 首`
      }
    }

    case 'favorite_tracks': {
      const ids = (Array.isArray(args.ids) ? args.ids : []).map(String)
      const favorite = args.favorite !== false
      if (ids.length === 0) return fail('未指定歌曲')
      let n = 0
      for (const id of ids) {
        const cur = playlist.isFavorite(id)
        if (favorite && !cur) {
          playlist.toggleFavorite(id)
          n++
        } else if (!favorite && cur) {
          playlist.toggleFavorite(id)
          n++
        }
      }
      return {
        ok: true,
        content: favorite ? `已收藏 ${n} 首` : `已取消收藏 ${n} 首`,
        chip: favorite ? `♥ 已收藏 ${n} 首` : `已取消收藏 ${n} 首`
      }
    }

    case 'get_listening_profile': {
      const stats = getPlayStats()
      const profile = buildTasteProfile(library.tracks, stats)
      return {
        ok: true,
        content: JSON.stringify({
          totalPlays: profile.totalPlays,
          topArtists: profile.topArtists
            .slice(0, 10)
            .map((a) => ({ name: a.name, plays: a.plays })),
          topGenres: profile.topGenres.slice(0, 10),
          recentlyPlayed: profile.recentIds
            .slice(0, 10)
            .map((id) => library.map[id]?.title)
            .filter(Boolean)
        }),
        chip:
          profile.totalPlays > 0
            ? `口味画像：${profile.topArtists[0]?.name ?? '—'} 等`
            : '暂无播放记录'
      }
    }

    case 'recommend_music': {
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 8))
      const stats = getPlayStats()
      const profile = buildTasteProfile(library.tracks, stats)
      const recs = recommendTracks(library.tracks, stats, limit)
      if (recs.length === 0) return fail('曲库里还没有可推荐的歌曲')
      if (args.play === true) {
        const tracks = recs.map((r) => r.track)
        await player.playTracks(tracks, 0)
      }
      return {
        ok: true,
        content: JSON.stringify({
          profile: tasteSummary(profile),
          playing: args.play === true,
          recommendations: recs.map((r) => ({
            id: r.track.id,
            title: r.track.title,
            artist: r.track.artist,
            album: r.track.album,
            genre: r.track.genre,
            reason: r.reason
          }))
        }),
        chip: args.play === true ? `▶ 播放推荐 ${recs.length} 首` : `为你推荐 ${recs.length} 首`
      }
    }

    default:
      return fail(`未知工具: ${name}`)
  }
}

export function buildSystemPrompt(): string {
  const player = usePlayerStore.getState()
  const library = useLibraryStore.getState()
  const playlist = usePlaylistStore.getState()
  const cur = player.current
  const modeLabel =
    player.mode === 'list' ? '列表循环' : player.mode === 'one' ? '单曲循环' : '随机播放'
  const playing = cur
    ? `正在播放《${cur.title}》- ${cur.artist}（第 ${Math.floor(player.currentTime)}s / ${Math.floor(player.duration || cur.duration)}s）`
    : '当前未播放歌曲'
  const profile = buildTasteProfile(library.tracks, getPlayStats())
  return [
    `你是「${ASSISTANT_NAME}」，是「NEBULA Player」内置的 AI 音乐助手，也是用户本地曲库的星舰领航员。`,
    `当前状态：${playing}；音量 ${Math.round(player.volume * 100)}%（${player.muted ? '静音' : '正常'}）；播放模式 ${modeLabel}；`,
    `本地曲库：共 ${library.tracks.length} 首歌曲、${new Set(library.tracks.map((t) => t.artist)).size} 位歌手、${new Set(library.tracks.map((t) => t.artist + '|' + t.album)).size} 张专辑；共 ${playlist.playlists.length} 个歌单。`,
    `用户听歌口味：${tasteSummary(profile)}`,
    '',
    '人格与口吻：',
    `- 自称「我」，称用户「你」，全篇简体中文；不要用「主人」「亲爱的」这类称呼。`,
    '- 执行用户的指令时，你是星舰领航员：短句、先给结论、不寒暄。',
    '- 推荐歌曲或闲聊时，你是深夜电台 DJ：温和、有见地，可以卖萌、可以用 emoji（仅此类回复，单条最多 1–2 个）。',
    '- 破坏性操作必须直白，禁止软化、禁止卖萌、禁止 emoji。',
    '- 不承诺做不到的事。',
    '',
    '规则：',
    '1. 用户的播放/曲库操作（播放、暂停、切歌、音量、模式、歌单、收藏、搜索）必须通过工具完成，不要虚构结果。执行类指令只回一句结果：先给结论，不寒暄——例如「已暂停。下一首是《X》」。',
    '2. 播放具体歌曲：先 search_music 找到 id，再 play_tracks，不要猜测歌曲存在。',
    '3. 个性化推荐：先调用 recommend_music（必要时先 get_listening_profile 了解口味），结合返回的推荐理由说明为什么推荐；用户要求直接播放时才传 play=true，或对推荐结果调用 play_tracks。',
    '4. 音乐知识、科普、乐评、闲聊类问题直接回答，可以用温和有见地的口吻展开，也可以用 emoji（单条最多 1–2 个），内容用清晰的 Markdown 排版。',
    '5. 删除类操作（把歌曲移出歌单、删除歌单、清空列表等破坏性操作）必须直白说明影响范围并等用户确认：收到「等待用户确认」的工具结果时，用一句不加修饰的话说明将要删除的对象和数量，请用户在聊天框确认或取消，禁止软化、禁止卖萌、禁止 emoji，不要重复调用同一个工具；用户确认后系统会继续，用户取消时不要重试。',
    '6. 失败与能力边界：一句话说明原因，再加一句指路（去「设置 → AI 配置」检查接口地址/模型/API Key，或提示稍后再试）；曲库里没有的歌就直说没有，并给出最接近的 3 首替代；不要卖惨，不要道歉超过一句，不要承诺做不到的事。',
    '7. 一律使用简体中文回复；工具执行类回复只有一句结论，推荐与闲聊类回复可充分展开。'
  ].join('\n')
}
