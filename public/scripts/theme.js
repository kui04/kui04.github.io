document.documentElement.classList.toggle(
    "dark",
    localStorage.theme === "dark" ||
        (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)
);

const toggleTheme = () => {
    const html = document.documentElement;
    const isDark = html.classList.toggle("dark");
    localStorage.theme = isDark ? "dark" : "light";
};

const getTheme = () => {
    const isDark =
        document.documentElement.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isDark ? "dark" : "light";
};
