/** Alias witness for cfg-mini-alwaysclaim / cfg-mini-alwayspaint (see marker.llm). */
import { expect, it } from 'vitest'
import { MUTANT } from '../miniLyricsDedup'

it('the weakened miniLyricsDedup copy is the module under test', () => {
  console.log('[alias witness] miniLyricsDedup module =', MUTANT)
  expect(MUTANT === 'miniLyricsDedup.alwaysClaim' || MUTANT === 'miniLyricsDedup.alwaysPaint').toBe(
    true
  )
})
