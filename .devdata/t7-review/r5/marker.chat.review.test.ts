/** Alias witness for cfg-chatstore-nodedupe (see marker.llm). */
import { expect, it } from 'vitest'
import { MUTANT } from '../chatStore'

it('the guard-removed chatStore copy is the module under test', () => {
  console.log('[alias witness] chatStore module =', MUTANT)
  expect(MUTANT).toBe('chatStore.noDedupe')
})
