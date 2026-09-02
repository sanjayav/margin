// The authorisation invariants.
//
// The product makes three promises in its own interface — on the Settings page,
// in the agent console, and on every proposal card. These tests are those
// promises, written down, so a well-meaning edit to the permission table cannot
// quietly withdraw one.
import { describe, it, expect } from 'vitest'
import { ROLES, ROLE_PERMISSIONS, can, ALWAYS_NEEDS_APPROVAL, type Role } from '../rbac'
import { AGENTS } from '../../agents/registry'
import { needsApproval, type Proposal } from '../../agents/kernel'

const APPROVERS: Role[] = ['owner', 'admin', 'compliance_lead']
const READ_ONLY: Role[] = ['viewer', 'auditor']

const lowRisk: Proposal = {
  id: 'p', title: 't', rationale: 'r', changes: [], risk: 'low', reversible: true, citations: [],
}

describe('roles', () => {
  it('every role in the picker has a permission set, and vice versa', () => {
    expect(ROLES.map((r) => r.id).sort()).toEqual(Object.keys(ROLE_PERMISSIONS).sort())
  })

  it('only an approver can let an agent result reach the book of record', () => {
    for (const r of ROLES.map((x) => x.id)) {
      expect(can(r, 'agent.approve')).toBe(APPROVERS.includes(r))
    }
  })

  it('an analyst can run every agent but publish nothing', () => {
    for (const a of AGENTS) expect(can('analyst', a.requires)).toBe(true)
    expect(can('analyst', 'agent.run')).toBe(true)
    expect(can('analyst', 'scenario.publish')).toBe(false)
    expect(can('analyst', 'creditbook.post')).toBe(false)
    expect(can('analyst', 'agent.approve')).toBe(false)
  })

  it('read-only roles cannot run or approve anything', () => {
    for (const r of READ_ONLY) {
      expect(can(r, 'agent.run')).toBe(false)
      expect(can(r, 'agent.approve')).toBe(false)
      for (const p of ALWAYS_NEEDS_APPROVAL) expect(can(r, p)).toBe(false)
    }
  })

  it('an auditor sees the trail; a viewer does not', () => {
    expect(can('auditor', 'audit.view')).toBe(true)
    expect(can('viewer', 'audit.view')).toBe(false)
  })

  it('only the owner holds billing', () => {
    for (const r of ROLES.map((x) => x.id)) expect(can(r, 'billing.manage')).toBe(r === 'owner')
  })
})

describe('agent autonomy', () => {
  it('no autonomy setting removes approval from a book-of-record action', () => {
    for (const perm of ALWAYS_NEEDS_APPROVAL) {
      expect(needsApproval(lowRisk, 'act', perm)).toBe(true)
      expect(needsApproval(lowRisk, 'propose', perm)).toBe(true)
      expect(needsApproval(lowRisk, 'observe', perm)).toBe(true)
    }
  })

  it('act autonomy only ever waives approval for a low-risk reversible change', () => {
    expect(needsApproval(lowRisk, 'act', 'data.edit')).toBe(false)
    expect(needsApproval({ ...lowRisk, risk: 'high' }, 'act', 'data.edit')).toBe(true)
    expect(needsApproval({ ...lowRisk, reversible: false }, 'act', 'data.edit')).toBe(true)
    // Below `act`, nothing is ever waived.
    expect(needsApproval(lowRisk, 'propose', 'data.edit')).toBe(true)
  })

  it('the pooling broker can never be raised to act — signing a pool is a contract', () => {
    const broker = AGENTS.find((a) => a.id === 'pool.broker')!
    expect(broker.maxAutonomy).toBe('propose')
    expect(ALWAYS_NEEDS_APPROVAL).toContain(broker.applyRequires)
  })

  it('every agent declares a permission to run and a stricter one to apply', () => {
    for (const a of AGENTS) {
      expect(ROLE_PERMISSIONS.owner).toContain(a.requires)
      expect(ROLE_PERMISSIONS.owner).toContain(a.applyRequires)
      // Running is always at least as available as applying.
      const canRun = ROLES.filter((r) => can(r.id, a.requires) && can(r.id, 'agent.run')).length
      const canApply = ROLES.filter((r) => can(r.id, a.applyRequires)).length
      expect(canRun).toBeGreaterThanOrEqual(canApply)
    }
  })
})
