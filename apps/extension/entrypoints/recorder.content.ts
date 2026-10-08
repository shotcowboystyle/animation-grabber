import { recordGsapInPage } from "@animation-grabber/core/record-in-page";
import { defineContentScript } from "wxt/utils/define-content-script";

/**
 * Registered at runtime (see `recordAndExtract`) for one origin, runs in the
 * page's MAIN world at `document_start` so it sees GSAP being assigned to
 * `window.gsap` and can flip the flag before any tween completes.
 */
export default defineContentScript({
  main() {
    recordGsapInPage();
  },
  matches: ["*://*/*"],
  registration: "runtime",
  runAt: "document_start",
  world: "MAIN",
});
