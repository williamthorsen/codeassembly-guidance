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
    { bodyHash: 'be7a54d6b674208536250981d10f709a9f0f40dc10e34eb858706437047b0e26', version: '3' },
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
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: 'da067d3bfaaa7154cf936b5c3f4a6f697c732fa4b24d9e02514fabcd9b0e17dc', version: '3' },
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
    { bodyHash: 'd2e47db61e61110eee7b797db2ae737beea7fbfb1f94b3ec17c81a2847d19f23', version: '2' },
  ],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: 'f8fcc4e941d25f6f66224201d7cf82ca1cc953b2164cc8ff859f6cb3b36412de', version: '7' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: '1c5abdbfb7fd0574df89b08fbc37185f3dc06f4df2d23d4ce90ebef77ff7fe9f', version: '17' },
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
    { bodyHash: 'fbc4d8c99bf6f91e5bbd922d51f0a3403846be25a9ff6fe0a97b559dd9ed1aa6', version: '6' },
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
    'williamthorsen-workflow-preferences',
    { bodyHash: '44e36af44b80afde91dbbf24a0049001d7ec869cbef6c802858be769ec50242f', version: '13' },
  ],
  [
    'williamthorsen-writing-preferences',
    { bodyHash: '778eecb88facbdd921f8f2a367e0bb99b9b1724d70a8d8bbb05665acbc17eeee', version: '12' },
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
    { sectionHash: '4c431bf7a3aa72af3ff9e49b7d249bfe98cc3ce039f11f0c8d627a663b98b303', version: '1' },
  ],
  ['second-person', { sectionHash: '5b5fa597c03587feb40ba41386593007c04370bd01eb4e042bccf8e1b9e46427', version: '1' }],
  ['sentence-case', { sectionHash: 'e19ffdafdd6eb84f47e229d07871a70ab55114981c8052b365f4bd33330d9b18', version: '1' }],
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
