import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  InitializeLocalWorkspaceInputSchema,
  LocalWorkspaceStatusSchema,
} from './workspace.js';

describe('local workspace contracts', () => {
  it('distinguishes setup from a ready server-selected identity', () => {
    expect(
      Value.Check(LocalWorkspaceStatusSchema, {
        mode: 'local',
        state: 'SETUP_REQUIRED',
      }),
    ).toBe(true);
    expect(
      Value.Check(LocalWorkspaceStatusSchema, {
        mode: 'local',
        state: 'READY',
        candidate: {
          id: 'personal',
          createdAt: '2026-11-03T00:00:00.000Z',
          updatedAt: '2026-11-03T00:00:00.000Z',
        },
      }),
    ).toBe(true);
    expect(
      Value.Check(LocalWorkspaceStatusSchema, {
        mode: 'local',
        state: 'READY',
      }),
    ).toBe(false);
  });
  it('never accepts browser-selected identity or extra setup fields', () => {
    expect(Value.Check(InitializeLocalWorkspaceInputSchema, {})).toBe(true);
    for (const value of [
      { candidateId: 'another' },
      { name: 'someone' },
      null,
      [],
    ])
      expect(Value.Check(InitializeLocalWorkspaceInputSchema, value)).toBe(
        false,
      );
  });
  it('rejects malformed ready timestamps and extra response fields', () => {
    const candidate = {
      id: 'personal',
      createdAt: 'invalid',
      updatedAt: '2026-11-03T00:00:00.000Z',
    };
    expect(
      Value.Check(LocalWorkspaceStatusSchema, {
        mode: 'local',
        state: 'READY',
        candidate,
      }),
    ).toBe(false);
    expect(
      Value.Check(LocalWorkspaceStatusSchema, {
        mode: 'local',
        state: 'SETUP_REQUIRED',
        candidateId: 'hidden',
      }),
    ).toBe(false);
  });
});
