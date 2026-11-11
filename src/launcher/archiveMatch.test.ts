import { describe, expect, it } from "vitest";
import { archiveMatches } from "./files";

describe("archive match threshold", () => {
  it("rejects 69% of expected files", () => expect(archiveMatches(69, 100)).toBe(false));
  it("rejects 74% of expected files", () => expect(archiveMatches(74, 100)).toBe(false));
  it("accepts 75% of expected files", () => expect(archiveMatches(75, 100)).toBe(true));
  it("accepts 80% of expected files", () => expect(archiveMatches(80, 100)).toBe(true));
});
