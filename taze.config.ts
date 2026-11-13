import { defineConfig } from '@williamthorsen/nmr/taze';

export default defineConfig({
  // Hold packages that must track a particular version line, so that an upgrade pass never moves them off it.
  packageMode: {
    // Hold @types/node at the engines floor (>=24) until the published packages raise it.
    '@types/node': 'minor',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
  },
});
