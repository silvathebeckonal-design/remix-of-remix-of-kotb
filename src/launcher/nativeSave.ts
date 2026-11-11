import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Manifest } from "./storage";
import { z } from "zod";

export const SAVE_FILENAME = "save.json";

interface NativeSavePlugin {
  write(options: { data: string }): Promise<{ internalPath: string; mediaPath: string }>;
  read(): Promise<{ data: string | null }>;
}

const NativeSave = registerPlugin<NativeSavePlugin>("NativeSave");

const saveSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("launcher"),
  manifest: z.object({
    extractedAt: z.number(), count: z.number().int().nonnegative(),
    groups: z.record(z.string(), z.number().int().nonnegative()),
    build: z.string().nullable(), skipped: z.number().int().nonnegative(),
    missing: z.array(z.string()), warnings: z.array(z.string()), bytesWritten: z.number().nonnegative(),
  }),
});

export async function readLauncherState(): Promise<Manifest | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { data } = await NativeSave.read();
  if (!data) return null;
  return saveSchema.parse(JSON.parse(data)).manifest;
}

export function serializeLauncherSave(manifest: Manifest): string {
  return JSON.stringify({ schemaVersion: 1, kind: "launcher", manifest }, null, 2) + "\n";
}

/** No invented gameplay progress: this port currently contains only the asset launcher. */
export async function saveLauncherState(manifest: Manifest) {
  if (!Capacitor.isNativePlatform()) return;
  return NativeSave.write({ data: serializeLauncherSave(manifest) });
}