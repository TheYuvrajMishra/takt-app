// DB-level tests for the atomic split persist helpers (src/lib/db.ts).
// Uses a recording expo-sqlite stub so the SQL, parameter order and the
// single-transaction grouping are asserted — the store tests mock sqlite
// with no-ops and can never validate these.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({ run: [] as unknown[][], tx: 0 }));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getAllAsync: vi.fn(async () => []),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async (...args: unknown[]) => {
      calls.run.push(args);
      return { changes: 1, lastInsertRowId: 0 };
    }),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => {
      calls.tx += 1;
      await task();
    }),
  })),
}));

import { saveTemplateWithCompletionRekey, rekeyCompletions } from '../db';
import type { RoutineTemplate } from '../../types';

beforeEach(() => {
  calls.run.length = 0;
  calls.tx = 0;
});

const template: RoutineTemplate = {
  id: 'tpl-1',
  name: 'My routine',
  effectiveFrom: '2026-11-09',
  blocks: [],
};

describe('saveTemplateWithCompletionRekey', () => {
  it('writes the template upsert + targeted UPDATEs in one transaction', async () => {
    await saveTemplateWithCompletionRekey(template, [
      { oldBlockId: 'a', newBlockId: 'r1', date: '2026-11-09' },
      { oldBlockId: 'a', newBlockId: 'r1', date: '2026-11-11' },
    ]);

    expect(calls.tx).toBe(1);
    expect(calls.run).toHaveLength(3);
    expect(String(calls.run[0][0])).toMatch(/INSERT INTO templates/);
    expect(calls.run[0].slice(1)).toEqual([
      'tpl-1',
      'My routine',
      '2026-11-09',
      '[]',
    ]);
    expect(String(calls.run[1][0])).toMatch(/UPDATE completions SET block_id/);
    expect(calls.run[1].slice(1)).toEqual(['r1', 'a', '2026-11-09']);
    expect(calls.run[2].slice(1)).toEqual(['r1', 'a', '2026-11-11']);
  });

  it('with no rekeys it still saves the template in one transaction', async () => {
    await saveTemplateWithCompletionRekey(template, []);
    expect(calls.tx).toBe(1);
    expect(calls.run).toHaveLength(1);
  });

  it('re-keys day overrides in the same transaction', async () => {
    const blocks = [
      { id: 'r1', categoryId: 'cat-workout', title: 'Run', startMin: 500, durationMin: 30 },
    ];
    await saveTemplateWithCompletionRekey(template, [], [
      { date: '2026-11-09', blocks },
    ]);
    expect(calls.tx).toBe(1);
    expect(calls.run).toHaveLength(2);
    expect(String(calls.run[1][0])).toMatch(/INSERT INTO day_overrides/);
    expect(calls.run[1].slice(1)).toEqual(['2026-11-09', JSON.stringify(blocks)]);
  });
});

describe('rekeyCompletions', () => {
  it('issues one targeted UPDATE per rekey in one transaction', async () => {
    await rekeyCompletions([
      { oldBlockId: 'a', newBlockId: 'r1', date: '2026-11-09' },
    ]);
    expect(calls.tx).toBe(1);
    expect(calls.run).toHaveLength(1);
    expect(calls.run[0].slice(1)).toEqual(['r1', 'a', '2026-11-09']);
  });

  it('no-ops without touching the db when empty', async () => {
    await rekeyCompletions([]);
    expect(calls.tx).toBe(0);
    expect(calls.run).toHaveLength(0);
  });
});
