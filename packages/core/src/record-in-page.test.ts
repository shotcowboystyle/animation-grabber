import { gsap } from "gsap";
import { afterEach, describe, expect, it } from "vitest";

import { recordGsapInPage } from "./record-in-page";

interface TestGlobals {
  __gsapExtractorRecording?: boolean;
  gsap?: unknown;
}

const page = globalThis as TestGlobals;

// oxlint-disable-next-line no-new-func, sonarjs/code-eval -- proves the function is self-contained
const rebuilt = new Function(
  `(${recordGsapInPage.toString()})();`
) as () => void;

describe(recordGsapInPage, () => {
  afterEach(() => {
    delete page.gsap;
    delete page.__gsapExtractorRecording;
    gsap.globalTimeline.autoRemoveChildren = true;
  });

  it("keeps finished tweens once the page assigns window.gsap", () => {
    rebuilt();
    expect(page.__gsapExtractorRecording).toBeTruthy();
    expect(gsap.globalTimeline.autoRemoveChildren).toBeTruthy();
    page.gsap = gsap;
    expect(page.gsap).toBe(gsap);
    expect(gsap.globalTimeline.autoRemoveChildren).toBeFalsy();
  });

  it("handles gsap that is already present", () => {
    page.gsap = gsap;
    rebuilt();
    expect(gsap.globalTimeline.autoRemoveChildren).toBeFalsy();
  });
});
