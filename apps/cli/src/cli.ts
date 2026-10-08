#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { stderr, stdout } from "node:process";

import { scriptsToText, toGsapCode } from "@animation-grabber/core/codegen";
import type { ExtractionResult } from "@animation-grabber/core/types";

import { grab } from "./grab";
import type { Format } from "./options";
import { HELP, parseOptions } from "./options";

const render = (result: ExtractionResult, format: Format) => {
  switch (format) {
    case "code": {
      return toGsapCode(result);
    }
    case "json": {
      return `${JSON.stringify(result, null, 2)}\n`;
    }
    default: {
      return scriptsToText(result);
    }
  }
};

const summary = (result: ExtractionResult) => {
  const { gsap } = result;
  const version = gsap.detected
    ? `GSAP ${gsap.version ?? "?"}`
    : "no window.gsap";
  return `${version} · ${result.animations.length} animation(s) · ${result.scrollTriggers.length} ScrollTrigger(s) · ${result.scripts.length} script(s)`;
};

const main = async () => {
  const options = parseOptions(process.argv.slice(2));
  if (options === "help") {
    stdout.write(HELP);
    return;
  }
  const result = await grab(options);
  const output = render(result, options.format);
  if (options.out === null) {
    stdout.write(output);
  } else {
    await writeFile(options.out, output);
    stderr.write(`Wrote ${options.out}\n`);
  }
  stderr.write(`${summary(result)}\n`);
  for (const warning of result.warnings) {
    stderr.write(`warning: ${warning}\n`);
  }
};

try {
  await main();
} catch (error) {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
