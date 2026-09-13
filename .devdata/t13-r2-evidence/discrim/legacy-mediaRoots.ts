/**
 * t41 (R1 判別性) — **忠实还原"修复前"的 mediaRoots 语义**，用于**直接演示**单元不变量的判別力。
 *
 * 这不是产品代码，只存在于证据目录，且**不参与仓库门禁**（仓库 vitest include 只收 src 目录下的 test 文件，
 * 本目录的用例需用本目录的 `vitest.config.ts` 显式运行）。
 *
 * 还原的两处缺陷（对应 t33/t40 修掉的两条不变量）：
 *   ① **布尔闩锁在 await 之前置位** ⇒ 首个调用之后的并发调用者读到**空集合**（冷启动 403 窗口）。
 *   ② **write-once**：`refresh()` 是空操作 ⇒ 同会话内新扫描的目录永不可服务（重启前 403）。
 *
 * 除这两处外，其余（静态根、库目录收集、`resolve` 归一化、静态根懒求值、库不可读回退）
 * 与现行 `src/main/mediaRoots.ts` **逐字相同**，以保证对照只差"被考察的那两处"。
 */
import { dirname, resolve } from 'path'

export interface MediaRootsOptions {
  staticRoots: () => Array<string | null | undefined>
  readLibrary: () => Promise<unknown>
}

export interface MediaRoots {
  current: () => string[]
  get: () => Promise<string[]>
  set: (roots: Array<string | null | undefined>) => void
  refresh: () => Promise<string[]>
}

function toAbsolute(roots: Array<string | null | undefined>): string[] {
  return roots.filter((r): r is string => typeof r === 'string' && r.length > 0).map((r) => resolve(r))
}

export function createMediaRoots(options: MediaRootsOptions): MediaRoots {
  let allowed: string[] = []
  /** ← 缺陷 ①：布尔闩锁（而不是缓存 Promise），且在任何 await 之前置位 */
  let populated = false

  const populate = async (): Promise<string[]> => {
    const roots = new Set<string>(toAbsolute(options.staticRoots()))
    try {
      const parsed = await options.readLibrary()
      const tracks = parsed as Array<{ path?: unknown; coverPath?: unknown }>
      for (const t of tracks) {
        if (typeof t.path === 'string' && t.path) roots.add(resolve(dirname(t.path)))
        if (typeof t.coverPath === 'string' && t.coverPath) roots.add(resolve(dirname(t.coverPath)))
      }
    } catch {
      // no library yet → only the static roots are servable
    }
    return Array.from(roots)
  }

  const get = async (): Promise<string[]> => {
    if (populated) return allowed // ← 并发调用者在这里拿到的是**空集合**
    populated = true // ← 闩锁先置位，再 await（缺陷本体）
    allowed = await populate()
    return allowed
  }

  const set = (roots: Array<string | null | undefined>): void => {
    allowed = toAbsolute(roots)
  }

  /** ← 缺陷 ②：write-once —— refresh 不重新派生（`setMediaRoots` 之外无刷新路径） */
  const refresh = async (): Promise<string[]> => allowed

  return { current: () => allowed, get, set, refresh }
}
