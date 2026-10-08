import { parseArgs } from "node:util";

export type Format = "code" | "json" | "scripts";

export interface Options {
  format: Format;
  headed: boolean;
  out: string | null;
  record: boolean;
  scripts: boolean;
  url: string;
  /** Extra settle time after `load`, in milliseconds. */
  wait: number;
}

const FORMATS = new Set<string>(["code", "json", "scripts"]);
const DEFAULT_WAIT_MS = 750;

export const HELP = `animation-grabber <url> [options]

Grab GSAP tweens, timelines and ScrollTriggers from a live page as runnable code.

Options:
  -f, --format <code|json|scripts>  Output format (default: code)
  -o, --out <file>                  Write to a file instead of stdout
  -w, --wait <ms>                   Settle time after load (default: ${DEFAULT_WAIT_MS})
      --no-record                   Skip the load-time recorder (misses intro tweens)
      --no-scripts                  Do not fetch and scan external scripts
      --headed                      Show the browser window
  -h, --help                        Show this help

Examples:
  npx animation-grabber https://example.webflow.io
  npx animation-grabber https://example.webflow.io --format json -o anim.json
`;

export const parseOptions = (argv: string[]): Options | "help" => {
  const { positionals, values } = parseArgs({
    allowNegative: true,
    allowPositionals: true,
    args: argv,
    options: {
      format: { default: "code", short: "f", type: "string" },
      headed: { default: false, type: "boolean" },
      help: { default: false, short: "h", type: "boolean" },
      out: { short: "o", type: "string" },
      record: { default: true, type: "boolean" },
      scripts: { default: true, type: "boolean" },
      wait: { default: String(DEFAULT_WAIT_MS), short: "w", type: "string" },
    },
    strict: true,
  });
  if (values.help) {
    return "help";
  }
  const [url] = positionals;
  if (url === undefined) {
    throw new Error(`A page URL is required.\n\n${HELP}`);
  }
  if (!FORMATS.has(values.format)) {
    throw new Error(
      `Unknown format "${values.format}". Use code, json or scripts.`
    );
  }
  const wait = Number(values.wait);
  if (!Number.isFinite(wait) || wait < 0) {
    throw new Error(`--wait must be a non-negative number of milliseconds.`);
  }
  return {
    format: values.format as Format,
    headed: values.headed,
    out: values.out ?? null,
    record: values.record,
    scripts: values.scripts,
    url: new URL(url).href,
    wait,
  };
};
