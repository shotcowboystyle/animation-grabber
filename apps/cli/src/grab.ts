import { extractGsapInPage } from "@animation-grabber/core/extract-in-page";
import { recordGsapInPage } from "@animation-grabber/core/record-in-page";
import type { ExtractionResult } from "@animation-grabber/core/types";
import type { Browser } from "playwright";
import { chromium } from "playwright";

import type { Options } from "./options";

const MAX_FUNCTION_SOURCE = 2000;
const INSTALL_HINT =
  "No Chromium found. Run `npx playwright install chromium` (or install Google Chrome) and try again.";

const launch = async (headed: boolean): Promise<Browser> => {
  try {
    return await chromium.launch({ headless: !headed });
  } catch {
    // Playwright's own Chromium is not downloaded; a system Chrome works too.
    try {
      return await chromium.launch({ channel: "chrome", headless: !headed });
    } catch {
      throw new Error(INSTALL_HINT);
    }
  }
};

/** Open the page in Chromium, record from the first byte, then extract. */
export const grab = async (options: Options): Promise<ExtractionResult> => {
  const browser = await launch(options.headed);
  try {
    const page = await browser.newPage();
    if (options.record) {
      await page.addInitScript(recordGsapInPage);
    }
    await page.goto(options.url, { waitUntil: "load" });
    await page.waitForTimeout(options.wait);
    return await page.evaluate(extractGsapInPage, {
      fetchExternalScripts: options.scripts,
      maxFunctionSource: MAX_FUNCTION_SOURCE,
    });
  } finally {
    await browser.close();
  }
};
