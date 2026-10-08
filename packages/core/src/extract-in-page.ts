import type {
  AnimationMethod,
  ExtractedAnimation,
  ExtractedScrollTrigger,
  ExtractionResult,
  InPageOptions,
  SerializedValue,
  SerializedVars,
  SourceScript,
} from "./types";

/* Structural views of the GSAP objects that live inside the inspected page. */
interface AnimationLike {
  delay: () => number;
  duration: () => number;
  getChildren?: (
    nested?: boolean,
    tweens?: boolean,
    timelines?: boolean
  ) => AnimationLike[];
  labels?: Record<string, number>;
  parent?: AnimationLike | null;
  paused: () => boolean;
  repeat: () => number;
  startTime: () => number;
  targets?: () => unknown[];
  vars: Record<string, unknown>;
  yoyo: () => boolean;
}

interface ScrollTriggerLike {
  animation?: AnimationLike | null;
  pin?: Element | null;
  trigger?: Element | null;
  vars: Record<string, unknown>;
}

interface ScrollTriggerStatic {
  getAll: () => ScrollTriggerLike[];
}

interface GsapLike {
  core: { globals: () => Record<string, unknown> };
  globalTimeline: AnimationLike;
  version: string;
}

interface PageGlobals {
  __gsapExtractorRecording?: boolean;
  gsap?: GsapLike;
  ScrollTrigger?: unknown;
  Webflow?: unknown;
}

/**
 * Runs inside the inspected page's MAIN world through
 * `browser.scripting.executeScript({ func })`. The browser serializes this
 * function with `Function.prototype.toString`, so every helper has to live
 * inside it: no imports, no module-scope values. The accompanying test
 * rebuilds the function from its source text to prove that stays true.
 */
