import { describe, expect, it } from 'vitest'
import { formatDuration, formatTime } from '../format'

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(600)).toBe('10:00')
  })
  it('formats hours', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3661)).toBe('1:01:01')
  })
  it('handles invalid input', () => {
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(-3)).toBe('0:00')
  })
})

describe('formatDuration', () => {
  it('summarizes durations', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(90)).toBe('1 分钟')
    expect(formatDuration(3600)).toBe('1 小时 0 分')
    expect(formatDuration(7200 + 1800)).toBe('2 小时 30 分')
  })
})
