import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/tiny-planet-courier/' : '/',
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-core',
              test: id => id.replaceAll('\\', '/').endsWith('/three/build/three.core.js'),
              priority: 20,
            },
            {
              name: 'three-renderer',
              test: id => id.replaceAll('\\', '/').endsWith('/three/build/three.module.js'),
              priority: 10,
            },
          ],
        },
      },
    },
  },
}));
