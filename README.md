# Animation Grabber

<img src="brand/logo/ag-horizontal-primary.svg" alt="Animation Grabber" width="420" />

Point at any page that uses GSAP. Get its GSAP back. Animation Grabber pulls the live GSAP tweens, timelines and ScrollTriggers out of a page and hands them to you, or your coding agent, as runnable code, JSON, or the page's own GSAP source snippets.

Three ways to grab:

| Surface | Where | What |
| --- | --- | --- |
| Chrome / Firefox extension | [`apps/extension`](apps/extension) | Point-and-click. Extract, Reload & record, copy or download. |
| CLI | [`apps/cli`](apps/cli) · `npx animation-grabber <url>` | Headless Chromium with the recorder attached from the first byte. |
| Agent skill | [`skills/animation-grabber`](skills/animation-grabber) · `npx skills add shotcowboystyle/animation-grabber` | `/animation-grabber <url>` in Claude Code. |

Marketing site: [`apps/web`](apps/web). Brand assets and guidelines: [`brand/`](brand/README.md).

## How it works

1. **Extract** runs one self-contained function inside the page's MAIN world (`scripting.executeScript` in the extension, `page.evaluate` in the CLI). It walks `gsap.globalTimeline`, every `ScrollTrigger`, and `document.scripts`, then returns plain data: targets as CSS selectors, `vars` with functions kept as source text, timeline children with positions and labels.
2. **Record** fixes the one blind spot: GSAP removes finished tweens from its global timeline, so intro animations are gone by the time you click. The recorder sets `gsap.globalTimeline.autoRemoveChildren = false` as soon as the page assigns `window.gsap`. The extension registers it as a `document_start` content script for the current origin and reloads; the CLI injects it with `addInitScript` before navigation.
3. **Codegen** rebuilds `gsap.to / from / fromTo / set`, `gsap.timeline` (with `.add`, `.addLabel`, positions), inline `scrollTrigger` configs and standalone `ScrollTrigger.create` calls.

Limitations: GSAP must be reachable as `window.gsap` (script-tag and CDN setups expose it, as do Webflow's native GSAP interactions; a private Vite or webpack bundle does not, though the Scripts view still shows the bundle's GSAP calls). Functions are captured as source, so closures over page state will not run as-is. Non-GSAP animation systems (CSS, Lottie, Webflow IX2) are out of scope.

## Repository

pnpm workspaces + Turborepo.

```text
apps/
  cli/         animation-grabber on npm (tsdown, playwright)
  extension/   WXT + React, MV3 for Chrome and Firefox
  web/         static landing page (Vite)
packages/
  core/        in-page extractor, recorder, codegen, types (shared, private)
skills/
  animation-grabber/   SKILL.md for Claude Code and other agents
brand/         logo SVGs and brand guidelines
```

## Develop

```bash
mise install          # node, pnpm, betterhook, fallow, betterleaks, linters
mise run setup        # pnpm install + git hooks
pnpm dev              # every package in watch mode (turbo)
pnpm --filter @animation-grabber/extension dev   # Chrome with HMR
pnpm --filter @animation-grabber/web dev         # landing page
pnpm build            # extension (.output/), CLI (dist/), web (dist/)
```

Load `apps/extension/.output/chrome-mv3` as an unpacked extension, or `.output/firefox-mv3` via `about:debugging`. Run the CLI from source with `node apps/cli/dist/cli.mjs <url>` after a build; it needs Chromium (`npx playwright install chromium`) or an installed Google Chrome.

## Quality gates

`pnpm check` runs everything through turbo: `typecheck` and `test` per package, plus the repo-wide root tasks.

| Task | Tool |
| --- | --- |
| `typecheck` | `tsc --noEmit` in each package |
| `test` | vitest (core: jsdom + real GSAP; cli: option parsing) |
| `lint` | ultracite → oxlint (+ `eslint-plugin-github`, `eslint-plugin-sonarjs`, `oxlint-plugin-react-doctor` as JS plugins) |
| `format` | ultracite → oxfmt |
| `dead-code` | fallow |
| `spell` | cspell |
| `lint:md` / `lint:yaml` / `lint:actions` | markdownlint-cli2 / yamllint / actionlint |
| `secrets` | betterleaks |

`pnpm turbo run lint:webext` runs Mozilla's `web-ext lint` against the Firefox build; `pnpm --filter @animation-grabber/extension react-doctor` gives the full React Doctor audit. Git hooks live in `betterhook.toml`.

## License

[MIT](LICENSE)
