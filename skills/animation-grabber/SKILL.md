---
name: animation-grabber
description: Grab the live GSAP tweens, timelines and ScrollTriggers from any Webflow (or other GSAP-powered) page as runnable code or JSON, then rebuild them in the user's project. Use when the user wants to clone, replicate, reference or port a website's animations. Triggers include "grab the animations from", "how is this page animated", "copy the GSAP from", "recreate this scroll animation", "extract the ScrollTrigger setup", or any task where the user points at a live site whose motion they want to reproduce.
user-invocable: true
argument-hint: <url> [code|json|scripts]
allowed-tools: Bash(npx animation-grabber:*), Bash(animation-grabber:*)
---

# Animation Grabber

Capture the GSAP animations running on a live page and output runnable GSAP code, raw JSON, or the page's own GSAP source snippets.

## Arguments

`$ARGUMENTS` is parsed as `<url> [format]`.

- First argument: the page URL (required).
- Second argument: `code` (default), `json`, or `scripts`.

If no URL is given, ask the user for one.

## Workflow

1. Run the CLI. It opens the page in headless Chromium with a recorder attached from the first byte, so load-time intro animations are kept.

   ```bash
   npx animation-grabber "<url>"
   ```

   For structured data instead of code:

   ```bash
   npx animation-grabber "<url>" --format json
   ```

   For the page's own GSAP calls as written by its author:

   ```bash
   npx animation-grabber "<url>" --format scripts
   ```

2. Read the summary line on stderr (GSAP version, animation / ScrollTrigger / script counts) and any `warning:` lines.
   - `window.gsap is not defined`: the site bundles GSAP privately. Fall back to `--format scripts` and reason from the source snippets.
   - Zero animations but a GSAP version: the page builds its animations after an interaction (hover, click, scroll). Re-run with `--wait 3000` and say what was not captured.

3. Hand the result to the user, or rebuild it in their project:
   - Map the captured CSS selectors onto the user's own markup. Selectors describe the source page, not theirs.
   - Keep `vars` values (durations, eases, `stagger`, `scrollTrigger` start/end) exactly as captured; those are the design.
   - Functions in `vars` are captured as source text. Closures over page state will not run as-is; adapt them.
   - Register plugins the output uses (`gsap.registerPlugin(ScrollTrigger)` is emitted when needed).

## Options

| Flag | Effect |
| --- | --- |
| `-f, --format <code\|json\|scripts>` | Output format (default `code`) |
| `-o, --out <file>` | Write to a file instead of stdout |
| `-w, --wait <ms>` | Extra settle time after load (default 750) |
| `--no-record` | Skip the load-time recorder |
| `--no-scripts` | Do not fetch and scan external scripts |
| `--headed` | Show the browser window |

## Requirements

Chromium through Playwright. If the CLI reports no browser, run:

```bash
npx playwright install chromium
```

## Limits

- Only GSAP exposed as `window.gsap` is read live. Webflow's CDN embed and Webflow's native GSAP interactions both qualify.
- Webflow IX2 (non-GSAP) interactions are out of scope.
- Everything runs locally; nothing is uploaded.
