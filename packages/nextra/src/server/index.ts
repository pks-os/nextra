/* eslint-env node */
import type { NextConfig } from 'next'
import type { ZodError } from 'zod'
import { fromZodError } from 'zod-validation-error'
import type { Nextra } from '../types'
import {
  DEFAULT_CONFIG,
  DEFAULT_LOCALES,
  MARKDOWN_EXTENSION_REGEX,
  MARKDOWN_EXTENSIONS
} from './constants.js'
import { nextraConfigSchema } from './schemas.js'
import { logger } from './utils.js'
import { NextraPlugin, NextraSearchPlugin } from './webpack-plugins/index.js'

const DEFAULT_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

const nextra: Nextra = nextraConfig => {
  try {
    nextraConfigSchema.parse(nextraConfig)
  } catch (error) {
    logger.error('Error validating nextraConfig')
    throw fromZodError(error as ZodError)
  }

  return function withNextra(nextConfig = {}) {
    const hasI18n = !!nextConfig.i18n?.locales

    if (hasI18n) {
      logger.info(
        'You have Next.js i18n enabled, read here https://nextjs.org/docs/advanced-features/i18n-routing for the docs.'
      )
      logger.warn(
        "Next.js doesn't support i18n by locale folder names.\n" +
          'When i18n enabled, Nextra unset nextConfig.i18n to `undefined`, use `useRouter` from `nextra/hooks` if you need `locale` or `defaultLocale` values.'
      )
    }
    const locales = nextConfig.i18n?.locales || DEFAULT_LOCALES

    const rewrites: NextConfig['rewrites'] = async () => {
      const rules = [{ source: '/:path*/_meta', destination: '/404' }]

      if (nextConfig.rewrites) {
        const originalRewrites = await nextConfig.rewrites()
        if (Array.isArray(originalRewrites)) {
          return [...originalRewrites, ...rules]
        }
        return {
          ...originalRewrites,
          beforeFiles: [...(originalRewrites.beforeFiles || []), ...rules]
        }
      }

      return rules
    }

    const loaderOptions = {
      ...DEFAULT_CONFIG,
      ...nextraConfig,
      locales
    }

    return {
      ...nextConfig,
      ...(nextConfig.output !== 'export' && { rewrites }),
      pageExtensions: [
        ...(nextConfig.pageExtensions || DEFAULT_EXTENSIONS),
        ...MARKDOWN_EXTENSIONS
      ],
      webpack(config, options) {
        if (options.nextRuntime !== 'edge' && options.isServer) {
          config.plugins ||= []
          config.plugins.push(
            new NextraPlugin({
              locales
              // transformPageMap: nextraConfig.transformPageMap
            })
          )

          if (loaderOptions.search) {
            config.plugins.push(new NextraSearchPlugin())
          }
        }

        // Fixes https://github.com/vercel/next.js/issues/55872
        if (config.watchOptions.ignored instanceof RegExp) {
          const ignored = config.watchOptions.ignored.source

          config.watchOptions = {
            ...config.watchOptions,
            ignored: new RegExp(
              ignored.replace('(\\.(git|next)|node_modules)', '\\.(git|next)')
            )
          }
        }

        const rules = config.module.rules as RuleSetRule[]

        // if (IMPORT_FRONTMATTER) {
        //   rules.push({
        //     test: MARKDOWN_EXTENSION_REGEX,
        //     issuer: request => request.includes(AGNOSTIC_PAGE_MAP_PATH),
        //     use: [
        //       options.defaultLoaders.babel,
        //       {
        //         loader: 'nextra/loader',
        //         options: { ...loaderOptions, isPageMapImport: true }
        //       }
        //     ]
        //   })
        // }

        rules.push(
          {
            // Match Markdown imports from non-pages. These imports have an
            // issuer, which can be anything as long as it's not empty.
            // When the issuer is null, it means that it can be imported via a
            // runtime import call such as `import('...')`.
            test: MARKDOWN_EXTENSION_REGEX,
            issuer: request =>
              !!request ||
              // && !request.includes(AGNOSTIC_PAGE_MAP_PATH)
              request === null,
            use: [
              options.defaultLoaders.babel,
              {
                loader: 'nextra/loader',
                options: loaderOptions
              }
            ]
          },
          {
            // Match pages (imports without an issuer request).
            test: MARKDOWN_EXTENSION_REGEX,
            issuer: request => request === '',
            use: [
              options.defaultLoaders.babel,
              {
                loader: 'nextra/loader',
                options: { ...loaderOptions, isPageImport: true }
              }
            ]
          }
        )

        return nextConfig.webpack?.(config, options) || config
      }
    }
  }
}

// TODO: take this type from webpack directly
type RuleSetRule = {
  issuer: (value: string) => boolean
  test: RegExp
  use: unknown[]
}

export default nextra

export type * from '../types'
