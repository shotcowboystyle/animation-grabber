import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["github", "sonarjs", "react-doctor"]);

export default defineConfig({
  extends: [core, react, vitest, jsPlugins],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: jsPlugins.jsPlugins,
  overrides: [
    {
      // Serialized with Function.prototype.toString for scripting.executeScript,
      // so every helper must stay nested inside the exported function.
      files: [
        "packages/core/src/extract-in-page.ts",
        "packages/core/src/record-in-page.ts",
      ],
      rules: { "unicorn/consistent-function-scoping": "off" },
    },
  ],
  settings: jsPluginSettings,
});
