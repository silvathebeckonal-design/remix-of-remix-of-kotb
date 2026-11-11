import { describe, expect, it } from "vitest";
import { serializeLauncherSave, SAVE_FILENAME } from "./nativeSave";

describe("editable Android saves", () => {
  it("stores plain editable JSON instead of encoded or encrypted data", () => {
    const manifest = { extractedAt: 123, count: 2, groups: { Texture2D: 2 }, build: null, skipped: 0, missing: [], warnings: [], bytesWritten: 64 };
    const result = serializeLauncherSave(manifest);
    expect(JSON.parse(result).manifest).toEqual(manifest);
    expect(result).toContain('\n  "schemaVersion": 1,');
    expect(SAVE_FILENAME).toBe("save.json");
  });
});