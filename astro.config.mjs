import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://cards-trading.com',
  output: 'static',
  adapter: vercel(),
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/draft/'),
    }),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        dark: 'github-dark',
        light: 'github-dark', // dark-only
      },
    },
  },
});
