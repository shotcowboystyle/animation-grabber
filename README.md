# GSAP Extractor for Webflow

Browser extension (Chrome + Firefox, Manifest V3) that pulls live GSAP animations out of a Webflow landing page and hands them back as runnable GSAP code, JSON, and the page's own GSAP source snippets.

## How it works

1. **Extract** injects one self-contained function into the page's MAIN world (`scripting.executeScript`, `activeTab` only, no host permissions). It walks `gsap.globalTimeline`, every `ScrollTrigger`, and `document.scripts`, then returns plain data: targets as CSS selectors, `vars` with functions kept as source text, timeline children with positions and labels.
2. **Reload & record** fixes the one blind spot: GSAP removes finished tweens from its global timeline, so intro animations are gone by the time you click. The recorder (a runtime-registered `document_start` content script) sets `gsap.globalTimeline.autoRemoveChildren = false` as soon as the page assigns `window.gsap`, reloads, then extracts. This asks for host access to the current origin only.
3. **Code** view rebuilds `gsap.to / from / fromTo / set`, `gsap.timeline` (with `.add`, `.addLabel`, positions), inline `scrollTrigger` configs and standalone `ScrollTrigger.create` calls. **JSON** is the raw result. **Scripts** lists inline and fetched scripts that reference GSAP.

Limitations: GSAP must be reachable as `window.gsap` (Webflow's CDN embed and Webflow's native GSAP interactions both expose it; a private Vite bundle does not). Functions are captured as source, so closures over page state will not run as-is. Webflow IX2 (non-GSAP) interactions are out of scope.

## Develop

```bash
mise install          # node, pnpm, betterhook, fallow, betterleaks, linters
mise run setup        # pnpm install + git hooks
pnpm dev              # Chrome with HMR (web-ext under the hood)
pnpm dev:firefox
pnpm build && pnpm zip
```

Load `.output/chrome-mv3` as an unpacked extension, or `.output/firefox-mv3` via `about:debugging`.

## Quality gates

`pnpm check` runs everything through turbo:

| Task | Tool |
| --- | --- |
| `typecheck` | `tsc --noEmit` |
| `lint` | ultracite → oxlint (+ `eslint-plugin-github`, `eslint-plugin-sonarjs`, `oxlint-plugin-react-doctor` as JS plugins) |
| `format` | ultracite → oxfmt |
| `test` | vitest (jsdom, real GSAP) |
| `dead-code` | fallow |
| `spell` | cspell |
| `lint:md` / `lint:yaml` / `lint:actions` | markdownlint-cli2 / yamllint / actionlint |
| `secrets` | betterleaks |

`pnpm react-doctor` gives the full React Doctor audit, `pnpm lint:webext` runs Mozilla's `web-ext lint` against the Firefox build. Git hooks live in `betterhook.toml` (pre-commit: format, lint, spell, markdown, yaml, actions, secrets; pre-push: typecheck, test, dead-code).
