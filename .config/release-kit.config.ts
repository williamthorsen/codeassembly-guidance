import { defineConfig } from '@williamthorsen/release-kit/config';

const config = defineConfig({
  releaseNotes: {
    shouldInjectIntoReadme: true,
  },
  repoLabels: {
    extends: ['common'],
    labels: {
      'scope:root': { color: '00ff96' },
      'scope:guidance': { color: '00ff96' },
    },
  },
  workspaces: [{ dir: 'guidance' }],
});

export default config;
