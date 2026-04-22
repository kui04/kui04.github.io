import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import expressiveCode from "astro-expressive-code";
// https://astro.build/config
export default defineConfig({
  site: "https://kui04.github.io",
  prefetch: true,
  integrations: [
    expressiveCode({
      themes: ["one-light", "material-theme-darker"],
      styleOverrides: {
        codeFontFamily: "monospace",
      },
      customizeTheme: (theme) => {
        if (theme.name.includes("light")) theme.name = "light";
        else if (theme.name.includes("dark")) theme.name = "dark";
      },
      themeCssSelector: (theme) => {
        if (theme.name === "dark") return ".dark";
        else return ":root";
      },
      useDarkModeMediaQuery: false,
    }),
    mdx(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});