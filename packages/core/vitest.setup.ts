// jsdom ships no `CSS.escape`; the extractor relies on it for selectors.
const escapeCss = (value: string) =>
  value.replaceAll(/[^\w-]/gu, (c) => `\\${c}`);

if (globalThis.CSS === undefined) {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: escapeCss },
  });
} else if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = escapeCss;
}
