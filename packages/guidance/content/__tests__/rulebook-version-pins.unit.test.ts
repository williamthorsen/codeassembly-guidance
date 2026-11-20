import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { type ResolvedRulebook, resolveEveryRulebook } from '../test-utils/resolve-every-rulebook.ts';
import { listRuleSections } from '../test-utils/rule-markers.ts';

// A rulebook's version names the guidance that an agent has loaded, so a body that changes without a bump reports one
// version for two different bodies. The include expansion makes the gap invisible: Editing a partial changes the
// deployed body of every rulebook that includes it without touching any rulebook file.
//
// The pins below force an author to check the version. A body edit fails this suite until the author decides which
// of the two remedies applies, and the failure message states both.

/** A phrase of `_partials/prose-line-breaks.md` that `commit-conventions` contains only by including the partial. */
const INCLUDED_PARTIAL_MARKER = '**No hard line breaks.**';

/** A rule's section text and the sweep version declared by its marker. */
interface DeclaredRule {
  readonly text: string;
  readonly version: string | undefined;
}

interface RulebookPin {
  readonly bodyHash: string;
  readonly version: string;
}

interface RulePin {
  readonly sectionHash: string;
  readonly version: string;
}

/** The version that each rulebook declares, and the deployed body against which that version is pinned. */
const PINS = new Map<string, RulebookPin>([
  [
    'accessibility-conventions',
    { bodyHash: '4c92659be0d9a00323c2827e3ca7eedd2311f2e82525e2153c58456b5fe39280', version: '6' },
  ],
  ['cli-conventions', { bodyHash: '5b1f6c171be28b86b8f61d1ea798be8a232117ecec80ba7f5db83ca7844475e4', version: '6' }],
  [
    'codeassembly-content-specification',
    { bodyHash: '3fe193b63127779ef8ae5b44e1a6057007194bb73621583fc6bfe076a76dcbe2', version: '33' },
  ],
  [
    'command-output-conventions',
    { bodyHash: 'b3e250da29b3c3d871e76cfe9a32f7a404c077c519c2a85c0b43a95065674186', version: '1' },
  ],
  [
    'commit-conventions',
    { bodyHash: '0a5c79ab85f65578b70ea0478dc0c1c7dffcace75b705ab8dc1483261d8884ef', version: '11' },
  ],
  [
    'cross-repo-migration-conventions',
    { bodyHash: '9eab023c28413012d9e4269020752e25486c7bf087b957a913b34701b53681a3', version: '1' },
  ],
  [
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: 'ad0fa613f442d74ee090f79552e2738e88c5f466173e30ffc3962f20a8559b87', version: '4' },
  ],
  [
    'machine-readable-output-conventions',
    { bodyHash: 'c91d198f0b2eb16a91d8cbe04b87b3a46d239a5ff399e33a811a90ed372aed63', version: '2' },
  ],
  [
    'readme-conventions',
    { bodyHash: '18738eff1711738619e5518484062dcbe3bfe75be8f54071901931eb7e1fbd65', version: '2' },
  ],
  [
    'shared-data-conventions',
    { bodyHash: '7449ca4df9f95cbba6ba573d8ffc9cae98fdce0399f51bbf85b7c0a9ccd4b14b', version: '2' },
  ],
  ['shell-conventions', { bodyHash: '59c0361c59977741a30b72f9d6b5203314cc939909d930a21e0da037f39da900', version: '6' }],
  [
    'ui-copy-conventions',
    { bodyHash: '4e1b90099baf892d0e305be30103b3de4c52b40b9aed1647bcae59003cc245d6', version: '4' },
  ],
  [
    'visual-design-conventions',
    { bodyHash: '5438c85169699f604c64c77496036c99d3fc66f022fee2079b5115f2fd3d4494', version: '2' },
  ],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: 'f8fcc4e941d25f6f66224201d7cf82ca1cc953b2164cc8ff859f6cb3b36412de', version: '7' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: '9eb7d37af8fcce51dcc4f206d3a92de7be3139fcd0d138ff50202f325985e473', version: '19' },
  ],
  [
    'williamthorsen-comment-preferences',
    { bodyHash: 'bf4d7b051fb0ebd70dc1e71a5d4897f592357a6c235793d32ac17dd3a0231988', version: '4' },
  ],
  [
    'williamthorsen-subagent-model-preferences',
    { bodyHash: '65d4576cb005121c93ae403f47c5c79828119b23abfb1062c21a76c8d43170ae', version: '1' },
  ],
  [
    'williamthorsen-ticketing-preferences',
    { bodyHash: '187c2dfc550410bf15fd28502ace9129f9ed03da78c611a3aa188da541a16d4d', version: '10' },
  ],
  [
    'williamthorsen-tooling-preferences',
    { bodyHash: 'c37a22e39ca01dce11f5d4ecfea9c46471cc0e912d6cd9d638f3c7f17d5b2fa3', version: '4' },
  ],
  [
    'williamthorsen-typescript-preferences',
    { bodyHash: 'fcbeb0b5f694a7d5fda73a306ef9be96fb33884311ba9b4803206ee41cdd663d', version: '5' },
  ],
  [
    'williamthorsen-visual-design-preferences',
    { bodyHash: 'd98fc2f9317e46eea72003906c490f808515d417de2641d929f13ac5fe062739', version: '1' },
  ],
  [
    'williamthorsen-workflow-preferences',
    { bodyHash: '481da5950be0cc17e201cc9fb430741b1e602d63c2d3781d2564a6446fde5ca1', version: '14' },
  ],
  [
    'williamthorsen-writing-preferences',
    { bodyHash: '68d20fffd276c5485e3eafad4a83336d5dd981bb67e6291d5a531eb8dcc1e818', version: '14' },
  ],
]);

