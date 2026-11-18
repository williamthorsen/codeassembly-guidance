import { describe, expect, it } from 'vitest';

import { assembleReport } from '../assemble.ts';
import type { ProgressItem } from '../schemas.ts';

describe(assembleReport, () => {
  it('assigns done, in progress, and planned from the facts that an item states', () => {
    const report = assembleReport(
      [
        makeItem({ closed: true, completed: true, id: '#1', started: false }),
        makeItem({ id: '#2', started: true }),
        makeItem({ id: '#3' }),
        makeItem({ completed: true, id: '#4' }),
      ],
      null,
    );

    expect(report.rows.map(({ id, status }) => ({ id, status }))).toStrictEqual([
      { id: '#1', status: 'done' },
      { id: '#2', status: 'in-progress' },
      { id: '#3', status: 'planned' },
      { id: '#4', status: 'planned' },
    ]);
    expect(report.counts).toStrictEqual({ done: 1, inProgress: 1, planned: 2 });
  });

  it('gives each status its glyph and label', () => {
    const report = assembleReport([makeItem({ closed: true, completed: true }), makeItem({ started: true })], null);

    expect(report.rows.map(({ glyph, label }) => `${glyph} ${label}`)).toStrictEqual(['✅ Done', '🔄 In progress']);
  });

  it('omits an item closed other than as completed', () => {
    const report = assembleReport([makeItem({ closed: true, completed: false, id: '#7' })], null);

    expect(report.rows).toStrictEqual([]);
    expect(report.omitted).toStrictEqual([{ id: '#7', reason: 'closed-not-completed' }]);
  });

  it('omits a done item completed outside the inclusive period, and keeps every open item', () => {
    const period = { end: '2026-10-31', start: '2026-10-01' };
    const report = assembleReport(
      [
        makeDone('#1', '2026-09-30'),
        makeDone('#2', '2026-10-01'),
        makeDone('#3', '2026-10-31'),
        makeDone('#4', '2026-11-01'),
        makeItem({ expectedOn: '2026-01-01', id: '#5' }),
      ],
      period,
    );

    expect(report.rows.map(({ id }) => id)).toStrictEqual(['#5', '#2', '#3']);
    expect(report.omitted).toStrictEqual([
      { id: '#1', reason: 'outside-period' },
      { id: '#4', reason: 'outside-period' },
    ]);
    expect(report.period).toStrictEqual(period);
  });

  it('keeps a done item without a completion date within a period', () => {
    const report = assembleReport([makeItem({ closed: true, completed: true, id: '#1' })], {
      end: '2026-10-31',
      start: '2026-10-01',
    });

    expect(report.rows.map(({ id }) => id)).toStrictEqual(['#1']);
  });

  it('sorts dated rows by completion or expected date, and puts undated rows after them', () => {
    const report = assembleReport(
      [
        makeItem({ id: '#1' }),
        makeItem({ expectedOn: '2026-12-01', id: '#2', started: true }),
        makeDone('#3', '2026-11-15'),
        makeItem({ completedOn: '2026-01-01', expectedOn: '2026-11-20', id: '#4' }),
        makeItem({ closed: true, completed: true, expectedOn: '2026-01-01', id: '#5' }),
      ],
      null,
    );

    expect(report.rows.map(({ date, id }) => ({ date, id }))).toStrictEqual([
      { date: '2026-11-15', id: '#3' },
      { date: 'Expected 2026-11-20', id: '#4' },
      { date: 'Expected 2026-12-01', id: '#2' },
      { date: '', id: '#5' },
      { date: '', id: '#1' },
    ]);
    expect(report.rows.map(({ dateKind }) => dateKind)).toStrictEqual([
      'completed',
      'expected',
      'expected',
      null,
      null,
    ]);
  });

  it('breaks a date tie by status, then by id compared numerically', () => {
    const report = assembleReport(
      [
        makeItem({ expectedOn: '2026-11-01', id: '#10' }),
        makeItem({ expectedOn: '2026-11-01', id: '#9' }),
        makeItem({ expectedOn: '2026-11-01', id: '#11', started: true }),
        makeDone('#12', '2026-11-01'),
      ],
      null,
    );

    expect(report.rows.map(({ id }) => id)).toStrictEqual(['#12', '#11', '#9', '#10']);
  });
});

// region | Helpers

/** Builds a done item completed on `completedOn`. */
function makeDone(id: string, completedOn: string): ProgressItem {
  return makeItem({ closed: true, completed: true, completedOn, id });
}

/** Builds an open, unstarted, undated item, overridden by `overrides`. */
function makeItem(overrides: Partial<ProgressItem> = {}): ProgressItem {
  return {
    closed: false,
    completed: false,
    completedOn: null,
    description: null,
    expectedOn: null,
    id: '#1',
    started: false,
    title: 'An item',
    url: null,
    ...overrides,
  };
}

// endregion | Helpers
