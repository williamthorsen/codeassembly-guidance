import { describe, expect, it } from 'vitest';

import { RenderError, renderReport } from '../render.ts';
import type { AssembledResult, ReportTextFile } from '../schemas.ts';

const ASSEMBLED: AssembledResult = {
  lastUpdated: '2026-11-18',
  ok: true,
  period: null,
  sections: [
    {
      rows: [
        { date: 'Needed by: 2026-11-25', dateOn: '2026-11-25', id: '#1', label: 'Needs input', status: 'needs-input' },
        { date: 'Done: 2026-11-02', dateOn: '2026-11-02', id: '#2', label: 'Done', status: 'done' },
      ],
      workstream: { health: 'at-risk', id: 'ws-a', note: 'Waiting on access.', title: 'Alpha' },
    },
    {
      rows: [{ date: 'Not yet scheduled', dateOn: null, id: '#3', label: 'Planned', status: 'planned' }],
      workstream: null,
    },
  ],
};

const INVOICING: ReportTextFile['sections'][number] = {
  heading: 'Invoicing',
  rows: [
    { details: 'Approve the test account.', id: '#1', workItem: 'Test account' },
    {
      details:
        'Verified on our test site.\n\nNext steps:\n\n- Deploy to yours\n- See [the guide](https://docs.example.com/guide)',
      id: '#2',
      workItem: 'Export | spreadsheet',
    },
  ],
  workstream: 'ws-a',
};

const OTHER: ReportTextFile['sections'][number] = {
  heading: 'Other work',
  health: 'on-track',
  rows: [{ details: 'Scheduled after the export.', id: '#3', workItem: 'Saved filters' }],
  workstream: null,
};

const TEXT: ReportTextFile = { sections: [INVOICING, OTHER] };

describe(renderReport, () => {
  it('renders each section with its heading, health, and table, taking statuses and dates from the assembled report', () => {
    expect(renderReport(ASSEMBLED, TEXT, 'markdown', [])).toBe(
      [
        'Last updated 2026-11-18',
        '',
        '## Invoicing',
        '',
        '**Health:** 🟠 At risk: Waiting on access.',
        '',
        '| Work item | Status | Date | Details |',
        '| --- | --- | --- | --- |',
        '| Test account | 🙋 Needs input | Needed by: 2026-11-25 | Approve the test account. |',
        String.raw`| Export \| spreadsheet | ✅ Done | Done: 2026-11-02 | Verified on our test site.<br><br>Next steps:<ul><li>Deploy to yours</li><li>See [the guide](https://docs.example.com/guide)</li></ul> |`,
        '',
        '## Other work',
        '',
        '**Health:** 🟢 On track',
        '',
        '| Work item | Status | Date | Details |',
        '| --- | --- | --- | --- |',
        '| Saved filters | 🗓️ Planned | Not yet scheduled | Scheduled after the export. |',
        '',
      ].join('\n'),
    );
  });

  it('states the reporting period beside the update date', () => {
    const rendered = renderReport(
      { ...ASSEMBLED, period: { end: '2026-11-18', start: '2026-11-01' } },
      TEXT,
      'markdown',
      [],
    );

    expect(rendered.split('\n', 1)[0]).toBe('Last updated 2026-11-18 · Reporting period 2026-11-01 to 2026-11-18');
  });

  it('reports every missing or extra section and row, and every health problem, at once', () => {
    const text: ReportTextFile = {
      sections: [
        { ...INVOICING, health: 'on-track', rows: [{ details: '', id: '#9', workItem: 'Stray' }] },
        { ...OTHER, health: undefined },
        { heading: 'Gone', rows: [], workstream: 'ws-gone' },
      ],
    };

    expect(readProblems(() => renderReport(ASSEMBLED, text, 'markdown', []))).toStrictEqual([
      'sections.2: the report does not have a section for the workstream ws-gone',
      'sections.0.health: "on-track" contradicts the declared "at-risk"',
      'sections.0.rows.0: the section does not have the item #9',
      'sections.0.rows: the text does not have the item #1',
      'sections.0.rows: the text does not have the item #2',
      "sections.1.health: required, because the source does not declare the workstream's health",
    ]);
  });

  it('renders a list that directly follows a line of text as a list', () => {
    const text: ReportTextFile = {
      sections: [
        {
          ...INVOICING,
          rows: [
            { details: 'We need two things:\n- access to the test account\n- a contact', id: '#1', workItem: 'Access' },
            ...INVOICING.rows.slice(1),
          ],
        },
        OTHER,
      ],
    };

    expect(renderReport(ASSEMBLED, text, 'markdown', [])).toContain(
      '| We need two things:<ul><li>access to the test account</li><li>a contact</li></ul> |',
    );
  });

  it('reports a repeated section and a repeated row, naming both places', () => {
    const text: ReportTextFile = {
      sections: [
        { ...INVOICING, rows: [...INVOICING.rows, { details: 'Again.', id: '#1', workItem: 'Again' }] },
        OTHER,
        OTHER,
      ],
    };

    expect(readProblems(() => renderReport(ASSEMBLED, text, 'markdown', []))).toStrictEqual([
      'sections.2: repeats the section for the items without a workstream of sections.1',
      'sections.0.rows.2: repeats the item #1 of sections.0.rows.0',
    ]);
  });

  it('rejects a link to an internal host, naming where it is', () => {
    const text: ReportTextFile = {
      sections: [
        INVOICING,
        {
          ...OTHER,
          rows: [
            { details: 'Tracked in [the ticket](https://tracker.example/3).', id: '#3', workItem: 'Saved filters' },
          ],
        },
      ],
    };

    expect(readProblems(() => renderReport(ASSEMBLED, text, 'markdown', ['tracker.example']))).toStrictEqual([
      'sections.1.rows.0.details: [the ticket](https://tracker.example/3): internal host tracker.example',
    ]);
  });
});

// region | Helpers

/** Returns the problems of the `RenderError` that `render` throws. */
function readProblems(render: () => unknown): readonly string[] {
  try {
    render();
  } catch (error) {
    if (error instanceof RenderError) return error.problems;
    throw error;
  }
  throw new Error('expected a RenderError');
}

// endregion | Helpers
