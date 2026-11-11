import { describe, expect, it } from "vitest";
import { achievementsFromSave } from "./achievements";
import { defaultSave } from "./save";

describe("achievements", () => {
  it("awards the ending that was reached", () => {
    expect(achievementsFromSave({ ...defaultSave(), ending: "DuckEnding" })).toContain("DuckEnding");
  });
  it("awards AllPages only when no page is still fogged", () => {
    const e = (isFog: boolean) => ({ pageID: "p", isFog, turnsToClearFog: 0, screenIndex: 0 });
    expect(achievementsFromSave({ ...defaultSave(), pageFogEntries: [e(false), e(true)] })).not.toContain("AllPages");
    expect(achievementsFromSave({ ...defaultSave(), pageFogEntries: [e(false), e(false)] })).toContain("AllPages");
  });
});
