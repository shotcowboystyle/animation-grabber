import { defineContentScript } from "wxt/utils/define-content-script";

interface GsapGlobal {
  globalTimeline?: { autoRemoveChildren: boolean };
}

interface RecordingWindow {
  __gsapExtractorRecording?: boolean;
  gsap?: unknown;
}

/**
 * GSAP drops finished tweens from its global timeline, which hides every
 * load-time intro animation from a later extraction. Keeping them around is
 * a single flag on the root timeline.
 */
const keepFinishedTweens = (gsap: unknown) => {
  if (gsap && typeof gsap === "object" && "globalTimeline" in gsap) {
    const { globalTimeline } = gsap as GsapGlobal;
    if (globalTimeline) {
      globalTimeline.autoRemoveChildren = false;
    }
  }
};

/**
 * Registered at runtime (see `recordAndExtract`) for one origin, runs in the
 * page's MAIN world at `document_start` so it sees GSAP being assigned to
 * `window.gsap` and can flip the flag before any tween completes.
 */
export default defineContentScript({
  main() {
    const page = window as Window & RecordingWindow;
    page.__gsapExtractorRecording = true;
    let current = page.gsap;
    keepFinishedTweens(current);
    Object.defineProperty(page, "gsap", {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (value: unknown) => {
        current = value;
        keepFinishedTweens(value);
      },
    });
  },
  matches: ["*://*/*"],
  registration: "runtime",
  runAt: "document_start",
  world: "MAIN",
});
