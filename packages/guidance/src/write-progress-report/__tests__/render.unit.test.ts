import { describe, expect, it } from 'vitest';

import { renderReport } from '../render.ts';
import { RenderError } from '../RenderError.ts';
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

describe('renderReport in Confluence storage format', () => {
  it('renders lozenges, date elements, and Details as rich cell content, escaping every text', () => {
    const text: ReportTextFile = {
      sections: [
        {
          ...INVOICING,
          heading: 'Invoicing & billing',
          note: 'Waiting on **access**.',
          rows: [
            {
              details: 'Verified on our test site & <b>staging</b>.\nSoft *break*.',
              id: '#1',
              workItem: 'Export `a<b`',
            },
            {
              details:
                'Next steps:\n\n- Deploy to yours\n  - then *verify*\n- See [the guide](https://docs.example.com/g?a=1&b=2)',
              id: '#2',
              workItem: 'Export',
            },
          ],
        },
        { ...OTHER, rows: [{ details: '', id: '#3', workItem: 'Saved filters' }] },
      ],
    };

    expect(renderReport(ASSEMBLED, text, 'confluence', [])).toBe(
      [
        '<p>Last updated <time datetime="2026-11-18" /></p>',
        '<h2>Invoicing &amp; billing</h2>',
        `<p><strong>Health:</strong> ${lozenge('Yellow', 'At risk')} Waiting on <strong>access</strong>.</p>`,
        [
          '<table><tbody><tr><th>Work item</th><th>Status</th><th>Date</th><th>Details</th></tr>',
          `<tr><td>Export <code>a&lt;b</code></td><td>${lozenge('Yellow', 'Needs input')}</td>`,
          '<td>Needed by: <time datetime="2026-11-25" /></td>',
          '<td><p>Verified on our test site &amp; &lt;b&gt;staging&lt;/b&gt;. Soft <em>break</em>.</p></td></tr>',
          `<tr><td>Export</td><td>${lozenge('Green', 'Done')}</td><td>Done: <time datetime="2026-11-02" /></td>`,
          '<td><p>Next steps:</p><ul><li>Deploy to yours<ul><li>then <em>verify</em></li></ul></li>',
          '<li>See <a href="https://docs.example.com/g?a=1&amp;b=2">the guide</a></li></ul></td></tr>',
          '</tbody></table>',
        ].join(''),
        '<h2>Other work</h2>',
        `<p><strong>Health:</strong> ${lozenge('Green', 'On track')}</p>`,
        [
          '<table><tbody><tr><th>Work item</th><th>Status</th><th>Date</th><th>Details</th></tr>',
          `<tr><td>Saved filters</td><td>${lozenge('Grey', 'Planned')}</td><td>Not yet scheduled</td><td></td></tr>`,
          '</tbody></table>',
        ].join(''),
        '',
      ].join('\n'),
    );
  });

  it('renders an ordered list from its start, a loose list as paragraphs, and a hard break', () => {
    const text: ReportTextFile = {
      sections: [
        INVOICING,
        {
          ...OTHER,
          rows: [
            {
              details: '3. a\n4. b\n\n- x\n\n- y\n\n  more\n\nline one  \nline two',
              id: '#3',
              workItem: 'Saved filters',
            },
          ],
        },
      ],
    };

    expect(renderReport(ASSEMBLED, text, 'confluence', [])).toContain(
      [
        '<td>Not yet scheduled</td><td><ol start="3"><li>a</li><li>b</li></ol>',
        '<ul><li><p>x</p></li><li><p>y</p><p>more</p></li></ul>',
        '<p>line one<br />line two</p></td></tr>',
      ].join(''),
    );
  });

  it('renders the update date and the reporting period as date elements', () => {
    const rendered = renderReport(
      { ...ASSEMBLED, period: { end: '2026-11-18', start: '2026-11-01' } },
      TEXT,
      'confluence',
      [],
    );

    expect(rendered.split('\n', 1)[0]).toBe(
      '<p>Last updated <time datetime="2026-11-18" /> · Reporting period <time datetime="2026-11-01" /> to <time datetime="2026-11-18" /></p>',
    );
  });

  it('applies the link check', () => {
    const text: ReportTextFile = {
      sections: [
        INVOICING,
        {
          ...OTHER,
          rows: [{ details: 'In [the ticket](https://tracker.example/3).', id: '#3', workItem: 'Saved filters' }],
        },
      ],
    };

    expect(readProblems(() => renderReport(ASSEMBLED, text, 'confluence', ['tracker.example']))).toStrictEqual([
      'sections.1.rows.0.details: [the ticket](https://tracker.example/3): internal host tracker.example',
    ]);
  });

  it('reports every construct that the format cannot render, by place', () => {
    const text: ReportTextFile = {
      sections: [
        {
          ...INVOICING,
          rows: [
            { details: '## Next\n\nShipped.', id: '#1', workItem: 'Test account' },
            { details: '```\ncode\n```', id: '#2', workItem: '- Export' },
          ],
        },
        OTHER,
      ],
    };

    expect(readProblems(() => renderReport(ASSEMBLED, text, 'confluence', []))).toStrictEqual([
      'sections.0.rows.0.details: unsupported Markdown heading: ## Next',
      'sections.0.rows.1.workItem: unsupported Markdown list: - Export',
      'sections.0.rows.1.details: unsupported Markdown code: ```',
    ]);
  });
});

// region | Helpers

/** Returns the storage-format status macro of a lozenge. */
function lozenge(colour: string, title: string): string {
  return `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${colour}</ac:parameter><ac:parameter ac:name="title">${title}</ac:parameter></ac:structured-macro>`;
}

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
