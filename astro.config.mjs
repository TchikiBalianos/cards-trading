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
      /*
        Pages statiques de `public/`, INVISIBLES pour Astro.

        Le sitemap n'était construit qu'à partir des pages Astro, donc
        `/blog/` et les articles. La page d'accueil — celle qui porte le
        formulaire d'inscription, c'est-à-dire la seule qui convertit —
        n'y figurait pas, pas plus que les pages légales.

        Constaté le 21 août 2026 : 8 URL déclarées, aucune n'était `/`.
      */
      customPages: [
        'https://cards-trading.com/',
        'https://cards-trading.com/cgu.html',
        'https://cards-trading.com/mentions-legales.html',
      ],
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
