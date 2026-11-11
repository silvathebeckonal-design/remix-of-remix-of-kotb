/// <reference lib="webworker" />
// Background extraction: reads the picked files, decodes every picture and saves the PNGs offline.
import { ExtractError, extractGameAssets, type InputFile } from "./extract";
import { clearAll, putAsset, putManifest } from "./storage";

export type WorkerIn = { type: "start"; files: { path: string; file: File }[] };
export type WorkerOut =
  | { type: "progress"; progress: number; phase: string; text: string }
  | { type: "done"; count: number; skipped: number; warnings: string[]; missing: string[] }
  | { type: "error"; message: string };

const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  if (ev.data.type !== "start") return;
  try {
    const input: InputFile[] = ev.data.files.map(({ path, file }) => ({
      path,
      size: file.size,
      read: async () => new Uint8Array(await file.arrayBuffer()),
    }));
    let saving = false;
    const summary = await extractGameAssets(
      input,
      (e) => post({ type: "progress", ...e }),
      async (a) => {
        if (!saving) {
          saving = true;
          await clearAll();
        }
        await putAsset({
          path: a.path,
          name: a.name,
          group: a.group,
          source: a.source,
          width: a.width,
          height: a.height,
          format: a.format,
          blob: new Blob([a.png as BlobPart], { type: "image/png" }),
        });
      },
    );
    await putManifest({
      extractedAt: Date.now(),
      count: summary.count,
      groups: summary.groups,
      build: summary.build,
      skipped: summary.skipped.length,
      missing: summary.missing,
      warnings: summary.warnings,
      bytesWritten: summary.bytesWritten,
    });
    post({ type: "progress", progress: 1, phase: "done", text: `${summary.count} pictures saved` });
    post({
      type: "done",
      count: summary.count,
      skipped: summary.skipped.length,
      warnings: summary.warnings,
      missing: summary.missing,
    });
  } catch (e) {
    const message =
      e instanceof ExtractError
        ? e.message
        : `Extraction failed: ${(e as Error)?.message ?? String(e)}`;
    post({ type: "error", message });
  }
};
