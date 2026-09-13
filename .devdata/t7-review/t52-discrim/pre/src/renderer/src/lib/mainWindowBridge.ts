import { buildChatSnapshot } from './chatProxy'
import { useChatStore } from '../stores/chatStore'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { useUiStore } from '../stores/uiStore'

/**
 * Main-window side of the mini window's proxies.
 *
 * The mini window is a separate renderer that only renders UI: playback and the
 * AI tool loop stay here, in the process that owns the stores. This module
 *   - resolves a `miniPlay` intent (track ids → Tracks) and starts playback,
 *   - applies `chatProxyCmd` commands to the chat store,
 *   - mirrors the chat run into the mini window as a bounded snapshot.
 *
 * Installed from `App.tsx`'s `useBoot()` effect; the returned teardown detaches
 * both IPC listeners and the store subscription.
 */

/** snapshot push interval: the mini window is a mirror, not a controller */
const SNAPSHOT_THROTTLE_MS = 120

export function installMainWindowBridge(): () => void {
  const offPlay = window.api.onMiniPlay(({ ids, index }) => {
    const lib = useLibraryStore.getState()
    // keep the given order, drop ids the library no longer knows
    const list = (Array.isArray(ids) ? ids : [])
      .map((id) => lib.map[id])
      .filter((t): t is NonNullable<typeof t> => !!t && !t.missing)
    if (list.length === 0) {
      useUiStore.getState().toast('这些歌曲已不在曲库中', 'info')
      return
    }
    // the clicked row may have been dropped above — clamp instead of losing the intent
    const at = Number.isFinite(index)
      ? Math.min(Math.max(0, Math.floor(index)), list.length - 1)
      : 0
    void usePlayerStore.getState().playTracks(list, at)
  })

  const offCmd = window.api.onChatProxyCmd((c) => {
    const chat = useChatStore.getState()
    switch (c.kind) {
      case 'send':
        if (chat.busy || chat.pendingConfirm) return
        chat.setDraft(c.text)
        void useChatStore.getState().send()
        return
      case 'confirm':
        void useChatStore.getState().confirm()
        return
      case 'cancel':
        void useChatStore.getState().cancel()
        return
      case 'abort':
        useChatStore.getState().abort()
        return
      case 'clear':
        useChatStore.getState().clear()
        return
    }
  })

  // ---- push the chat run to the mini window (throttled) ----
  // Leading + trailing throttle: the first change after an idle period is
  // delivered at once (so the pane reacts instantly), everything inside the
  // next SNAPSHOT_THROTTLE_MS window collapses into one trailing delivery that
  // reads the then-current state — no queue of stale snapshots, and the
  // streaming token rate (~45/s) never becomes 45 IPC sends per second.
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastPush = 0

  const deliver = (): void => {
    try {
      window.api.chatProxyState(buildChatSnapshot(useChatStore.getState()))
    } catch {
      // the mini window may be closed / mid-teardown — never break the main one
    }
  }

  const push = (): void => {
    const now = Date.now()
    if (now - lastPush >= SNAPSHOT_THROTTLE_MS) {
      lastPush = now
      deliver()
      return
    }
    if (timer !== null) return // a trailing delivery is already scheduled
    timer = setTimeout(
      () => {
        timer = null
        lastPush = Date.now()
        deliver()
      },
      SNAPSHOT_THROTTLE_MS - (now - lastPush)
    )
  }

  const offStore = useChatStore.subscribe(push)
  lastPush = Date.now()
  deliver() // seed immediately so the pane is not empty on first expand

  return () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    offStore()
    offPlay()
    offCmd()
  }
}
