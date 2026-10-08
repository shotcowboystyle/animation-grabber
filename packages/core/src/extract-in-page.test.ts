import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractGsapInPage } from "./extract-in-page";
import type { ExtractionResult, InPageOptions } from "./types";

interface TestGlobals {
  ScrollTrigger?: unknown;
  Webflow?: unknown;
  __gsapExtractorRecording?: boolean;
  gsap?: unknown;
}

const page = globalThis as TestGlobals;

const OPTIONS: InPageOptions = {
  fetchExternalScripts: false,
  maxFunctionSource: 2000,
};

const BODY = `
  <section id="hero">
    <h1 class="hero-heading w-heading">Hi</h1>
    <p class="lede">a</p>
    <p class="lede">b</p>
  </section>
  <script>gsap.to(".hero-heading", { x: 10 }); gsap.timeline();</script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script type="application/json">{"gsap.to": 1}</script>
`;

const onComplete = () => "done";
const longFunction = () => "x".repeat(50);

/**
 * Rebuild the extractor from its source text, exactly like
 * `scripting.executeScript({ func })` does. Any reference to module scope
 * would throw a ReferenceError here.
 */
// oxlint-disable-next-line no-new-func, sonarjs/code-eval -- proves the function is self-contained
const rebuilt = new Function(`return (${extractGsapInPage.toString()});`)() as (
  options: InPageOptions
) => Promise<ExtractionResult>;

const run = (options: Partial<InPageOptions> = {}) =>
  rebuilt({ ...OPTIONS, ...options });

/** Replace the body without innerHTML; parsed scripts never execute. */
const setBody = (html: string) => {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren(...parsed.body.childNodes);
};

const byId = (result: ExtractionResult, id: string) => {
  const found = result.animations.find((animation) => animation.id === id);
  if (!found) {
    throw new Error(`No animation with id ${id}`);
  }
  return found;
};

