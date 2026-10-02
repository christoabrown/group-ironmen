import js from "@eslint/js";
import globals from "globals";

// Where blank lines go, which prettier leaves alone.
const blankLines = {
  "padding-line-between-statements": [
    "error",
    { blankLine: "always", prev: "function", next: "function" },
    { blankLine: "always", prev: "*", next: "class" },
    { blankLine: "always", prev: "*", next: "export" },
    { blankLine: "always", prev: "import", next: "function" },
    { blankLine: "always", prev: "import", next: "const" },
    { blankLine: "always", prev: "import", next: "let" },
  ],
  "lines-between-class-members": ["error", "always"],
};

export default [
  { ignores: ["public/**", "coverage/**"] },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": "error",
      "no-empty": "off",
    },
  },
  {
    // The site: what build.js bundles for the browser.
    files: ["src/**/*.js"],
    languageOptions: { sourceType: "module", globals: globals.browser },
    rules: {
      ...blankLines,
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // The tests run in jsdom under vitest, which is Node with a page in it.
    files: ["test/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.browser, ...globals.node, ...globals.vitest } },
  },
  {
    // What builds and serves the site.
    files: ["build.js", "scripts/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  {
    files: ["**/*.mjs", "scripts/generate-regions.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },
];
