import { describe, expect, it } from 'vitest'
// The Admin form loads describe.ts first; this used to hit a circular import (registry ← state ← primitives).
import { describeSpec } from '../effects/describe'
import { getEffect } from '../effects/registry'

describe('module load order', () => {
  it('loading describe.ts first still gives working code effects', () => {
    expect(describeSpec([])).toBe('')
    expect(getEffect({ id: 'BR-001' })?.onResolve).toBeTypeOf('function')
  })
})
