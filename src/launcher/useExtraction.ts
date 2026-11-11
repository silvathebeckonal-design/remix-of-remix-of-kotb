import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkerIn, WorkerOut } from "./extract.worker";
import { classifyFile } from "./files";

export interface PickedFile {
  path: string;
  file: File;
}

export type ExtractionState =
  | { status: "idle" }
  | { status: "running"; progress: number; text: string }
  | { status: "done"; count: number; skipped: number; warnings: string[]; missing: string[] }
  | { status: "error"; message: string };

/** Keeps only files the extractor reads (assets, .resS, bundles, app.info, boot.config, zips). */
export function relevantFiles(list: FileList | File[]): PickedFile[] {
  const out: PickedFile[] = [];
  for (const file of Array.from(list)) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (classifyFile(path) !== "ignored") out.push({ path, file });
  }
  return out;
}

export function useExtraction() {
  const [state, setState] = useState<ExtractionState>({ status: "idle" });
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const start = useCallback((files: PickedFile[]) => {
    worker.current?.terminate();
    setState({ status: "running", progress: 0, text: "Starting..." });
    let w: Worker;
    try {
      w = new Worker(new URL("./extract.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setState({ status: "error", message: "This browser can't run the extractor. Try a recent Chrome, Edge or Firefox." });
      return;
    }
    worker.current = w;
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.type === "progress") setState({ status: "running", progress: m.progress, text: m.text });
      else if (m.type === "done") {
        setState({ status: "done", count: m.count, skipped: m.skipped, warnings: m.warnings, missing: m.missing });
        w.terminate();
      } else if (m.type === "error") {
        setState({ status: "error", message: m.message });
        w.terminate();
      }
    };
    w.onerror = (e) => {
      setState({ status: "error", message: `Extraction stopped: ${e.message || "the worker crashed"}` });
      w.terminate();
    };
    const msg: WorkerIn = { type: "start", files };
    w.postMessage(msg);
  }, []);

  const fail = useCallback((message: string) => setState({ status: "error", message }), []);
  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, start, fail, reset };
}
