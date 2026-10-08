import type {
  AnimationMethod,
  ExtractedAnimation,
  ExtractedScrollTrigger,
  ExtractionResult,
  SerializedValue,
  SerializedVars,
} from "./types";

const INDENT = "  ";
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const NON_IDENTIFIER = /[^\w$]/gu;
const LEADING_DIGIT = /^\d/u;
const RESERVED = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

type Names = Map<string, string>;

interface Context {
  childrenOf: Map<string | null, ExtractedAnimation[]>;
  names: Names;
  /** Animation ids that a ScrollTrigger refers to via `animation:`. */
  referenced: Set<string>;
}

const isRecord = (value: SerializedValue): value is SerializedVars =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatKey = (key: string) =>
  IDENTIFIER.test(key) ? key : JSON.stringify(key);

const toJs = (value: SerializedValue, depth: number, names: Names): string => {
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toJs(item, depth, names)).join(", ")}]`;
  }
  if ("__el" in value && typeof value.__el === "string") {
    return JSON.stringify(value.__el);
  }
  if ("__fn" in value && typeof value.__fn === "string") {
    return value.__fn;
  }
  if ("__anim" in value && typeof value.__anim === "string") {
    return names.get(value.__anim) ?? "undefined";
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }
  const pad = INDENT.repeat(depth + 1);
  const body = entries
    .map(
      ([key, item]) =>
        `${pad}${formatKey(key)}: ${toJs(item, depth + 1, names)}`
    )
    .join(",\n");
  return `{\n${body}\n${INDENT.repeat(depth)}}`;
};

const sanitizeName = (id: string) => {
  let name = id.replaceAll(NON_IDENTIFIER, "_");
  if (LEADING_DIGIT.test(name)) {
    name = `_${name}`;
  }
  if (name === "" || RESERVED.has(name)) {
    name = `${name}_`;
  }
  return name;
};

const assignNames = (animations: ExtractedAnimation[]): Names => {
  const names: Names = new Map();
  const used = new Set<string>();
  for (const animation of animations) {
    const base = sanitizeName(animation.id);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    names.set(animation.id, candidate);
  }
  return names;
};

const groupChildren = (animations: ExtractedAnimation[]) => {
  const childrenOf = new Map<string | null, ExtractedAnimation[]>();
  for (const animation of animations) {
    const siblings = childrenOf.get(animation.parentId) ?? [];
    siblings.push(animation);
    childrenOf.set(animation.parentId, siblings);
  }
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  return childrenOf;
};

/** Keys GSAP adds to `vars` itself for from/fromTo/set calls, with the
 * value they hold when they carry no user intent. */
const BOOKKEEPING: Partial<
  Record<AnimationMethod, Record<string, SerializedValue>>
> = {
  from: { immediateRender: true, runBackwards: 1 },
  fromTo: { immediateRender: true, startAt: "*" },
  set: { duration: 0, repeat: 0 },
};

const cleanVars = (animation: ExtractedAnimation): SerializedVars => {
  const drop = BOOKKEEPING[animation.method] ?? {};
  return Object.fromEntries(
    Object.entries(animation.vars).filter(([key, value]) => {
      const expected = drop[key];
      return expected === undefined || (expected !== "*" && expected !== value);
    })
  );
};

const targetsArg = (targets: string[]) =>
  targets.length === 1
    ? JSON.stringify(targets[0])
    : `[${targets.map((target) => JSON.stringify(target)).join(", ")}]`;

const tweenArgs = (animation: ExtractedAnimation, names: Names) => {
  const vars = cleanVars(animation);
  const args = [targetsArg(animation.targets)];
  if (animation.method === "fromTo") {
    const { startAt } = animation.vars;
    args.push(
      toJs(startAt !== undefined && isRecord(startAt) ? startAt : {}, 0, names)
    );
  }
  args.push(toJs(vars, 0, names));
  return args;
};

const emitTween = (
  animation: ExtractedAnimation,
  context: Context,
  owner: string | null
): string => {
  const args = tweenArgs(animation, context.names);
  if (owner === null) {
    const call = `gsap.${animation.method}(${args.join(", ")});`;
    return context.referenced.has(animation.id)
      ? `const ${context.names.get(animation.id)} = ${call}`
      : call;
  }
  args.push(String(animation.position ?? 0));
  return `${owner}.${animation.method}(${args.join(", ")});`;
};

const emitAnimation = (
  animation: ExtractedAnimation,
  context: Context,
  owner: string | null
): string[] => {
  if (animation.kind === "tween") {
    return [emitTween(animation, context, owner)];
  }
  const name = context.names.get(animation.id) ?? sanitizeName(animation.id);
  const lines = [
    `const ${name} = gsap.timeline(${toJs(animation.vars, 0, context.names)});`,
  ];
  const labels = Object.entries(animation.labels).toSorted(
    ([, a], [, b]) => a - b
  );
  for (const [label, time] of labels) {
    lines.push(`${name}.addLabel(${JSON.stringify(label)}, ${String(time)});`);
  }
  for (const child of context.childrenOf.get(animation.id) ?? []) {
    lines.push(...emitAnimation(child, context, name));
  }
  if (owner !== null) {
    lines.push(`${owner}.add(${name}, ${String(animation.position ?? 0)});`);
  }
  return lines;
};

/** Triggers that were not created inline through a tween's `scrollTrigger` key. */
const standaloneTriggers = (result: ExtractionResult) => {
  const byId = new Map(
    result.animations.map((animation) => [animation.id, animation])
  );
  return result.scrollTriggers.filter((trigger) => {
    const animation =
      trigger.animationId === null ? undefined : byId.get(trigger.animationId);
    return animation?.vars.scrollTrigger === undefined;
  });
};

const emitScrollTrigger = (trigger: ExtractedScrollTrigger, names: Names) => {
  const vars: SerializedVars = { ...trigger.vars };
  if (trigger.animationId !== null) {
    vars.animation = { __anim: trigger.animationId };
  }
  return `ScrollTrigger.create(${toJs(vars, 0, names)});`;
};

const usesScrollTrigger = (result: ExtractionResult) =>
  result.scrollTriggers.length > 0 ||
  result.gsap.plugins.includes("ScrollTrigger") ||
  result.animations.some(
    (animation) => animation.vars.scrollTrigger !== undefined
  );

/** Turn an extraction result back into runnable GSAP code. */
export const toGsapCode = (result: ExtractionResult): string => {
  const triggers = standaloneTriggers(result);
  const context: Context = {
    childrenOf: groupChildren(result.animations),
    names: assignNames(result.animations),
    referenced: new Set(
      triggers.flatMap((trigger) =>
        trigger.animationId === null ? [] : [trigger.animationId]
      )
    ),
  };
  const versionSuffix = result.gsap.version
    ? ` · GSAP ${result.gsap.version}`
    : "";
  const lines = [
    `// GSAP animations extracted from ${result.url}`,
    `// ${result.extractedAt}${versionSuffix}`,
    "",
  ];
  if (usesScrollTrigger(result)) {
    lines.push("gsap.registerPlugin(ScrollTrigger);", "");
  }
  if (result.animations.length === 0) {
    lines.push("// No live GSAP animations were found on the page.", "");
  }
  for (const root of context.childrenOf.get(null) ?? []) {
    lines.push(...emitAnimation(root, context, null), "");
  }
  for (const trigger of triggers) {
    lines.push(emitScrollTrigger(trigger, context.names), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
};

/** Human-readable dump of the scanned page scripts. */
export const scriptsToText = (result: ExtractionResult): string => {
  if (result.scripts.length === 0) {
    return "// No scripts referencing GSAP were found.\n";
  }
  return result.scripts
    .map((script) => {
      const label = script.src ?? "inline <script>";
      if (script.library) {
        return `// library: ${label}`;
      }
      if (script.error !== undefined) {
        return `// unreadable: ${label} (${script.error})`;
      }
      return `// ${label} — ${script.gsapCallCount} GSAP call(s), ${script.size} chars\n${script.snippet}`;
    })
    .join("\n\n")
    .concat("\n");
};
