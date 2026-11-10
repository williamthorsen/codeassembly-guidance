import { describe, expect, it } from 'vitest';

import { composeManifest } from '../compose-manifest.ts';
import type { ProjectStage } from '../read-project-stage.ts';

const NOW = new Date('2026-05-26T02:07:41Z');
const HOME = '/Users/test';
const CWD = '/Users/test/repos/codeassembly';

const NO_STAGE: ProjectStage = { maturity: null, sensitivity: null, audience: null };

describe(composeManifest, () => {
  describe('ticket URL construction', () => {
    it('constructs ticket_url from base_url and a Jira-style ticket id', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse/' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'MAC-130/feat/x',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_base_url).toBe('https://org.atlassian.net/browse/');
      expect(manifest.ticket_url).toBe('https://org.atlassian.net/browse/MAC-130');
    });

    it('appends the bare ticket id, not the display ref, for a #-prefixed numeric ticket', () => {
      const manifest = composeManifest({
        preferences: {
          project: { slug: 'x', ticket_ref_prefix: '#' },
          ticket: { base_url: 'https://github.com/owner/repo/issues/' },
        },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: '152',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_ref).toBe('#152');
      expect(manifest.ticket_url).toBe('https://github.com/owner/repo/issues/152');
    });

    it('normalizes the base/id boundary to one slash when the base lacks a trailing slash', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'MAC-130',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_url).toBe('https://org.atlassian.net/browse/MAC-130');
    });

    it('leaves ticket_url null when the preferences do not configure a base_url', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'MAC-130',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_base_url).toBeNull();
      expect(manifest.ticket_url).toBeNull();
    });

    it('leaves ticket_url null when a base_url is set but a ticket id cannot be derived from the branch', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse/' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'experiment/no-ticket',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_id).toBeNull();
      expect(manifest.ticket_base_url).toBe('https://org.atlassian.net/browse/');
      expect(manifest.ticket_url).toBeNull();
    });

    it('leaves ticket_url null for a PR-sentinel id even when a base_url is configured', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' }, ticket: { base_url: 'https://org.atlassian.net/browse/' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'PR-123',
        cwd: CWD,
        home: HOME,
        now: NOW,
      });
      expect(manifest.ticket_id).toBe('PR-123');
      expect(manifest.ticket_base_url).toBe('https://org.atlassian.net/browse/');
      expect(manifest.ticket_url).toBeNull();
    });
  });

  describe('PR URL construction', () => {
    it('constructs a GitHub pr_url from a PR-<n> identity and an SSH remote', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'PR-950',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'git@github.com:owner/repo.git',
      });
      expect(manifest.ticket_id).toBe('PR-950');
      expect(manifest.pr_url).toBe('https://github.com/owner/repo/pull/950');
    });

    it('constructs a GitHub pr_url from an HTTPS remote, stripping the .git suffix', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'PR-42',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'https://github.com/owner/repo.git',
      });
      expect(manifest.pr_url).toBe('https://github.com/owner/repo/pull/42');
    });

    it('uses the Bitbucket URL shape when scm is bitbucket', () => {
      const manifest = composeManifest({
        preferences: { scm: 'bitbucket', project: { slug: 'x' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'PR-7',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'git@bitbucket.org:workspace/repo.git',
      });
      expect(manifest.pr_url).toBe('https://bitbucket.org/workspace/repo/pull-requests/7');
    });

    it('leaves pr_url null for a non-PR identity even when a remote is present', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'MAC-130',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'git@github.com:owner/repo.git',
      });
      expect(manifest.pr_url).toBeNull();
    });

    it('leaves pr_url null for a PR identity when the remote URL is unknown', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'PR-950',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: null,
      });
      expect(manifest.pr_url).toBeNull();
    });

    it('leaves pr_url null when the remote cannot be parsed to owner/repo', () => {
      const manifest = composeManifest({
        preferences: { project: { slug: 'x' } },
        projectStage: NO_STAGE,
        subdirectoryStages: [],
        branchName: 'PR-950',
        cwd: CWD,
        home: HOME,
        now: NOW,
        remoteUrl: 'not-a-remote-url',
      });
      expect(manifest.pr_url).toBeNull();
    });
  });
});
