/** Marker objects used when serializing GSAP `vars` out of the page. */
export interface SerializedElement {
  __el: string;
}

export interface SerializedFunction {
  __fn: string;
}

export interface SerializedAnimationRef {
  __anim: string;
}

export type SerializedValue =
  | string
  | number
  | boolean
  | null
  | SerializedElement
  | SerializedFunction
  | SerializedAnimationRef
  | SerializedValue[]
  | { [key: string]: SerializedValue };

export type SerializedVars = Record<string, SerializedValue>;

export type AnimationMethod = "from" | "fromTo" | "set" | "timeline" | "to";

export interface ExtractedAnimation {
  delay: number;
  duration: number;
  id: string;
  kind: "timeline" | "tween";
  /** Timeline labels, keyed by name. Always empty for tweens. */
  labels: Record<string, number>;
  method: AnimationMethod;
  /** Id of the parent timeline, or null when parented to the global timeline. */
  parentId: string | null;
  paused: boolean;
  /** Position inside the parent timeline (start time minus delay); null at root. */
  position: number | null;
  repeat: number;
  /** Id of the ScrollTrigger driving this animation, when there is one. */
  scrollTriggerId: string | null;
  /** CSS selectors (or a textual description) for each tween target. */
  targets: string[];
  vars: SerializedVars;
  yoyo: boolean;
}

export interface ExtractedScrollTrigger {
  animationId: string | null;
  id: string;
  pin: string | null;
  trigger: string | null;
  vars: SerializedVars;
}

export interface SourceScript {
  error?: string;
  gsapCallCount: number;
  /** True when the script is the GSAP library itself (or one of its plugins). */
  library: boolean;
  size: number;
  snippet: string;
  /** Script URL, or null for inline scripts. */
  src: string | null;
}

export interface ExtractionResult {
  animations: ExtractedAnimation[];
  extractedAt: string;
  gsap: {
    detected: boolean;
    plugins: string[];
    recording: boolean;
    version: string | null;
  };
  scripts: SourceScript[];
  scrollTriggers: ExtractedScrollTrigger[];
  title: string;
  url: string;
  warnings: string[];
  webflow: {
    detected: boolean;
    pageId: string | null;
    siteId: string | null;
  };
}

export interface InPageOptions {
  /** Fetch same-origin (and Webflow CDN) scripts and scan them for GSAP calls. */
  fetchExternalScripts: boolean;
  /** Longest function source (in characters) kept in serialized vars. */
  maxFunctionSource: number;
}
