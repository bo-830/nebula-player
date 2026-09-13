import { describe, expect, it } from 'vitest'
import {
  armMinutes,
  armQueueEnd,
  armTrackEnd,
  formatSleepRemaining,
  sleepModeLabel,
  sleepRemainingMs,
  sleepRemainingSeconds,
  sleepTickOnTime,
  shouldStopOnEnded,
  SLEEP_MINUTES,
  type SleepTimer
} from '../sleepTimer'

const minutes = (n = 15): SleepTimer => armMinutes(n, 1_000)

describe('sleep timer arming', () => {
  it('exposes the three offered durations', () => {
    expect([...SLEEP_MINUTES]).toEqual([15, 30, 60])
  })

  it('arms a countdown deadline in the future', () => {
    const t = armMinutes(30, 10_000, 'shuffle')
    expect(t.mode).toBe('minute')
    expect(t.minutes).toBe(30)
    expect(t.deadline).toBe(10_000 + 30 * 60_000)
    expect(t.startMode).toBe('shuffle')
  })

  it('floors fractional minutes and clamps junk to a 0-minute countdown', () => {
    expect(armMinutes(15.9, 0).minutes).toBe(15)
    expect(armMinutes(-5, 0, 'list')).toEqual({
      mode: 'minute',
      deadline: 0,
      minutes: 0,
      startMode: 'list'
    })
    expect(armMinutes(Number.NaN, 0).deadline).toBe(0)
  })

  it('arms the two ended-driven modes without a deadline', () => {
    expect(armTrackEnd('one')).toEqual({
      mode: 'track',
      deadline: null,
      minutes: null,
      startMode: 'one'
    })
    expect(armQueueEnd('list')).toEqual({
      mode: 'queue',
      deadline: null,
      minutes: null,
      startMode: 'list'
    })
  })
})

describe('remaining time helpers', () => {
  it('reports null for a missing timer or a non-countdown mode', () => {
    expect(sleepRemainingMs(null, 0)).toBeNull()
    expect(sleepRemainingMs(undefined, 0)).toBeNull()
    expect(sleepRemainingMs(armTrackEnd(), 0)).toBeNull()
    expect(sleepRemainingMs(armQueueEnd(), 0)).toBeNull()
  })

  it('never goes below zero', () => {
    const t = minutes(15)
    expect(sleepRemainingMs(t, 1_000 + 60_000)).toBe(14 * 60_000)
    expect(sleepRemainingMs(t, 1_000 + 20 * 60_000)).toBe(0)
  })

  it('rounds seconds up so the badge starts at the full duration', () => {
    const t = armMinutes(1, 0)
    expect(sleepRemainingSeconds(t, 0)).toBe(60)
    expect(sleepRemainingSeconds(t, 100)).toBe(60)
    expect(sleepRemainingSeconds(t, 60_000)).toBe(0)
  })

  it('formats remaining seconds for the badge', () => {
    expect(formatSleepRemaining(60)).toBe('1:00')
    expect(formatSleepRemaining(59.4)).toBe('0:59')
    expect(formatSleepRemaining(3_600)).toBe('1:00:00')
    expect(formatSleepRemaining(0)).toBe('0:00')
    expect(formatSleepRemaining(-10)).toBe('0:00')
    expect(formatSleepRemaining(Number.NaN)).toBe('0:00')
  })

  it('labels each mode and the off state', () => {
    expect(sleepModeLabel(null)).toBe('未启用')
    expect(sleepModeLabel(minutes(60))).toBe('60 分钟后暂停')
    expect(sleepModeLabel(armTrackEnd())).toBe('播完当前歌曲后暂停')
    expect(sleepModeLabel(armQueueEnd())).toBe('播完当前队列后暂停')
  })
})

