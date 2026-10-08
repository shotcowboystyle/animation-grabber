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
              id: "gsap-webflow-extractor@shotcowboystyle.dev",
              strict_min_version: "140.0",
            },
          }
        : undefined,
    description:
      "Extract GSAP tweens, timelines and ScrollTriggers from Webflow landing pages.",
    name: "GSAP Extractor for Webflow",
    // Firefox declares optional host access under optional_permissions.
    optional_host_permissions: browser === "firefox" ? undefined : HOSTS,
    optional_permissions: browser === "firefox" ? HOSTS : undefined,
    permissions: ["activeTab", "scripting"],
  }),
  // MV3 everywhere: Firefox needs it for `world: "MAIN"` script injection;
  // 140 is the first release with data_collection_permissions.
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
});
