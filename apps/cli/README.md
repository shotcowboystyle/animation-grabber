# Animation Grabber

<img src="https://raw.githubusercontent.com/shotcowboystyle/animation-grabber/main/brand/logo/ag-stacked-primary.svg" width="160" alt="" align="right" />

Grab the live GSAP tweens, timelines and ScrollTriggers from any Webflow page as runnable code. Built for AI coding agents.

## Usage

```bash
npx animation-grabber <url> [options]
```

```bash
npx animation-grabber https://example.webflow.io
npx animation-grabber https://example.webflow.io --format json -o anim.json
npx animation-grabber https://example.webflow.io --format scripts
```

For frequent use, install globally with `npm install -g animation-grabber`.

| Flag | Effect |
| --- | --- |
| `-f, --format <code\|json\|scripts>` | Output format (default `code`) |
| `-o, --out <file>` | Write to a file instead of stdout |
| `-w, --wait <ms>` | Extra settle time after load (default 750) |
| `--no-record` | Skip the load-time recorder (misses intro tweens) |
| `--no-scripts` | Do not fetch and scan external scripts |
| `--headed` | Show the browser window |

Needs Chromium through Playwright: `npx playwright install chromium` (an installed Google Chrome also works).

## How it works

The page is opened in headless Chromium with a recorder injected before any page script runs. The recorder sets `gsap.globalTimeline.autoRemoveChildren = false` the moment the page assigns `window.gsap`, so intro animations that would normally be discarded are still there when the extractor walks `gsap.globalTimeline`, every `ScrollTrigger`, and `document.scripts`.

## Output

- **code**: `gsap.to / from / fromTo / set`, `gsap.timeline` with labels and positions, inline `scrollTrigger` configs and standalone `ScrollTrigger.create` calls.
- **json**: the raw extraction: targets as CSS selectors, `vars` with functions kept as source text, timeline parent/child structure, ScrollTrigger links, page scripts that reference GSAP.
- **scripts**: inline and fetched scripts that call GSAP, excerpted.

## Agent skill

```bash
npx skills add shotcowboystyle/animation-grabber
```

```text
/animation-grabber https://example.webflow.io
```

## Privacy

Everything runs on your machine. Nothing is uploaded.

## License

MIT
