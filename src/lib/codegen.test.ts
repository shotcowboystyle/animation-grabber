import { describe, expect, it } from "vitest";

import { scriptsToText, toGsapCode } from "./codegen";
import type { ExtractedAnimation, ExtractionResult } from "./types";

const animation = (
  overrides: Partial<ExtractedAnimation> & Pick<ExtractedAnimation, "id">
): ExtractedAnimation => ({
  delay: 0,
  duration: 1,
  kind: "tween",
  labels: {},
  method: "to",
  parentId: null,
  paused: false,
  position: null,
  repeat: 0,
  scrollTriggerId: null,
  targets: ["#hero"],
  vars: {},
  yoyo: false,
  ...overrides,
});

const result = (
  overrides: Partial<ExtractionResult> = {}
): ExtractionResult => ({
  animations: [],
  extractedAt: "2026-10-08T12:00:00.000Z",
  gsap: { detected: true, plugins: [], recording: false, version: "3.15.0" },
  scripts: [],
  scrollTriggers: [],
  title: "Landing",
  url: "https://example.webflow.io/",
  warnings: [],
  webflow: { detected: true, pageId: null, siteId: "site" },
  ...overrides,
});

const withTriggers = () =>
  result({
    animations: [
      animation({ id: "fade", scrollTriggerId: "st1", vars: { opacity: 1 } }),
      animation({
        id: "inline",
        scrollTriggerId: "st2",
        vars: {
          scrollTrigger: { start: "top", trigger: { __el: "#hero" } },
          x: 1,
        },
      }),
    ],
    scrollTriggers: [
      {
        animationId: "fade",
        id: "st1",
        pin: null,
        trigger: "#hero",
        vars: { scrub: true, trigger: { __el: "#hero" } },
      },
      {
        animationId: "inline",
        id: "st2",
        pin: null,
        trigger: "#hero",
        vars: { start: "top", trigger: { __el: "#hero" } },
      },
      {
        animationId: null,
        id: "st3",
        pin: null,
        trigger: null,
        vars: { "data-x": 1 },
      },
    ],
  });

describe(toGsapCode, () => {
  it("emits a header and a note when nothing was found", () => {
    expect(toGsapCode(result())).toBe(
      [
        "// GSAP animations extracted from https://example.webflow.io/",
        "// 2026-10-08T12:00:00.000Z · GSAP 3.15.0",
        "",
        "// No live GSAP animations were found on the page.",
        "",
      ].join("\n")
    );
  });

  it("emits root tweens, stripping from/fromTo/set bookkeeping", () => {
    const code = toGsapCode(
      result({
        animations: [
          animation({
            id: "a",
            method: "from",
            vars: { immediateRender: true, opacity: 0, runBackwards: 1 },
          }),
          animation({
            id: "b",
            method: "fromTo",
            targets: [".x", ".y"],
            vars: { immediateRender: false, startAt: { y: 10 }, y: 0 },
          }),
          animation({
            id: "c",
            method: "set",
            vars: { duration: 0, repeat: 0, visibility: "visible" },
          }),
        ],
      })
    );
    expect(code).toContain('gsap.from("#hero", {\n  opacity: 0\n});');
    expect(code).toContain(
      'gsap.fromTo([".x", ".y"], {\n  y: 10\n}, {\n  immediateRender: false,\n  y: 0\n});'
    );
    expect(code).toContain('gsap.set("#hero", {\n  visibility: "visible"\n});');
  });

  it("nests timelines with positions, labels and function sources", () => {
    const code = toGsapCode(
      result({
        animations: [
          animation({
            id: "intro",
            kind: "timeline",
            labels: { end: 2, start: 0 },
            method: "timeline",
            targets: [],
            vars: { id: "intro", onComplete: { __fn: "() => done()" } },
          }),
          animation({
            id: "tween1",
            parentId: "intro",
            position: 0.5,
            vars: { x: 10 },
          }),
          animation({
            id: "inner",
            kind: "timeline",
            method: "timeline",
            parentId: "intro",
            position: 1,
            targets: [],
          }),
          animation({
            id: "tween2",
            parentId: "inner",
            position: 0,
            targets: ["#a"],
            vars: { ease: { __fn: "function (t) { return t; }" }, y: 1 },
          }),
        ],
      })
    );
    expect(code).toBe(
      [
        "// GSAP animations extracted from https://example.webflow.io/",
        "// 2026-10-08T12:00:00.000Z · GSAP 3.15.0",
        "",
        "const intro = gsap.timeline({",
        '  id: "intro",',
        "  onComplete: () => done()",
        "});",
        'intro.addLabel("start", 0);',
        'intro.addLabel("end", 2);',
        'intro.to("#hero", {',
        "  x: 10",
        "}, 0.5);",
        "const inner = gsap.timeline({});",
        'inner.to("#a", {',
        "  ease: function (t) { return t; },",
        "  y: 1",
        "}, 0);",
        "intro.add(inner, 1);",
        "",
      ].join("\n")
    );
  });

  it("emits standalone ScrollTriggers that reference their animations", () => {
    const code = toGsapCode(withTriggers());
    expect(code).toContain("gsap.registerPlugin(ScrollTrigger);");
    expect(code).toContain(
      'const fade = gsap.to("#hero", {\n  opacity: 1\n});'
    );
    expect(code).toContain(
      'ScrollTrigger.create({\n  scrub: true,\n  trigger: "#hero",\n  animation: fade\n});'
    );
    expect(code).toContain('ScrollTrigger.create({\n  "data-x": 1\n});');
  });

  it("keeps inline scrollTrigger configs on the tween", () => {
    const code = toGsapCode(withTriggers());
    expect(code).toContain(
      'gsap.to("#hero", {\n  scrollTrigger: {\n    start: "top",\n    trigger: "#hero"\n  },\n  x: 1\n});'
    );
    expect(code).not.toContain("animation: inline");
  });

  it("sanitizes awkward ids into variable names", () => {
    const code = toGsapCode(
      result({
        animations: [
          animation({
            id: "1 hero-tl",
            kind: "timeline",
            method: "timeline",
            targets: [],
          }),
          animation({
            id: "class",
            kind: "timeline",
            method: "timeline",
            targets: [],
          }),
          animation({
            id: "class_",
            kind: "timeline",
            method: "timeline",
            targets: [],
          }),
        ],
      })
    );
    expect(code).toContain("const _1_hero_tl = gsap.timeline({});");
    expect(code).toContain("const class_ = gsap.timeline({});");
    expect(code).toContain("const class_2 = gsap.timeline({});");
  });
});

describe(scriptsToText, () => {
  it("describes library, unreadable and matched scripts", () => {
    const text = scriptsToText(
      result({
        scripts: [
          {
            gsapCallCount: 0,
            library: true,
            size: 0,
            snippet: "",
            src: "https://cdn/gsap.min.js",
          },
          {
            error: "HTTP 403",
            gsapCallCount: 0,
            library: false,
            size: 0,
            snippet: "",
            src: "https://cdn/app.js",
          },
          {
            gsapCallCount: 1,
            library: false,
            size: 20,
            snippet: "gsap.to('.a', {})",
            src: null,
          },
        ],
      })
    );
    expect(text).toBe(
      [
        "// library: https://cdn/gsap.min.js",
        "",
        "// unreadable: https://cdn/app.js (HTTP 403)",
        "",
        "// inline <script> — 1 GSAP call(s), 20 chars",
        "gsap.to('.a', {})",
        "",
      ].join("\n")
    );
    expect(scriptsToText(result())).toBe(
      "// No scripts referencing GSAP were found.\n"
    );
  });
});
