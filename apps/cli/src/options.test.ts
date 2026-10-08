import { describe, expect, it } from "vitest";

import { parseOptions } from "./options";

describe(parseOptions, () => {
  it("applies defaults", () => {
    expect(parseOptions(["https://example.com"])).toStrictEqual({
      format: "code",
      headed: false,
      out: null,
      record: true,
      scripts: true,
      url: "https://example.com/",
      wait: 750,
    });
  });

  it("parses flags and negations", () => {
    const options = parseOptions([
      "https://example.com",
      "-f",
      "json",
      "-o",
      "out.json",
      "--no-record",
      "--no-scripts",
      "--headed",
      "-w",
      "2000",
    ]);
    expect(options).toMatchObject({
      format: "json",
      headed: true,
      out: "out.json",
      record: false,
      scripts: false,
      wait: 2000,
    });
  });

  it("rejects bad input", () => {
    expect(parseOptions(["--help"])).toBe("help");
    expect(() => parseOptions([])).toThrow("A page URL is required");
    expect(() => parseOptions(["https://example.com", "-f", "yaml"])).toThrow(
      'Unknown format "yaml"'
    );
    expect(() => parseOptions(["https://example.com", "-w", "-1"])).toThrow(
      "--wait"
    );
    expect(() => parseOptions(["not a url"])).toThrow("Invalid URL");
  });
});
