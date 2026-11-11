import { describe, expect, it } from "vitest";
import { checkAppInfo, classifyFile, groupFor, readBuildGuid, uniquePath } from "./files";
import { lz4DecompressBlock } from "./unity/lz4";
import { decodeTexture } from "./unity/texture2d";
import { encodePNG } from "./unity/png";
import { relevantFiles } from "./useExtraction";

describe("which game files are read", () => {
  it("reads asset files, their .resS data and bundles", () => {
    expect(classifyFile("King of the Bridge_Data/sharedassets1.assets")).toBe("assets");
    expect(classifyFile("King of the Bridge_Data/sharedassets1.assets.resS")).toBe("ress");
    expect(
      classifyFile("StreamingAssets/aa/StandaloneWindows64/localization-assets-english(en)_assets_all.bundle"),
    ).toBe("bundle");
    expect(classifyFile("app.info")).toBe("appinfo");
  });

  it("ignores game code, scenes, audio and engine built-ins", () => {
    expect(classifyFile("Managed/Assembly-CSharp.dll")).toBe("ignored");
    expect(classifyFile("level1")).toBe("ignored");
    expect(classifyFile("sharedassets0.resource")).toBe("ignored");
    expect(classifyFile("King of the Bridge_Data/Resources/unity default resources")).toBe("ignored");
  });

  it("drops irrelevant picked files before extraction", () => {
    const files = [new File(["x"], "Assembly-CSharp.dll"), new File(["x"], "resources.assets")];
    expect(relevantFiles(files).map((f) => f.path)).toEqual(["resources.assets"]);
  });
});

describe("game verification", () => {
  it("accepts King of the Bridge's app.info and rejects other games", () => {
    expect(checkAppInfo("Finn Schuuring\nKing of the Bridge").ok).toBe(true);
    expect(checkAppInfo("Someone\nOther Game").ok).toBe(false);
  });

  it("reads the build guid from boot.config", () => {
    expect(readBuildGuid("gc-max-time-slice=3\nbuild-guid=4320EDDC97dd41818ba76d932644bc36\n")).toBe(
      "4320eddc97dd41818ba76d932644bc36",
    );
  });
});

describe("output naming", () => {
  it("files rulebook pages per language and sprites under Texture2D", () => {
    expect(groupFor("localization-assets-english(en)_assets_all.bundle").folder).toBe("Rulebook/english");
    expect(groupFor("localization-assets-dutch(nl)_assets_all.bundle").folder).toBe("Rulebook/dutch");
    expect(groupFor("sharedassets1.assets").folder).toBe("Texture2D");
  });

  it("names a duplicate picture x_0, then x_1", () => {
    const used = new Set<string>();
    expect(uniquePath(used, "Texture2D", "bridge_floor_down_1")).toBe("Texture2D/bridge_floor_down_1.png");
    expect(uniquePath(used, "Texture2D", "bridge_floor_down_1")).toBe("Texture2D/bridge_floor_down_1_0.png");
    expect(uniquePath(used, "Texture2D", "bridge_floor_down_1")).toBe("Texture2D/bridge_floor_down_1_1.png");
  });
});

describe("decoding", () => {
  it("decompresses an LZ4 block with a back-reference", () => {
    // literals "abc", then match offset 3 length 6 -> "abcabcabc"
    const src = new Uint8Array([0x32, 97, 98, 99, 3, 0]);
    expect(new TextDecoder().decode(lz4DecompressBlock(src, 9))).toBe("abcabcabc");
  });

  it("flips Unity's bottom-up rows and unpacks ARGB4444", () => {
    // 1x2 image: bottom row opaque red (0xFF00), top row half-transparent blue (0x800F)
    const src = new Uint8Array([0x00, 0xff, 0x0f, 0x80]);
    const px = decodeTexture(2, 1, 2, src)!;
    expect(Array.from(px.subarray(0, 4))).toEqual([0, 0, 255, 136]);
    expect(Array.from(px.subarray(4, 8))).toEqual([255, 0, 0, 255]);
  });

  it("writes a valid PNG header", () => {
    const png = encodePNG(new Uint8Array(4 * 4), 2, 2);
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

describe("unpackArchive", async () => {
  const { unpackArchive } = await import("./extract");
  const { gzipSync } = await import("fflate");
  it("reads game files from a .tar.gz and skips unrelated ones", () => {
    const enc = new TextEncoder();
    const entry = (name: string, body: string) => {
      const h = new Uint8Array(512);
      h.set(enc.encode(name), 0);
      h.set(enc.encode(body.length.toString(8).padStart(11, "0")), 124);
      h[156] = 48;
      const b = new Uint8Array(Math.ceil(body.length / 512) * 512);
      b.set(enc.encode(body));
      return [h, b];
    };
    const parts = [...entry("Data/app.info", "x\ny"), ...entry("Data/readme.txt", "no"), new Uint8Array(1024)];
    const tar = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) (tar.set(p, o), (o += p.length));
    const out = unpackArchive("game.tar.gz", gzipSync(tar));
    expect(Object.keys(out)).toEqual(["Data/app.info"]);
  });
});
