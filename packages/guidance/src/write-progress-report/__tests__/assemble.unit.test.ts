import { describe, expect, it } from 'vitest';

import { assembleReport } from '../assemble.ts';
import type { ProgressItem } from '../schemas.ts';

const TODAY = '2026-11-18';

describe(assembleReport, () => {
  it('assigns needs-input, done, in progress, and planned from the facts that an item states', () => {
    const report = assembleReport(
      [
        makeItem({ id: '#1', needsInput: true, started: true }),
        makeDone('#2', '2026-11-01'),
        makeItem({ id: '#3', started: true }),
        makeItem({ id: '#4' }),
        makeItem({ completed: true, id: '#5' }),
      ],
      [],
      null,
      TODAY,
    );

    expect(readRows(report).map(({ id, label, status }) => ({ id, label, status }))).toStrictEqual([
      { id: '#1', label: 'Needs input', status: 'needs-input' },
      { id: '#2', label: 'Done', status: 'done' },
      { id: '#3', label: 'In progress', status: 'in-progress' },
      { id: '#4', label: 'Planned', status: 'planned' },
      { id: '#5', label: 'Planned', status: 'planned' },
    ]);
  });

  it('omits an item closed other than as completed', () => {
    const report = assembleReport([makeItem({ closed: true, completed: false, id: '#7' })], [], null, TODAY);

    expect(report.sections).toStrictEqual([]);
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
        makeItem({ id: '#5', targetOn: '2026-01-01' }),
      ],
      [],
      period,
      TODAY,
    );

    expect(readRows(report).map(({ id }) => id)).toStrictEqual(['#2', '#3', '#5']);
    expect(report.omitted).toStrictEqual([
      { id: '#1', reason: 'outside-period' },
      { id: '#4', reason: 'outside-period' },
    ]);
    expect(report.period).toStrictEqual(period);
  });

  it('orders a status group by its date, with undated rows last and ties in source order', () => {
    const report = assembleReport(
      [
        makeItem({ id: '#1' }),
        makeItem({ id: '#2', targetOn: '2026-12-01' }),
        makeItem({ id: '#3', targetOn: '2026-11-20' }),
        makeItem({ id: '#4' }),
        makeItem({ id: '#5', targetOn: '2026-11-20' }),
      ],
      [],
      null,
      TODAY,
    );

    expect(readRows(report).map(({ id }) => id)).toStrictEqual(['#3', '#5', '#2', '#1', '#4']);
  });

  it('labels the date cell by the kind of date that its status uses', () => {
    const report = assembleReport(
      [
        makeItem({ id: '#1', neededBy: '2026-11-25', needsInput: true, targetOn: '2026-12-01' }),
        makeDone('#2', '2026-11-02'),
        makeItem({ id: '#3', started: true, targetOn: '2026-12-01' }),
        makeItem({ id: '#4' }),
      ],
      [],
      null,
      TODAY,
    );

    expect(readRows(report).map(({ date }) => date)).toStrictEqual([
      'Needed by: 2026-11-25',
      'Done: 2026-11-02',
      'Target: 2026-12-01',
      'Not yet scheduled',
    ]);
  });

  it('marks an open row whose date precedes the report date as overdue', () => {
    const report = assembleReport(
      [
        makeItem({ id: '#1', targetOn: '2026-11-17' }),
        makeItem({ id: '#2', targetOn: TODAY }),
        makeDone('#3', '2026-11-01'),
      ],
      [],
      null,
      TODAY,
    );

    expect(readRows(report).map(({ id, overdue }) => ({ id, overdue }))).toStrictEqual([
      { id: '#3', overdue: false },
      { id: '#1', overdue: true },
      { id: '#2', overdue: false },
    ]);
  });

  it('groups declared workstreams first, then undeclared ones, then items without one, dropping empty sections', () => {
    const report = assembleReport(
      [
        makeItem({ id: '#1' }),
        makeItem({ id: '#2', workstream: 'ws-new' }),
        makeItem({ id: '#3', workstream: 'ws-b' }),
        makeItem({ id: '#4', workstream: 'ws-a' }),
      ],
      [
        { health: 'at-risk', id: 'ws-a', title: 'Alpha' },
        { id: 'ws-b', title: 'Beta' },
        { id: 'ws-empty', title: 'Empty' },
      ],
      null,
      TODAY,
    );

    expect(report.sections.map(({ rows, workstream }) => [workstream, rows.map(({ id }) => id)])).toStrictEqual([
      [{ health: 'at-risk', id: 'ws-a', title: 'Alpha' }, ['#4']],
      [{ id: 'ws-b', title: 'Beta' }, ['#3']],
      [{ id: 'ws-new', title: 'ws-new' }, ['#2']],
      [null, ['#1']],
    ]);
    expect(report.lastUpdated).toBe(TODAY);
  });
});

// region | Helpers

/** Builds an open, unstarted, undated item without a workstream, overridden by `overrides`. */
function makeItem(overrides: Partial<ProgressItem>): ProgressItem {
  return {
    closed: false,
    completed: false,
    completedOn: null,
    description: null,
    id: '#0',
    neededBy: null,
    needsInput: false,
    sources: [],
    started: false,
    targetOn: null,
    title: 'An item',
    workstream: null,
    ...overrides,
  };
}

/** Builds an item closed as completed on `completedOn`. */
function makeDone(id: string, completedOn: string): ProgressItem {
  return makeItem({ closed: true, completed: true, completedOn, id });
}

/** Returns the rows of every section in report order. */
function readRows(
  report: ReturnType<typeof assembleReport>,
): ReturnType<typeof assembleReport>['sections'][number]['rows'] {
  return report.sections.flatMap(({ rows }) => rows);
}

// endregion | Helpers
