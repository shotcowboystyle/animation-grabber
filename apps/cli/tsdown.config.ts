import { defineConfig } from "tsdown";

export default defineConfig({
  // Core is a private workspace package: inline it into the published bin.
  deps: { alwaysBundle: ["@animation-grabber/core"] },
  entry: ["src/cli.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
});