// A rule's marker declares a sweep version, which rises only when the rule becomes stricter. Each rule's section is
// pinned against that version, so that a section edit fails this suite until the author decides whether the rule's
// version rises, a decision separate from whether the rulebook's does.

/**
 * The sweep version that each rule's marker declares, and the section against which that version is pinned. A rule
 * declared by the plain-speech calibration does not have a pin here, since the calibration is not included in any
 * rulebook: `plain-speech-calibration.unit.test.ts` pins the calibration's whole text instead.
 */
const RULE_PINS = new Map<string, RulePin>([
  ['apostrophes', { sectionHash: '4345dcdb7b231d4f8ebd404d0a807a97b40bf96cd40387209bc6c2ed1af74f5f', version: '1' }],
  [
    'capitalization-after-colon',
    { sectionHash: '58ec61bdaea1ae6d2b092c93749893447830b2e09796e127cfcac17164a297d4', version: '1' },
  ],
  [
    'doc-descriptions',
    { sectionHash: 'dab4ed9fc5c11d9c4d240bd4aa9df47a199daffa298817a3ac70b109588d10b9', version: '1' },
  ],
  ['em-dash', { sectionHash: '2e81d75a4b2d0580112f983636b45376cf65243c4340b8d8769eefad69247ec2', version: '1' }],
  [
    'inline-comments',
    { sectionHash: 'b99006eae56846bd994efc6ae21fb163ac4dcf4b3b50bb1322f734520b3a98d0', version: '1' },
  ],
  ['line-wrapping', { sectionHash: '6cb583e22c0a9310f995e204516a15b7a06b0dd3edf6c5f386b6498727434fff', version: '1' }],
  [
    'reduced-object-relative',
    { sectionHash: '2210b89d0bb0a88594da2c41fa0d8a5b0cf925f19a7f5fbb617b3746d29e60e6', version: '1' },
  ],
  ['second-person', { sectionHash: 'dc33c8565c0e7ff5620be152e816b9605f06c930590bb23e1a2139dd06e45305', version: '1' }],
  ['sentence-case', { sectionHash: '54a42d009098e91ec4c828c7108f629e2b0d0f9f9f24f5e0913b27464bb35a84', version: '1' }],
  ['so', { sectionHash: '2ed8a0d1f531d1d33778f9006214931528d13f0ccd79ad004a87d05e0ba97bf3', version: '1' }],
  ['where', { sectionHash: 'de807a9bf2e30c9b97415507a2a0b67a216674032755cb6cf3e23e8d2019e397', version: '2' }],
]);

const DRIFT_MESSAGE =
  "A rulebook's deployed body no longer matches the pin recorded for it. Choose one remedy: bump the rulebook's " +
  '`version` and re-pin both fields if the operative content moved; or re-pin the hash alone if the edit left the ' +
  'operative content as it was. If the edit lies outside every rule section and some text that complied with a rule ' +
  "could now fail it, also raise that rule's sweep version, which re-opens the rule's coverage in every " +
  "repository's record. An edit to an included partial counts as an edit to the body, which is why a rulebook can " +
  'drift with its own file untouched.';

const RULE_DRIFT_MESSAGE =
  "A rule's section no longer matches the pin recorded for it. Choose one remedy: raise the sweep version on the " +
  "rule's marker and re-pin both fields if some text that complied with the old wording could fail the new one, or " +
  'if unsure; or re-pin the hash alone for a relaxation, a clarification, or a rewording. An edit to an included ' +
  "partial counts as an edit to the section, which is why a rule can drift with its rulebook's file untouched.";

const RESOLVED = resolveEveryRulebook(CONTENT_ROOT);

