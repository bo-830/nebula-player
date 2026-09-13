/** Alias witness for cfg-sleep-noone / cfg-sleep-invert (see marker.llm). */
import { expect, it } from 'vitest'
import { MUTANT } from '../sleepTimer'

it('the reverted sleepTimer copy is the module under test', () => {
  console.log('[alias witness] sleepTimer module =', MUTANT)
  expect(MUTANT === 'sleepTimer.noOne' || MUTANT === 'sleepTimer.invertOne').toBe(true)
})