export const extractGsapInPage = async (
  options: InPageOptions
): Promise<ExtractionResult> => {
  const MAX_ANIMATIONS = 2000;
  const MAX_DEPTH = 6;
  const MAX_ARRAY = 100;
  const MAX_SELECTOR_DEPTH = 6;
  const MAX_CLASSES = 3;
  const MAX_SNIPPET_ITEMS = 200;
  const MAX_LINE_LENGTH = 400;
  const MATCH_WINDOW = 300;
  const MAX_FULL_SCRIPT = 20_000;
  const MINIFIED_LINE_COUNT = 5;
  const FETCH_TIMEOUT_MS = 8000;
  const PRECISION = 1000;
  const GSAP_CALL_SOURCE =
    "\\b(?:gsap|TweenMax|TweenLite)\\.(?:to|from|fromTo|set|timeline|matchMedia|registerPlugin|context|delayedCall|quickTo|utils)\\b|\\b(?:ScrollTrigger|Flip|SplitText|Draggable|Observer)\\.(?:create|batch|from|to|fromTo|fit)\\b";
  const GSAP_CALL_GLOBAL = new RegExp(GSAP_CALL_SOURCE, "gu");
  const GSAP_CALL_LINE = new RegExp(GSAP_CALL_SOURCE, "u");
  const LIBRARY_URL =
    /gsap|scrolltrigger|splittext|flip\.min|draggable|observer\.min|morphsvg|drawsvg|motionpath|customease|scrollsmoother/iu;
  const LEGACY_GLOBALS = new Set([
    "gsap",
    "TweenLite",
    "TweenMax",
    "TimelineLite",
    "TimelineMax",
  ]);
  const SCRIPT_TYPES = new Set([
    "",
    "text/javascript",
    "application/javascript",
    "module",
  ]);

  const page = globalThis as unknown as PageGlobals;
  const { gsap } = page;
  const warnings: string[] = [];
  const round = (value: number) => Math.round(value * PRECISION) / PRECISION;

  // ── Selectors ────────────────────────────────────────────────────────
  const isElement = (value: unknown): value is Element =>
    value instanceof Element;

  const isUnique = (selector: string, expected = 1) => {
    try {
      return document.querySelectorAll(selector).length === expected;
    } catch {
      // A selector built from unusual class names can be invalid; treat it
      // as non-unique so the caller keeps widening it.
      return false;
    }
  };

  const classSelector = (element: Element) =>
    [...element.classList]
      .filter((name) => !name.startsWith("w-"))
      .slice(0, MAX_CLASSES)
      .map((name) => `.${CSS.escape(name)}`)
      .join("");

  const segmentFor = (element: Element) => {
    const base = `${element.tagName.toLowerCase()}${classSelector(element)}`;
    const parent = element.parentElement;
    if (!parent) {
      return base;
    }
    const siblings = [...parent.children];
    const same = siblings.filter((sibling) => sibling.matches(base));
    return same.length > 1
      ? `${base}:nth-child(${siblings.indexOf(element) + 1})`
      : base;
  };

  const selectorFor = (element: Element): string => {
    if (element === document.documentElement) {
      return "html";
    }
    if (element === document.body) {
      return "body";
    }
    if (element.id) {
      const idSelector = `#${CSS.escape(element.id)}`;
      if (isUnique(idSelector)) {
        return idSelector;
      }
    }
    const parts: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== document.documentElement &&
      parts.length < MAX_SELECTOR_DEPTH
    ) {
      parts.unshift(segmentFor(current));
      const candidate = parts.join(" > ");
      if (isUnique(candidate)) {
        return candidate;
      }
      current = current.parentElement;
    }
    return parts.join(" > ");
  };

  const describeTarget = (value: unknown): string => {
    if (isElement(value)) {
      return selectorFor(value);
    }
    if (value === globalThis) {
      return "window";
    }
    if (value === document) {
      return "document";
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value).slice(0, MAX_CLASSES).join(", ")}}`;
    }
    return String(value);
  };

  /** A single selector that matches exactly the given elements, if one exists. */
  const sharedSelector = (elements: Element[]): string | null => {
    const [first] = elements;
    if (!first) {
      return null;
    }
    const matchesAll = (selector: string) =>
      isUnique(selector, elements.length) &&
      elements.every((element) => element.matches(selector));
    const shared = [...first.classList].filter(
      (name) =>
        !name.startsWith("w-") &&
        elements.every((element) => element.classList.contains(name))
    );
    for (const name of shared) {
      const selector = `.${CSS.escape(name)}`;
      if (matchesAll(selector)) {
        return selector;
      }
    }
    return null;
  };

  const describeTargets = (targets: unknown[]): string[] => {
    if (targets.length > 1 && targets.every((target) => isElement(target))) {
      const shared = sharedSelector(targets);
      if (shared) {
        return [shared];
      }
    }
    return targets.map((target) => describeTarget(target));
  };

  // ── Animation registry ───────────────────────────────────────────────
  const ids = new Map<object, string>();
  const usedIds = new Set<string>();
  const isTimeline = (animation: AnimationLike) =>
    typeof animation.getChildren === "function";

  const uniqueId = (base: string) => {
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const register = (animation: AnimationLike, index: number) => {
    const given = animation.vars.id;
    const fallback = `${isTimeline(animation) ? "timeline" : "tween"}${index + 1}`;
    const base =
      typeof given === "string" && given.length > 0 ? given : fallback;
    ids.set(animation, uniqueId(base));
  };

  // ── Serialization ────────────────────────────────────────────────────
  const seen = new WeakSet<object>();

  const serializeFunction = (fn: unknown): SerializedValue => {
    const source = Function.prototype.toString.call(fn);
    const max = options.maxFunctionSource;
    return {
      __fn:
        source.length > max
          ? `${source.slice(0, max)} /* …truncated */`
          : source,
    };
  };

  const isScrollTriggerInstance = (value: object): value is ScrollTriggerLike =>
    "vars" in value && "trigger" in value && "scroller" in value;

  const serializePrimitive = (value: unknown): SerializedValue | undefined => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "function") {
      return serializeFunction(value);
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : String(value);
    }
    if (typeof value === "string" || typeof value === "boolean") {
      return value;
    }
    if (typeof value !== "object") {
      return String(value);
    }
    return undefined;
  };

  const serialize = (value: unknown, depth: number): SerializedValue => {
    const primitive = serializePrimitive(value);
    if (
      primitive !== undefined ||
      typeof value !== "object" ||
      value === null
    ) {
      return primitive ?? null;
    }
    if (isElement(value) || value === globalThis || value === document) {
      return { __el: describeTarget(value) };
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY)
        .map((item: unknown) => serialize(item, depth + 1));
    }
    const source = isScrollTriggerInstance(value) ? value.vars : value;
    const animationId = ids.get(source);
    if (animationId !== undefined) {
      return { __anim: animationId };
    }
    if (seen.has(source)) {
      return "[Circular]";
    }
    if (depth >= MAX_DEPTH) {
      return "[Object]";
    }
    seen.add(source);
    const out: SerializedVars = {};
    for (const [key, item] of Object.entries(source)) {
      if (item !== undefined) {
        out[key] = serialize(item, depth + 1);
      }
    }
    seen.delete(source);
    return out;
  };

  const serializeVars = (vars: Record<string, unknown>): SerializedVars => {
    const out: SerializedVars = {};
    for (const [key, item] of Object.entries(vars)) {
      if (item !== undefined) {
        out[key] = serialize(item, 1);
      }
    }
    return out;
  };

  // ── Animations ───────────────────────────────────────────────────────
  const methodFor = (animation: AnimationLike): AnimationMethod => {
    if (isTimeline(animation)) {
      return "timeline";
    }
    const { vars } = animation;
    if (vars.runBackwards) {
      return "from";
    }
    if (vars.startAt !== undefined) {
      return "fromTo";
    }
    if (vars.duration === 0) {
      return "set";
    }
    return "to";
  };

  const describeAnimation = (
    animation: AnimationLike,
    parentId: string | null
  ): ExtractedAnimation => {
    const timeline = isTimeline(animation);
    const delay = animation.delay();
    const targets =
      timeline || typeof animation.targets !== "function"
        ? []
        : describeTargets(animation.targets());
    return {
      delay: round(delay),
      duration: round(animation.duration()),
      id: ids.get(animation) ?? "",
      kind: timeline ? "timeline" : "tween",
      labels: { ...animation.labels },
      method: methodFor(animation),
      parentId,
      paused: animation.paused(),
      position: parentId === null ? null : round(animation.startTime() - delay),
      repeat: animation.repeat(),
      scrollTriggerId: null,
      targets,
      vars: serializeVars(animation.vars),
      yoyo: animation.yoyo(),
    };
  };

  const hasGetAll = (candidate: unknown): candidate is ScrollTriggerStatic => {
    if (!candidate) {
      return false;
    }
    const callable =
      typeof candidate === "object" || typeof candidate === "function";
    return (
      callable &&
      "getAll" in candidate &&
      typeof candidate.getAll === "function"
    );
  };

  const scrollTriggerStatic = (): ScrollTriggerStatic | null => {
    const candidate = gsap?.core.globals().ScrollTrigger ?? page.ScrollTrigger;
    return hasGetAll(candidate) ? candidate : null;
  };

  const liveScrollTriggers = (): ScrollTriggerLike[] => {
    const statics = scrollTriggerStatic();
    return statics ? statics.getAll() : [];
  };

  const childrenOf = (animation: AnimationLike): AnimationLike[] =>
    animation.getChildren?.(true, true, true) ?? [];

  /** `gsap.delayedCall` tweens target a function; GSAP and ScrollTrigger
   * schedule them internally and they carry no page animation. */
  const isDelayedCall = (animation: AnimationLike) => {
    const targets =
      typeof animation.targets === "function" ? animation.targets() : [];
    return (
      targets.length > 0 &&
      targets.every((target) => typeof target === "function")
    );
  };

  /** Root children plus animations only ScrollTrigger still references. */
  const candidateAnimations = (): AnimationLike[] => {
    if (!gsap) {
      return [];
    }
    const ordered = new Set(
      childrenOf(gsap.globalTimeline).filter(
        (animation) => !isDelayedCall(animation)
      )
    );
    for (const trigger of liveScrollTriggers()) {
      const { animation } = trigger;
      if (animation && !ordered.has(animation)) {
        ordered.add(animation);
        for (const child of childrenOf(animation)) {
          ordered.add(child);
        }
      }
    }
    const all = [...ordered];
    if (all.length > MAX_ANIMATIONS) {
      warnings.push(
        `Found ${all.length} animations; only the first ${MAX_ANIMATIONS} were extracted.`
      );
    }
    return all.slice(0, MAX_ANIMATIONS);
  };

  const collectAnimations = (): ExtractedAnimation[] => {
    const candidates = candidateAnimations();
    for (const [index, animation] of candidates.entries()) {
      register(animation, index);
    }
    return candidates.map((animation) => {
      const parent = animation.parent ?? null;
      const parentId =
        parent && parent !== gsap?.globalTimeline
          ? (ids.get(parent) ?? null)
          : null;
      return describeAnimation(animation, parentId);
    });
  };

  const collectScrollTriggers = (
    animations: ExtractedAnimation[]
  ): ExtractedScrollTrigger[] => {
    const byId = new Map(
      animations.map((animation) => [animation.id, animation])
    );
    return liveScrollTriggers().map((trigger, index) => {
      const animationId = trigger.animation
        ? (ids.get(trigger.animation) ?? null)
        : null;
      const givenId = trigger.vars.id;
      const id = uniqueId(
        typeof givenId === "string" && givenId.length > 0
          ? givenId
          : `scrollTrigger${index + 1}`
      );
      const linked = animationId === null ? undefined : byId.get(animationId);
      if (linked) {
        linked.scrollTriggerId = id;
      }
      return {
        animationId,
        id,
        pin: isElement(trigger.pin) ? selectorFor(trigger.pin) : null,
        trigger: isElement(trigger.trigger)
          ? selectorFor(trigger.trigger)
          : null,
        vars: serializeVars(trigger.vars),
      };
    });
  };

  // ── Source scripts ───────────────────────────────────────────────────
  const emptyScript = (src: string | null): SourceScript => ({
    gsapCallCount: 0,
    library: false,
    size: 0,
    snippet: "",
    src,
  });

  const excerpt = (text: string, matches: RegExpExecArray[]): string => {
    const lines = text.split("\n");
    if (lines.length < MINIFIED_LINE_COUNT) {
      return matches
        .slice(0, MAX_SNIPPET_ITEMS)
        .map((match) =>
          text.slice(match.index, match.index + MATCH_WINDOW).trim()
        )
        .join("\n/* … */\n");
    }
    return lines
      .filter((line) => GSAP_CALL_LINE.test(line))
      .slice(0, MAX_SNIPPET_ITEMS)
      .map((line) => line.trim().slice(0, MAX_LINE_LENGTH))
      .join("\n");
  };

  const analyzeScript = (src: string | null, text: string): SourceScript => {
    const matches = [...text.matchAll(GSAP_CALL_GLOBAL)];
    let snippet = "";
    if (matches.length > 0) {
      snippet =
        src === null && text.length <= MAX_FULL_SCRIPT
          ? text.trim()
          : excerpt(text, matches);
    }
    return {
      gsapCallCount: matches.length,
      library: false,
      size: text.length,
      snippet,
      src,
    };
  };

  const fetchScript = async (src: string): Promise<SourceScript> => {
    try {
      const response = await fetch(src, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { ...emptyScript(src), error: `HTTP ${response.status}` };
      }
      return analyzeScript(src, await response.text());
    } catch (error) {
      // Cross-origin, blocked, or offline scripts cannot be read from the
      // page. Report that on the script entry instead of failing the run.
      return {
        ...emptyScript(src),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const isReportableHost = (src: string) => {
    try {
      const { host } = new URL(src, location.href);
      return host === location.host || host.endsWith("website-files.com");
    } catch {
      // Malformed script URL: nothing useful to report about it.
      return false;
    }
  };

  const collectScripts = async (): Promise<SourceScript[]> => {
    const tasks: Promise<SourceScript>[] = [];
    for (const script of document.scripts) {
      if (!SCRIPT_TYPES.has(script.type.trim().toLowerCase())) {
        continue;
      }
      const { src } = script;
      if (src === "") {
        tasks.push(
          Promise.resolve(analyzeScript(null, script.textContent ?? ""))
        );
      } else if (LIBRARY_URL.test(src)) {
        tasks.push(Promise.resolve({ ...emptyScript(src), library: true }));
      } else if (options.fetchExternalScripts) {
        tasks.push(fetchScript(src));
      }
    }
    const scripts = await Promise.all(tasks);
    const isRelevant = (script: SourceScript) => {
      if (script.library || script.gsapCallCount > 0) {
        return true;
      }
      return (
        script.error !== undefined &&
        script.src !== null &&
        isReportableHost(script.src)
      );
    };
    return scripts.filter((script) => isRelevant(script));
  };

  // ── Page metadata ────────────────────────────────────────────────────
  const detectWebflow = (): ExtractionResult["webflow"] => {
    const html = document.documentElement;
    const siteId = html.dataset.wfSite ?? null;
    const generator =
      document
        .querySelector('meta[name="generator"]')
        ?.getAttribute("content") ?? "";
    return {
      detected:
        siteId !== null ||
        generator.toLowerCase().includes("webflow") ||
        page.Webflow !== undefined,
      pageId: html.dataset.wfPage ?? null,
      siteId,
    };
  };

  const detectGsap = (): ExtractionResult["gsap"] => {
    const recording = page.__gsapExtractorRecording === true;
    if (!gsap) {
      return { detected: false, plugins: [], recording, version: null };
    }
    const isPlugin = (name: string, value: unknown) => {
      if (LEGACY_GLOBALS.has(name) || value === null) {
        return false;
      }
      const callable = typeof value === "object" || typeof value === "function";
      return callable && "version" in value;
    };
    const plugins: string[] = [];
    for (const [name, value] of Object.entries(gsap.core.globals())) {
      if (isPlugin(name, value)) {
        plugins.push(name);
      }
    }
    return { detected: true, plugins, recording, version: gsap.version };
  };

  // ── Run ──────────────────────────────────────────────────────────────
  if (!gsap) {
    warnings.push(
      "window.gsap is not defined. GSAP may be bundled privately, or the page may not use GSAP at all. Script scan results are still listed."
    );
  }
  const animations = collectAnimations();
  const scrollTriggers = collectScrollTriggers(animations);
  const scripts = await collectScripts();

  return {
    animations,
    extractedAt: new Date().toISOString(),
    gsap: detectGsap(),
    scripts,
    scrollTriggers,
    title: document.title,
    url: location.href,
    warnings,
    webflow: detectWebflow(),
  };
};
