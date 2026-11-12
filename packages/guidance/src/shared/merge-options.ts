/** The values that `merge-pr`'s `--delete` flag and the `merge.deletion_strategy` preference accept. */
export const DELETION_STRATEGIES = ['both', 'none', 'remote'] as const;

/** The values that `merge-pr`'s `--strategy` flag and the `merge.strategy` preference accept. */
export const MERGE_STRATEGIES = ['merge', 'rebase', 'squash'] as const;

export type DeletionStrategy = (typeof DELETION_STRATEGIES)[number];

export type MergeStrategy = (typeof MERGE_STRATEGIES)[number];