describe('countdown ticking', () => {
  it('keeps counting until the deadline, then reports the expiry', () => {
    const t = minutes(15)
    const deadline = t.deadline as number
    expect(sleepTickOnTime(t, deadline - 1)).toBe(t)
    expect(sleepTickOnTime(t, deadline)).toBeNull()
    expect(sleepTickOnTime(t, deadline + 5_000)).toBeNull()
  })

  it('passes through timers without a countdown and the off state', () => {
    const track = armTrackEnd()
    expect(sleepTickOnTime(track, 9_999_999)).toBe(track)
    expect(sleepTickOnTime(null, 0)).toBeNull()
    expect(sleepTickOnTime(undefined, 0)).toBeNull()
  })
})

describe('shouldStopOnEnded', () => {
  const base = { playMode: 'list', endedIndex: 4, queueLength: 5, manual: false }

  it('plays on normally when the timer is off', () => {
    expect(shouldStopOnEnded({ ...base, sleep: null })).toBe(false)
    expect(shouldStopOnEnded({ ...base, sleep: null, playMode: 'one' })).toBe(false)
  })

  it('countdown mode never stops on a track ending', () => {
    expect(shouldStopOnEnded({ ...base, sleep: minutes(15) })).toBe(false)
    expect(shouldStopOnEnded({ ...base, sleep: minutes(15), playMode: 'one' })).toBe(false)
  })

  it('track mode stops the very first natural end, including single-track repeat', () => {
    expect(
      shouldStopOnEnded({ ...base, sleep: armTrackEnd(), endedIndex: 0, queueLength: 5 })
    ).toBe(true)
    expect(
      shouldStopOnEnded({
        ...base,
        sleep: armTrackEnd(),
        playMode: 'one',
        endedIndex: 2,
        queueLength: 5
      })
    ).toBe(true)
  })

  it('queue mode advances through the middle of the queue', () => {
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 0, queueLength: 5 })
    ).toBe(false)
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 3, queueLength: 5 })
    ).toBe(false)
  })

  it('queue mode stops at the last track — no wrap-around', () => {
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 4, queueLength: 5 })
    ).toBe(true)
  })

  it('queue mode stops on the single-track queue (no endless loop)', () => {
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 0, queueLength: 1 })
    ).toBe(true)
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 0, queueLength: 0 })
    ).toBe(true)
  })

  it('an explicit user skip wins over ended-driven modes', () => {
    expect(shouldStopOnEnded({ ...base, sleep: armTrackEnd(), manual: true })).toBe(false)
    expect(shouldStopOnEnded({ ...base, sleep: armQueueEnd(), manual: true })).toBe(false)
  })

  // F13: the former `sleepFiresOnEnded(timer, index, len)` helper was a second,
  // redundant spelling of this same rule (and therefore dead code kept alive
  // only by its own tests). Its four assertions now exercise the single
  // authority `shouldStopOnEnded` — same coverage, no extra API to keep in sync.
  it('fires for track mode at any index, and for queue mode only at the end', () => {
    // track mode: the very first natural end at any position
    expect(
      shouldStopOnEnded({ ...base, sleep: armTrackEnd(), endedIndex: 1, queueLength: 5 })
    ).toBe(true)
    // queue mode: mid-queue must keep playing
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 1, queueLength: 5 })
    ).toBe(false)
    // queue mode: the last track ends → fires
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 4, queueLength: 5 })
    ).toBe(true)
    // queue mode: a single-track queue ends → fires (no endless repeat)
    expect(
      shouldStopOnEnded({ ...base, sleep: armQueueEnd(), endedIndex: 0, queueLength: 1 })
    ).toBe(true)
  })

  it('the trigger is independent of play mode (list and shuffle both honoured)', () => {
    expect(
      shouldStopOnEnded({
        ...base,
        sleep: armQueueEnd(),
        playMode: 'shuffle',
        endedIndex: 4,
        queueLength: 5
      })
    ).toBe(true)
    expect(
      shouldStopOnEnded({
        ...base,
        sleep: armQueueEnd(),
        playMode: 'shuffle',
        endedIndex: 1,
        queueLength: 5
      })
    ).toBe(false)
  })
})