describe('rulebook version pins', () => {
  it('pins every versioned rulebook', async () => {
    const unpinned = (await RESOLVED)
      .values()
      .filter((rulebook) => rulebook.version !== undefined && !PINS.has(rulebook.slug))
      .map((rulebook) => `['${rulebook.slug}', ${renderPin(rulebook)}],`)
      .toArray();

    const message = `A versioned rulebook does not have a pin. Add to \`PINS\`:\n  ${unpinned.join('\n  ')}`;
    expect(unpinned, message).toEqual([]);
  });

  it('pins only rulebooks that declare a version', async () => {
    const resolved = await RESOLVED;
    const orphaned = PINS.keys()
      .filter((slug) => resolved.get(slug)?.version === undefined)
      .toArray();

    const message = `A pin names a rulebook that is gone or that does not declare a version: ${orphaned.join(', ')}`;
    expect(orphaned, message).toEqual([]);
  });

  it('declares the pinned version', async () => {
    const resolved = await RESOLVED;
    const drifted = [...PINS]
      .filter(([slug, pin]) => resolved.get(slug)?.version !== pin.version)
      .map(([slug]) => slug);

    const message = `A rulebook declares a version other than its pinned one: ${drifted.join(', ')}`;
    expect(drifted, message).toEqual([]);
  });

  it('is pinned against the body as it stands', async () => {
    const resolved = await RESOLVED;
    const drifted = [...PINS]
      .filter(([slug, pin]) => hashBody(resolved.get(slug)) !== pin.bodyHash)
      .map(([slug]) => slug);

    expect(drifted, `${DRIFT_MESSAGE}\n  ${drifted.join('\n  ')}`).toEqual([]);
  });

  // The pin table cannot show that partial content is inside what it hashes, and this test covers the one case that
  // an author cannot see for themselves: a rulebook whose body moved while its own file stayed as it was.
  it('hashes the content of an included partial', async () => {
    const message =
      `commit-conventions contains ${INCLUDED_PARTIAL_MARKER} only through an include, so its absence means the ` +
      'pinned body no longer covers the partials that a rulebook inlines';
    expect((await RESOLVED).get('commit-conventions')?.body, message).toContain(INCLUDED_PARTIAL_MARKER);
  });

  // Every assertion above is negative, so a hash that stopped varying with the body would leave the suite green.
  it('reports drift from a one-character change', async () => {
    const body = (await RESOLVED).get('commit-conventions')?.body;

    expect(hashText(`${body} `)).not.toBe(PINS.get('commit-conventions')?.bodyHash);
  });
});

describe('rule version pins', () => {
  it('pins every declared rule', async () => {
    const unpinned = (await readRuleSections())
      .entries()
      .filter(([id]) => !RULE_PINS.has(id))
      .map(([id, rule]) => `['${id}', ${renderRulePin(rule)}],`)
      .toArray();

    const message = `A declared rule does not have a pin. Add to \`RULE_PINS\`:\n  ${unpinned.join('\n  ')}`;
    expect(unpinned, message).toEqual([]);
  });

  it('pins only rules that a marker declares', async () => {
    const sections = await readRuleSections();
    const orphaned = RULE_PINS.keys()
      .filter((id) => !sections.has(id))
      .toArray();

    const message = `A pin names a rule that is not declared by any marker: ${orphaned.join(', ')}`;
    expect(orphaned, message).toEqual([]);
  });

  it('declares the pinned sweep version', async () => {
    const sections = await readRuleSections();
    const drifted = [...RULE_PINS].filter(([id, pin]) => sections.get(id)?.version !== pin.version).map(([id]) => id);

    const message = `A rule's marker declares a sweep version other than its pinned one: ${drifted.join(', ')}`;
    expect(drifted, message).toEqual([]);
  });

  it('is pinned against each rule section as it stands', async () => {
    const sections = await readRuleSections();
    const drifted = [...RULE_PINS]
      .filter(([id, pin]) => hashText(sections.get(id)?.text ?? '') !== pin.sectionHash)
      .map(([id]) => id);

    expect(drifted, `${RULE_DRIFT_MESSAGE}\n  ${drifted.join('\n  ')}`).toEqual([]);
  });

  it('reports drift from a one-character change', async () => {
    const text = (await readRuleSections()).get('where')?.text;

    expect(hashText(`${text} `)).not.toBe(RULE_PINS.get('where')?.sectionHash);
  });
});

// region | Helpers

/** Hashes a resolved rulebook's body, or the empty string if the slug resolved to nothing. */
function hashBody(rulebook: ResolvedRulebook | undefined): string {
  return hashText(rulebook === undefined ? '' : rulebook.body);
}

/** Hashes text, whole rather than by its operative content: Any edit at all reports drift. */
function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Reads the section and sweep version of every rule that a library rulebook declares, indexed by the rule's id. */
async function readRuleSections(): Promise<ReadonlyMap<string, DeclaredRule>> {
  return new Map(
    (await RESOLVED)
      .values()
      .flatMap((rulebook) => listRuleSections(rulebook.body))
      .flatMap((section): Array<[string, DeclaredRule]> =>
        section.marker === undefined
          ? []
          : [[section.marker.id, { text: section.text, version: section.marker.version }]],
      ),
  );
}

/** Renders a rulebook's pin as the literal that `PINS` takes, so that a failure hands the author the line to paste. */
function renderPin(rulebook: ResolvedRulebook): string {
  return `{ bodyHash: '${hashText(rulebook.body)}', version: '${rulebook.version}' }`;
}

/** Renders a rule's pin as the literal that `RULE_PINS` takes, so that a failure hands the author the line to paste. */
function renderRulePin(rule: DeclaredRule): string {
  return `{ sectionHash: '${hashText(rule.text)}', version: '${rule.version}' }`;
}

// endregion | Helpers
