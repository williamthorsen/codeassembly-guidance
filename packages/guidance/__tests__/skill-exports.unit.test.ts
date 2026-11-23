/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line n/no-missing-import -- `?raw` is a Vite query, which the rule resolves as part of the subpath.
import skillThroughVite from 'codeassembly-guidance/skills/convert-agent-prompt/SKILL.md?raw';
import { describe, expect, it } from 'vitest';

const SKILL_PATH = fileURLToPath(new URL('../content/skills/convert-agent-prompt/SKILL.md', import.meta.url));
const SUBPATH = 'codeassembly-guidance/skills/convert-agent-prompt/SKILL.md';

const require = createRequire(import.meta.url);

describe('convert-agent-prompt skill export', () => {
  it('resolves under Node to the published skill file', () => {
    expect(require.resolve(SUBPATH)).toBe(SKILL_PATH);
  });

  it('resolves under Vite to the skill file contents', () => {
    expect(skillThroughVite).toBe(readFileSync(SKILL_PATH, 'utf8'));
  });

  it.each([
    'codeassembly-guidance/content/skills/convert-agent-prompt/SKILL.md',
    'codeassembly-guidance/skills/revise-prose/SKILL.md',
  ])('refuses the unexported specifier %s', (specifier) => {
    expect(() => require.resolve(specifier)).toThrow(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    );
  });
});

describe('convert-agent-prompt SKILL.md', () => {
  const content = readFileSync(SKILL_PATH, 'utf8');
  const standaloneMessage = 'The package publishes this file as a standalone download, so it must stay self-contained';

  it('does not contain an include directive', () => {
    expect(findIncludeDirectives(content), standaloneMessage).toEqual([]);
  });

  it('does not link to another file', () => {
    expect(findFileLinks(content), standaloneMessage).toEqual([]);
  });

  it('does not reference a deployed harness path', () => {
    expect(content.includes('~/.claude'), standaloneMessage).toBe(false);
  });
});

describe('standalone checks', () => {
  it('detect an include directive', () => {
    expect(findIncludeDirectives('text\n  <!-- include: ../_partials/x.md / -->\n')).toHaveLength(1);
  });

  it('detect a link to another file and ignore web links and in-file anchors', () => {
    expect(findFileLinks('[a](../_data/x.md) [b](https://example.com) [c](#section)')).toEqual(['../_data/x.md']);
  });
});

// region | Helpers

/** Returns the targets of the Markdown links that name neither a web URL nor an in-file anchor. */
function findFileLinks(text: string): ReadonlyArray<string> {
  return text
    .matchAll(/\]\(([^)\s]+)[^)]*\)/g)
    .map((match) => match[1] ?? '')
    .filter((target) => !/^(?:https?:|#)/.test(target))
    .toArray();
}

/** Returns the lines that the deploy pipeline reads as include directives, per `content/_partials/README.md`. */
function findIncludeDirectives(text: string): ReadonlyArray<string> {
  return text.split('\n').filter((line) => /^\s*<!--\s*include:/.test(line));
}

// endregion | Helpers