describe(extractGsapInPage, () => {
  beforeEach(() => {
    document.documentElement.dataset.wfSite = "site123";
    document.documentElement.dataset.wfPage = "page456";
    setBody(BODY);
    page.gsap = gsap;
    gsap.globalTimeline.clear();
    gsap.globalTimeline.autoRemoveChildren = true;
    delete page.ScrollTrigger;
  });

  afterEach(() => {
    gsap.globalTimeline.clear();
    delete page.__gsapExtractorRecording;
    delete page.ScrollTrigger;
  });

  it("skips delayedCall tweens", async () => {
    gsap.globalTimeline.autoRemoveChildren = false;
    gsap.delayedCall(1, onComplete);
    gsap.to("#hero", { x: 1 });
    const result = await run();
    expect(
      result.animations.map((animation) => animation.targets)
    ).toStrictEqual([["#hero"]]);
  });

  it("reports page metadata", async () => {
    page.__gsapExtractorRecording = true;
    const result = await run();
    expect(result.gsap).toMatchObject({
      detected: true,
      recording: true,
      version: gsap.version,
    });
    expect(result.webflow).toStrictEqual({
      detected: true,
      pageId: "page456",
      siteId: "site123",
    });
    expect(result.warnings).toStrictEqual([]);
  });

  it("warns and still scans scripts when gsap is not global", async () => {
    delete page.gsap;
    const result = await run();
    expect(result.gsap.detected).toBeFalsy();
    expect(result.animations).toStrictEqual([]);
    expect(result.warnings[0]).toMatch(/window\.gsap is not defined/u);
    expect(result.scripts.map((script) => script.gsapCallCount)).toStrictEqual([
      2, 0, 0,
    ]);
  });

  it("describes a plain tween with selectors and serialized vars", async () => {
    gsap.to("#hero", {
      delay: 0.5,
      duration: 1,
      ease: "power2.out",
      onComplete,
      x: 100,
    });
    const result = await run();
    expect(result.animations).toHaveLength(1);
    expect(result.animations[0]).toMatchObject({
      delay: 0.5,
      duration: 1,
      id: "tween1",
      kind: "tween",
      method: "to",
      parentId: null,
      position: null,
      targets: ["#hero"],
    });
    expect(result.animations[0]?.vars).toStrictEqual({
      delay: 0.5,
      duration: 1,
      ease: "power2.out",
      onComplete: { __fn: onComplete.toString() },
      // GSAP writes its default overwrite mode into every tween's vars.
      overwrite: false,
      x: 100,
    });
  });

  it("classifies from, fromTo and set tweens while recording", async () => {
    // set() finishes instantly and would be dropped from the root timeline;
    // the recorder keeps finished tweens, so mirror that here.
    gsap.globalTimeline.autoRemoveChildren = false;
    gsap.from("#hero", { id: "intro", opacity: 0 });
    gsap.fromTo("#hero", { y: 10 }, { y: 0 });
    gsap.set("#hero", { visibility: "visible" });
    const result = await run();
    expect(
      result.animations.map((animation) => animation.method)
    ).toStrictEqual(["from", "fromTo", "set"]);
    expect(byId(result, "intro").vars.runBackwards).toBe(1);
    expect(result.animations[1]?.vars.startAt).toStrictEqual({ y: 10 });
  });

  it("captures timelines, children positions and labels", async () => {
    const timeline = gsap.timeline({ id: "intro", paused: true });
    timeline.to(".hero-heading", { duration: 1, y: 0 });
    timeline.to("#hero", { delay: 0.2, duration: 0.5, x: 1 }, "-=0.5");
    timeline.addLabel("mid", 1);
    const result = await run();
    expect(byId(result, "intro")).toMatchObject({
      kind: "timeline",
      labels: { mid: 1 },
      method: "timeline",
      paused: true,
      targets: [],
    });
    const children = result.animations.filter(
      (animation) => animation.parentId === "intro"
    );
    expect(children.map((child) => child.position)).toStrictEqual([0, 0.5]);
    expect(children[0]?.targets).toStrictEqual(["h1.hero-heading"]);
  });

  it("collapses multi-element targets to a shared selector", async () => {
    gsap.to(".lede", { opacity: 1 });
    const result = await run();
    expect(result.animations[0]?.targets).toStrictEqual([".lede"]);
  });

  it("falls back to one selector per element without a shared class", async () => {
    setBody(`${BODY}<p class="lede">c</p>`);
    gsap.to(document.querySelectorAll("#hero p"), { opacity: 1 });
    const result = await run();
    expect(result.animations[0]?.targets).toStrictEqual([
      "p.lede:nth-child(2)",
      "p.lede:nth-child(3)",
    ]);
  });

  it("links ScrollTriggers and recovers animations only they reference", async () => {
    const finished = gsap.to("#hero", { duration: 1, x: 5 });
    finished.progress(1);
    expect(gsap.globalTimeline.getChildren()).not.toContain(finished);
    const trigger = document.querySelector("#hero");
    page.ScrollTrigger = {
      getAll: () => [
        {
          animation: finished,
          pin: null,
          scroller: window,
          trigger,
          vars: { id: "heroTrigger", scrub: true, start: "top 80%", trigger },
        },
        { animation: null, pin: trigger, scroller: window, trigger, vars: {} },
      ],
    };
    const result = await run();
    expect(result.animations.map((animation) => animation.id)).toStrictEqual([
      "tween1",
    ]);
    expect(result.animations[0]?.scrollTriggerId).toBe("heroTrigger");
    expect(result.scrollTriggers).toStrictEqual([
      {
        animationId: "tween1",
        id: "heroTrigger",
        pin: null,
        trigger: "#hero",
        vars: {
          id: "heroTrigger",
          scrub: true,
          start: "top 80%",
          trigger: { __el: "#hero" },
        },
      },
      {
        animationId: null,
        id: "scrollTrigger2",
        pin: "#hero",
        trigger: "#hero",
        vars: {},
      },
    ]);
  });

  it("guards against circular and oversized values", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    gsap.to("#hero", { data: circular, onStart: longFunction, x: 1 });
    const result = await run({ maxFunctionSource: 10 });
    expect(result.animations[0]?.vars.data).toStrictEqual({
      self: "[Circular]",
    });
    expect(result.animations[0]?.vars.onStart).toStrictEqual({
      __fn: `${longFunction.toString().slice(0, 10)} /* …truncated */`,
    });
  });

  it("lists library scripts and inline GSAP calls", async () => {
    const result = await run();
    expect(result.scripts).toHaveLength(3);
    expect(result.scripts[0]).toMatchObject({
      gsapCallCount: 2,
      library: false,
      snippet: 'gsap.to(".hero-heading", { x: 10 }); gsap.timeline();',
      src: null,
    });
    expect(
      result.scripts.slice(1).every((script) => script.library)
    ).toBeTruthy();
  });
});
