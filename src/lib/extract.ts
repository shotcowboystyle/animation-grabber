import { browser } from "wxt/browser";

import { extractGsapInPage } from "./extract-in-page";
import type { ExtractionResult, InPageOptions } from "./types";

const RECORDER_SCRIPT_ID = "gsap-extractor-recorder";
const RELOAD_TIMEOUT_MS = 30_000;
/** Give load-time animations a moment to be created after `load`. */
const SETTLE_MS = 750;

const DEFAULT_OPTIONS: InPageOptions = {
  fetchExternalScripts: true,
  maxFunctionSource: 2000,
};

const getActiveTab = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || tab.url === undefined) {
    throw new Error("No active tab, or its URL is not accessible.");
  }
  return { id: tab.id, url: tab.url };
};

const sleep = (ms: number) => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(resolve, ms);
  return promise;
};

const waitForLoad = async (tabId: number) => {
  const { promise, reject, resolve } = Promise.withResolvers<null>();
  const listener = (updatedTabId: number, info: { status?: string }) => {
    if (updatedTabId === tabId && info.status === "complete") {
      resolve(null);
    }
  };
  browser.tabs.onUpdated.addListener(listener);
  const timer = setTimeout(() => {
    reject(new Error("Timed out waiting for the page to reload."));
  }, RELOAD_TIMEOUT_MS);
  try {
    await promise;
  } finally {
    clearTimeout(timer);
    browser.tabs.onUpdated.removeListener(listener);
  }
};

/** Run the extractor inside the active tab's page (MAIN world). */
export const extractFromActiveTab = async (
  options: InPageOptions = DEFAULT_OPTIONS
): Promise<ExtractionResult> => {
  const tab = await getActiveTab();
  const [injection] = await browser.scripting.executeScript({
    args: [options],
    func: extractGsapInPage,
    target: { tabId: tab.id },
    world: "MAIN",
  });
  const result = injection?.result;
  if (!result) {
    throw new Error("Extraction returned nothing. Is this a regular web page?");
  }
  return result;
};

const isRecorderRegistered = async () => {
  const registered = await browser.scripting.getRegisteredContentScripts({
    ids: [RECORDER_SCRIPT_ID],
  });
  return registered.length > 0;
};

export const stopRecording = async () => {
  if (await isRecorderRegistered()) {
    await browser.scripting.unregisterContentScripts({
      ids: [RECORDER_SCRIPT_ID],
    });
  }
};

/**
 * Register the recorder for the tab's origin, reload the page so it runs at
 * `document_start`, then extract. Must be called from a user gesture because
 * it asks for host permission for that origin.
 */
export const recordAndExtract = async (
  options: InPageOptions = DEFAULT_OPTIONS
): Promise<ExtractionResult> => {
  const tab = await getActiveTab();
  const origin = `${new URL(tab.url).origin}/*`;
  const granted = await browser.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error(
      `Access to ${origin} is required to record animations from page load.`
    );
  }
  await stopRecording();
  await browser.scripting.registerContentScripts([
    {
      id: RECORDER_SCRIPT_ID,
      js: ["content-scripts/recorder.js"],
      matches: [origin],
      persistAcrossSessions: false,
      runAt: "document_start",
      world: "MAIN",
    },
  ]);
  const loaded = waitForLoad(tab.id);
  await browser.tabs.reload(tab.id);
  await loaded;
  await sleep(SETTLE_MS);
  return extractFromActiveTab(options);
};
