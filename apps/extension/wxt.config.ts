import { defineConfig } from "wxt";

const HOSTS = ["*://*/*"];

export default defineConfig({
  hooks: {
    // WXT adds host_permissions for the runtime-registered recorder, which
    // would prompt for every site at install. The popup requests the
    // current origin on demand instead (optional permissions + activeTab).
    "build:manifestGenerated": (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
  manifest: ({ browser }) => ({
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              data_collection_permissions: { required: ["none"] },
              id: "animation-grabber@shotcowboystyle.dev",
              strict_min_version: "140.0",
            },
            // Android shipped data_collection_permissions later than desktop.
            gecko_android: { strict_min_version: "142.0" },
          }
        : undefined,
    description:
      "Grab GSAP tweens, timelines and ScrollTriggers from any page that uses GSAP, as runnable code.",
    name: "Animation Grabber",
    // Firefox declares optional host access under optional_permissions.
    optional_host_permissions: browser === "firefox" ? undefined : HOSTS,
    optional_permissions: browser === "firefox" ? HOSTS : undefined,
    permissions: ["activeTab", "scripting"],
  }),
  // MV3 everywhere: Firefox needs it for `world: "MAIN"` script injection;
  // 140 is the first release with data_collection_permissions.
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  zip: {
    artifactTemplate: "animation-grabber-{{version}}-{{browser}}.zip",
    excludeSources: [
      "apps/cli/**",
      "apps/web/**",
      "brand/**",
      "skills/**",
      "scripts/**",
      ".github/**",
      ".changeset/**",
      "**/store/**",
    ],
    // AMO reviewers rebuild from source, which needs the workspace root
    // (lockfile, packages/core), not just this app.
    sourcesRoot: "../..",
    sourcesTemplate: "animation-grabber-{{version}}-sources.zip",
  },
});
