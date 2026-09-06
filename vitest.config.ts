import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

const root = fileURLToPath(new URL('./', import.meta.url))

/**
 * Two projects, so `src/core/` stays honest: it must pass with no DOM at all.
 * Only `*.dom.test.ts` gets happy-dom.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      root,
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            root,
            environment: 'node',
            include: ['src/**/*.test.ts'],
            exclude: [...configDefaults.exclude, 'src/**/*.dom.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            root,
            environment: 'happy-dom',
            include: ['src/**/*.dom.test.ts'],
          },
        },
      ],
    },
  }),
)
