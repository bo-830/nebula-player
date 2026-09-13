/** shadow-only stand-in for the refactored shared helper (WRONG/right sign per case) */
export function activeTime(time: number, offset: number): number {
  return time + 0.12 - offset
}
