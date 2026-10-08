/**
 * GSAP drops finished tweens from its global timeline, which hides every
 * load-time intro animation from a later extraction. Keeping them around is
 * a single flag on the root timeline, set the moment the page assigns
 * `window.gsap`.
 *
 * Runs before any page script, in the page's MAIN world: as a runtime
 * content script in the extension and through `page.addInitScript` in the
 * CLI. Both serialize it with `Function.prototype.toString`, so it has to be
 * self-contained: no imports, no module-scope values. The test rebuilds it
 * from source to prove that stays true.
 */
export const recordGsapInPage = () => {
  interface GsapGlobal {
    globalTimeline?: { autoRemoveChildren: boolean };
  }
  interface RecordingWindow {
    __gsapExtractorRecording?: boolean;
    gsap?: unknown;
  }

  const keepFinishedTweens = (gsap: unknown) => {
    if (gsap && typeof gsap === "object" && "globalTimeline" in gsap) {
      const { globalTimeline } = gsap as GsapGlobal;
      if (globalTimeline) {
        globalTimeline.autoRemoveChildren = false;
      }
    }
  };

  const page = globalThis as RecordingWindow;
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
};
