/** Per-track play statistics persisted in localStorage (count / last-played). */

export interface PlayStat {
  count: number
  last: number
}

const KEY = 'nebula.playstats'

export function getPlayStats(): Record<string, PlayStat> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, PlayStat>) : {}
  } catch {
    return {}
  }
}

export function bumpPlayStat(id: string): void {
  try {
    const map = getPlayStats()
    const cur = map[id] ?? { count: 0, last: 0 }
    cur.count++
    cur.last = Date.now()
    map[id] = cur
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // storage unavailable — ignore
  }
}
