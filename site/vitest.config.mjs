import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors componentBuildPlugin in build.js: inlines a component's .html template into its html() method.
const componentTemplatePlugin = {
  name: "componentTemplate",
  transform(code, id) {
    const file = id.split("?")[0];
    const componentName = path.basename(file, ".js");
    const placeholder = `{{${componentName}.html}}`;
    if (!code.includes(placeholder)) return null;
    const htmlText = fs.readFileSync(path.join(path.dirname(file), `${componentName}.html`), "utf8");
    return { code: code.replace(placeholder, htmlText), map: null };
  },
};

export default defineConfig({
  plugins: [componentTemplatePlugin],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.js"],
    setupFiles: ["./test/setup.js"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      all: true,
      include: ["src/**/*.js"],
      exclude: ["test/**", "**/*.test.js", "build.js", "scripts/**"],
    },
  },
});
