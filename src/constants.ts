// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.
export const AUTHOR_NAME = "kui04";
export const SITE_TITLE = "Kui's 杂物间";
export const SITE_DESCRIPTION = "Linux · 开源工具 · 日常折腾，偶尔闲话，不成体系。";

export const NAVIGATION = [
    { title: "主页", href: "/" },
    { title: "博客", href: "/blog" },
] as const;

export const HOME_LANDING = {
    eyebrow: "KUI04's",
    title: "杂物间",
    subtitle: "Linux · 开源工具 · 日常折腾",
    description: "偶尔闲话，不成体系",
} as const;
