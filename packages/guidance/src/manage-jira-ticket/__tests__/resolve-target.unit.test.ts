import { describe, expect, it } from 'vitest';

import { loadWorkTypes } from '../../lib/work-types.ts';
import {
  type JiraPreferences,
  readJiraPreferences,
  resolveChildIssueType,
  resolveDoneStatus,
  resolveTarget,
} from '../resolve-target.ts';

const workTypes = await loadWorkTypes();
if (workTypes === null) {
  throw new Error('embedded taxonomy did not load');
}

describe(resolveTarget, () => {
  it('takes integrations.jira.project_key over the ticket-reference prefix', () => {
    const target = resolveTarget('feat', preferences({ projectKey: 'JIRA', ticketRefPrefix: 'ABC-' }), workTypes);

    expect(target).toEqual({ issueType: 'Task', projectKey: 'JIRA', subtaskIssueType: 'Subtask' });
  });

  it('derives the project key from the ticket-reference prefix without its separator', () => {
    const target = resolveTarget('feat', preferences({ ticketRefPrefix: 'ABC-' }), workTypes);

    expect(target).toEqual({ issueType: 'Task', projectKey: 'ABC', subtaskIssueType: 'Subtask' });
  });

  it('falls back when neither the project key nor the prefix is set', () => {
    const target = resolveTarget('feat', preferences({}), workTypes);

    expect(target).toEqual({ fallback: 'no-project-key', warning: expect.stringContaining('project_key') });
  });

  it('falls back when the prefix does not contain a key', () => {
    const target = resolveTarget('feat', preferences({ ticketRefPrefix: '#' }), workTypes);

    expect(target).toHaveProperty('fallback', 'no-project-key');
  });

  it('takes the entry keyed by the canonical work type', () => {
    const target = resolveTarget(
      'fix',
      preferences({ projectKey: 'ABC', issueTypes: { default: 'Task', fix: 'Bug' } }),
      workTypes,
    );

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('matches an entry keyed by an alias of the work type', () => {
    const target = resolveTarget('fix', preferences({ projectKey: 'ABC', issueTypes: { bugfix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('matches a canonical entry when the work type is spelled as an alias', () => {
    const target = resolveTarget('bugfix', preferences({ projectKey: 'ABC', issueTypes: { fix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('accepts a work type spelled with the breaking marker', () => {
    const target = resolveTarget('fix!', preferences({ projectKey: 'ABC', issueTypes: { fix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Bug');
  });

  it('takes the default entry when the map does not contain an entry naming the work type', () => {
    const target = resolveTarget(
      'feat',
      preferences({ projectKey: 'ABC', issueTypes: { default: 'Story', fix: 'Bug' } }),
      workTypes,
    );

    expect(target).toHaveProperty('issueType', 'Story');
  });

  it('takes Task when neither a matching entry nor a default is set', () => {
    const target = resolveTarget('feat', preferences({ projectKey: 'ABC', issueTypes: { fix: 'Bug' } }), workTypes);

    expect(target).toHaveProperty('issueType', 'Task');
  });

  it('takes Epic for an umbrella, whatever the work type maps to', () => {
    const target = resolveTarget(
      'fix',
      preferences({ projectKey: 'ABC', issueTypes: { default: 'Story', fix: 'Bug' } }),
      workTypes,
      { umbrella: true },
    );

    expect(target).toEqual({ issueType: 'Epic', projectKey: 'ABC', subtaskIssueType: undefined });
  });

  it('takes integrations.jira.umbrella_issue_type for an umbrella when it is set', () => {
    const target = resolveTarget(
      'feat',
      preferences({ projectKey: 'ABC', umbrellaIssueType: 'Initiative' }),
      workTypes,
      {
        umbrella: true,
      },
    );

    expect(target).toHaveProperty('issueType', 'Initiative');
  });

  it('takes Epic for an umbrella when the umbrella issue type is empty', () => {
    const target = resolveTarget('feat', preferences({ projectKey: 'ABC', umbrellaIssueType: '' }), workTypes, {
      umbrella: true,
    });

    expect(target).toHaveProperty('issueType', 'Epic');
  });

  it('ignores the umbrella issue type for a work item that is not an umbrella', () => {
    const target = resolveTarget(
      'feat',
      preferences({ projectKey: 'ABC', umbrellaIssueType: 'Initiative' }),
      workTypes,
    );

    expect(target).toHaveProperty('issueType', 'Task');
  });

  it('takes integrations.jira.subtask_issue_type as the subtask type when it is set', () => {
    const target = resolveTarget('feat', preferences({ projectKey: 'ABC', subtaskIssueType: 'Sub-task' }), workTypes);

    expect(target).toHaveProperty('subtaskIssueType', 'Sub-task');
  });

  it('takes Subtask as the subtask type when the subtask issue type is empty', () => {
    const target = resolveTarget('feat', preferences({ projectKey: 'ABC', subtaskIssueType: '' }), workTypes);

    expect(target).toHaveProperty('subtaskIssueType', 'Subtask');
  });

  it('throws on a work type that the taxonomy does not declare', () => {
    expect(() => resolveTarget('feature-ish', preferences({}), workTypes)).toThrow("unknown work type 'feature-ish'");
  });
});

describe(resolveChildIssueType, () => {
  const standard = { issueType: 'Task', subtaskIssueType: 'Subtask' };
  const umbrella = { issueType: 'Epic', subtaskIssueType: undefined };

  it.each([
    ['without a parent', standard, undefined, { issueType: 'Task', parentAllowed: true }],
    ['under a subtask', standard, -1, { issueType: 'Task', parentAllowed: false }],
    ['under a level-0 parent', standard, 0, { issueType: 'Subtask', parentAllowed: true }],
    ['under an epic', standard, 1, { issueType: 'Task', parentAllowed: true }],
    ['under an initiative', standard, 2, { issueType: 'Task', parentAllowed: false }],
    ['as an umbrella without a parent', umbrella, undefined, { issueType: 'Epic', parentAllowed: true }],
    ['as an umbrella under a level-0 parent', umbrella, 0, { issueType: 'Epic', parentAllowed: false }],
    ['as an umbrella under an epic', umbrella, 1, { issueType: 'Epic', parentAllowed: false }],
    ['as an umbrella under an initiative', umbrella, 2, { issueType: 'Epic', parentAllowed: true }],
  ])('places a work item %s', (_label, target, parentLevel, expected) => {
    expect(resolveChildIssueType(target, parentLevel)).toEqual(expected);
  });
});

describe(resolveDoneStatus, () => {
  it('takes integrations.jira.done_status', () => {
    expect(resolveDoneStatus(preferences({ doneStatus: 'Resolved' }))).toBe('Resolved');
  });

  it('falls back to Done when the status is absent or empty', () => {
    expect(resolveDoneStatus(preferences({}))).toBe('Done');
    expect(resolveDoneStatus(preferences({ doneStatus: '' }))).toBe('Done');
  });
});

describe(readJiraPreferences, () => {
  it('reads the Jira settings and the ticket-reference prefix', () => {
    const merged = {
      integrations: {
        jira: {
          done_status: 'Closed',
          enabled: true,
          issue_types: { fix: 'Bug' },
          project_key: 'ABC',
          subtask_issue_type: 'Sub-task',
          umbrella_issue_type: 'Epic',
        },
      },
      project: { ticket_ref_prefix: 'ABC-' },
    };

    expect(readJiraPreferences(merged)).toEqual({
      doneStatus: 'Closed',
      issueTypes: { fix: 'Bug' },
      projectKey: 'ABC',
      subtaskIssueType: 'Sub-task',
      ticketRefPrefix: 'ABC-',
      umbrellaIssueType: 'Epic',
    });
  });

  it('reads absent sections as unset', () => {
    expect(readJiraPreferences({})).toEqual({
      doneStatus: undefined,
      issueTypes: {},
      projectKey: undefined,
      subtaskIssueType: undefined,
      ticketRefPrefix: undefined,
      umbrellaIssueType: undefined,
    });
  });

  it('throws with the key path when a field has the wrong type', () => {
    const merged = { integrations: { jira: { issue_types: { fix: 3 } } } };

    expect(() => readJiraPreferences(merged)).toThrow("'integrations.jira.issue_types.fix' must be a string");
  });

  it('throws with the key path when the subtask issue type is not a string', () => {
    const merged = { integrations: { jira: { subtask_issue_type: 1 } } };

    expect(() => readJiraPreferences(merged)).toThrow("'integrations.jira.subtask_issue_type' must be a string");
  });

  it('throws with the key path when the umbrella issue type is not a string', () => {
    const merged = { integrations: { jira: { umbrella_issue_type: 1 } } };

    expect(() => readJiraPreferences(merged)).toThrow("'integrations.jira.umbrella_issue_type' must be a string");
  });
});

// region | Helpers

/** Builds Jira preferences from the fields that a test sets. */
function preferences(fields: Partial<JiraPreferences>): JiraPreferences {
  return {
    doneStatus: undefined,
    issueTypes: {},
    projectKey: undefined,
    subtaskIssueType: undefined,
    ticketRefPrefix: undefined,
    umbrellaIssueType: undefined,
    ...fields,
  };
}

// endregion | Helpers
