// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import expressiveCode from "astro-expressive-code";

// https://astro.build/config
export default defineConfig({
  site: "https://kui04.github.io",
  base: "kui04.github.io",
  integrations: [
    expressiveCode({
      themes: ["dark-plus"],
      styleOverrides: {
        codeFontFamily: "monospace",
      },
    }),
    mdx(),
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
