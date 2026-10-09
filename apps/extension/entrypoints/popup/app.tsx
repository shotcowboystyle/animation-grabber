import { scriptsToText, toGsapCode } from "@animation-grabber/core/codegen";
import type { ExtractionResult } from "@animation-grabber/core/types";
import { useState } from "react";

import {
  extractFromActiveTab,
  recordAndExtract,
  stopRecording,
} from "@/src/lib/extract";

type View = "code" | "json" | "scripts";

type Status =
  | { kind: "busy"; label: string }
  | { kind: "error"; message: string }
  | { kind: "idle" };

const VIEWS: { label: string; value: View }[] = [
  { label: "Code", value: "code" },
  { label: "JSON", value: "json" },
  { label: "Scripts", value: "scripts" },
];

const COPIED_RESET_MS = 1500;

const render = (result: ExtractionResult, view: View) => {
  switch (view) {
    case "code": {
      return toGsapCode(result);
    }
    case "json": {
      return JSON.stringify(result, null, 2);
    }
    default: {
      return scriptsToText(result);
    }
  }
};

const fileName = (result: ExtractionResult, view: View) => {
  const host = new URL(result.url).hostname.replaceAll(".", "-");
  const extension = view === "json" ? "json" : "js";
  return `animation-grabber-${host}-${view}.${extension}`;
};

const download = (name: string, content: string) => {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const SCRIPTS_ONLY = VIEWS.filter((item) => item.value === "scripts");

/** Scripts that call GSAP or load it: a sign GSAP is bundled privately. */
const hasScriptHits = (result: ExtractionResult) =>
  result.scripts.some((script) => script.gsapCallCount > 0 || script.library);

const Summary = ({ result }: { result: ExtractionResult }) => {
  const { gsap } = result;
  if (!gsap.detected) {
    return (
      <output className="status">
        No GSAP detected on this site.
        {hasScriptHits(result)
          ? " Page scripts still reference GSAP, so it may be bundled privately. Showing source snippets."
          : ""}
      </output>
    );
  }
  return (
    <section className="summary">
      <p>
        <strong>GSAP:</strong> v{gsap.version ?? "?"}
        {gsap.plugins.length > 0 ? ` · ${gsap.plugins.join(", ")}` : ""}
        {gsap.recording ? " · recording" : ""}
      </p>
      <p>
        <strong>Found:</strong> {result.animations.length} animation(s),{" "}
        {result.scrollTriggers.length} ScrollTrigger(s), {result.scripts.length}{" "}
        script(s)
      </p>
      {result.warnings.map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  );
};

export const App = () => {
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [view, setView] = useState<View>("code");
  const [copied, setCopied] = useState(false);

  const run = async (label: string, task: () => Promise<ExtractionResult>) => {
    setStatus({ kind: "busy", label });
    try {
      setResult(await task());
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: describeError(error) });
    }
  };

  const detected = result?.gsap.detected ?? false;
  const effectiveView = detected ? view : "scripts";
  const visibleViews = detected ? VIEWS : SCRIPTS_ONLY;
  const showOutput = result !== null && (detected || hasScriptHits(result));
  const output = result ? render(result, effectiveView) : "";
  const busy = status.kind === "busy";

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, COPIED_RESET_MS);
  };

  return (
    <main>
      <header>
        <h1>
          <img alt="Animation Grabber" className="logo" src="/logo.svg" />
        </h1>
        <p className="hint">
          Grabs live GSAP tweens, timelines and ScrollTriggers out of the
          current tab. Reload &amp; record reloads the page with a recorder
          attached so load-time animations are kept.
        </p>
      </header>

      <div className="actions">
        <button
          disabled={busy}
          onClick={() => {
            void run("Extracting…", () => extractFromActiveTab());
          }}
          type="button"
        >
          Extract
        </button>
        <button
          disabled={busy}
          onClick={() => {
            void run("Reloading and recording…", () => recordAndExtract());
          }}
          type="button"
        >
          Reload &amp; record
        </button>
        {result?.gsap.recording ? (
          <button
            disabled={busy}
            onClick={() => {
              void stopRecording();
            }}
            type="button"
          >
            Stop recording
          </button>
        ) : null}
      </div>

      {status.kind === "busy" ? <p className="status">{status.label}</p> : null}
      {status.kind === "error" ? (
        <p className="error" role="alert">
          {status.message}
        </p>
      ) : null}

      {result ? <Summary result={result} /> : null}

      {result && showOutput ? (
        <>
          <nav className="tabs">
            {visibleViews.map((item) => (
              <button
                aria-pressed={effectiveView === item.value}
                key={item.value}
                onClick={() => {
                  setView(item.value);
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
            <span className="spacer" />
            <button
              onClick={() => {
                void copy();
              }}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => {
                download(fileName(result, effectiveView), output);
              }}
              type="button"
            >
              Download
            </button>
          </nav>
          <pre>
            <code>{output}</code>
          </pre>
        </>
      ) : null}
    </main>
  );
};
