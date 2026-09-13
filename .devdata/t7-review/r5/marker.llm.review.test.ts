/**
 * Alias witness: proves cfg-llm-revert.config.ts really redirects the production
 * specifier `'../llmClient'` to the reverted scratch copy. Only the mutant file
 * carries the `MUTANT` export, so this fails (or fails to resolve) whenever the
 * redirection silently stops working.
 */
import { expect, it } from 'vitest'
import { MUTANT } from '../llmClient'

it('the reverted llmClient copy is the module under test', () => {
  console.log('[alias witness] llmClient module =', MUTANT)
  expect(MUTANT).toBe('llmClient.revert')
})
