import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAGENTA_PY } from "../src/generated/magentaPy";
import { MAGENTA_SPEC_VERSION } from "../src/model/builds";

describe("the embedded Python plugin", () => {
  it("is python/magenta.py as it stands (run scripts/embed-python.mts after editing it)", () => {
    expect(MAGENTA_PY).toBe(readFileSync(join(import.meta.dirname, "..", "python", "magenta.py"), "utf8"));
  });
  it("reads the spec version the editor writes", () => {
    // The plugin refuses a spec newer than it knows; both sides ship together, so they agree.
    const m = /^SPEC_VERSION\s*=\s*(\d+)/m.exec(MAGENTA_PY);
    expect(m, "python/magenta.py names SPEC_VERSION").not.toBeNull();
    expect(Number(m![1])).toBe(MAGENTA_SPEC_VERSION);
  });
});
