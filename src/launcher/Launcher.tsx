// Launcher built from the game's main menu (Menu scene): same banner, floating logo and bridge
// overlay, with the menu replaced by "select files" -> extraction progress -> saved assets.
import { useCallback, useEffect, useRef, useState } from "react";
import banner from "@/assets/game/banner.png.asset.json";
import bridgeOverlay from "@/assets/game/bridge_overlay.png.asset.json";
import { Stage } from "./Stage";
import { BAR_SECONDS, PIXEL_FRAME_CLIP, Logo, MenuBlock, MenuList, Sprite, WaveText, type MenuItem } from "./MenuParts";
import { playSound, preloadSounds, unlockAudio } from "./sound";
import { relevantFiles, useExtraction, type PickedFile } from "./useExtraction";
import { getManifest, unsealAssets, type Manifest } from "./storage";
import { Game } from "@/game/Game";
import { clearVault, registerVault } from "@/game/assets";
import { DATA_FOLDER } from "./files";
import { readLauncherState, saveLauncherState } from "./nativeSave";

type Screen = "root" | "progress" | "done" | "error";
const ARCHIVE_EXTS = ["zip", "tar.gz", "tar"];
const MENU_TOP = 694;

export function Launcher() {
  const [screen, setScreen] = useState<Screen>("root");
  const [open, setOpen] = useState(true);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const busy = useRef(false);
  const [extIdx, setExtIdx] = useState(0);
  const [playNote, setPlayNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => clearVault(), []);
  const filesInput = useRef<HTMLInputElement>(null);
  const { state, start, fail } = useExtraction();
  const [booting, setBooting] = useState(true);
  /** Once assets exist, the launcher never shows again: unseal and go straight into the game. */
  const launch = useCallback(async () => {
    const items = await unsealAssets();
    if (items.length === 0) throw new Error("empty");
    registerVault(items);
    setPlaying(true);
  }, []);

  /** MenuManager.TransitionToNewLayer: bars shrink, swap the layer, bars grow. */
  const go = useCallback((next: Screen) => {
    if (busy.current) return;
    busy.current = true;
    setOpen(false);
    setTimeout(() => {
      setScreen(next);
      setOpen(true);
      busy.current = false;
    }, BAR_SECONDS * 1000);
  }, []);

  // Open immediately; returning players land on their locally stored assets.
  useEffect(() => {
    preloadSounds();
    const cycle = setInterval(() => setExtIdx((i) => (i + 1) % ARCHIVE_EXTS.length), 1800);
    let alive = true;
    void getManifest().then(async (m) => {
      try {
        const restored = await readLauncherState();
        if (m && restored) m = restored;
      } catch {
        if (alive) {
          fail("The Android save contains an invalid edit or cannot be read. Restore a valid save.json and reopen the app.");
          setScreen("error");
        }
        return;
      }
      if (!alive) return;
      if (m && m.count > 0) {
        setManifest(m);
        try {
          await launch();
          return;
        } catch {
          setScreen("done");
        }
      }
      if (alive) setBooting(false);
    });
    return () => {
      alive = false;
      clearInterval(cycle);
    };
  }, []);

  const begin = (files: PickedFile[]) => {
    if (files.length === 0) {
      fail(`That isn't a supported archive. Use a .zip, .tar or .tar.gz of your "${DATA_FOLDER}" folder.`);
      playSound("chess_accusation_false");
      go("error");
      return;
    }
    start(files);
    go("progress");
  };

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length) begin(relevantFiles(list));
    e.target.value = "";
  };

  // Follow the worker: show the bar, then the result screen once it reaches 100%.
  const [shown, setShown] = useState(0);
  const target = state.status === "running" ? state.progress : state.status === "done" ? 1 : shown;
  const milestone = useRef(0);
  useEffect(() => {
    if (screen !== "progress") return;
    let raf = 0;
    const tick = () => {
      setShown((v) => {
        const n = v + (target - v) * 0.18;
        return Math.abs(target - n) < 0.002 ? target : n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen, target]);
  useEffect(() => {
    if (state.status === "running" && state.progress === 0) {
      setShown(0);
      milestone.current = 0;
    }
  }, [state]);
  useEffect(() => {
    const q = Math.floor(shown * 4);
    if (screen === "progress" && q > milestone.current && q < 4) {
      milestone.current = q;
      playSound("chess_rulebook_page_flip");
    }
  }, [shown, screen]);
  useEffect(() => {
    if (screen !== "progress") return;
    if (state.status === "done" && shown >= 1) {
      const t = setTimeout(() => {
        void getManifest().then(async (saved) => {
          setManifest(saved);
          if (saved) {
            try {
              await saveLauncherState(saved);
            } catch {
              fail("Assets are extracted, but the Android save could not be written. Re-extract to retry.");
              go("error");
              return;
            }
          }
          try {
            await launch();
          } catch {
            go("done");
          }
        });
        playSound("chess_accusation_correct");
      }, 500);
      return () => clearTimeout(t);
    }
    if (state.status === "error") {
      playSound("chess_accusation_false");
      go("error");
    }
    return undefined;
  }, [state, shown, screen, go]);

  const pickFiles = () => filesInput.current?.click();

  const rootItems: MenuItem[] = [{ label: `SELECT GAME.${(ARCHIVE_EXTS[extIdx] ?? "zip").toUpperCase()}`, run: pickFiles, framed: true }];

  const pct = Math.floor(Math.min(1, shown) * 100);
  const running = state.status === "running" ? state : null;

  if (playing) return <Game />;
  if (booting && screen !== "error") return <div className="h-full w-full bg-kotb-outline" />;

  return (
    <div
      className="kotb-launcher flex h-full w-full items-center justify-center bg-kotb-outline"
      onPointerDown={unlockAudio}
      onKeyDown={unlockAudio}
    >
      <Stage>
        <div className="absolute inset-y-0 inset-x-bleed bg-kotb-outline" />
        <Sprite src={banner.url} w={400} h={225} y={2.28} z={0} />
        <Logo />
        <Sprite src={bridgeOverlay.url} w={400} h={225} y={2.28} z={20} />

        {screen === "root" && (
          <>
            <MenuBlock open={open} top={MENU_TOP - 40}>
              <h2 className="text-[46px] leading-none tracking-[3px]">
                <WaveText text="SELECT ARCHIVE" />
              </h2>
              <p className="mt-1 text-[28px] tracking-[2px] text-kotb-white/70">
                Provide a file archive of your original game copy to extract assets
              </p>
            </MenuBlock>
            <MenuList label="Launcher menu" open={open} top={MENU_TOP + 110} items={rootItems} />
          </>
        )}

        {screen === "progress" && (
          <MenuBlock open={open} top={672}>
            <h2 className="text-[46px] leading-none tracking-[3px]">
              <WaveText text={state.status === "done" ? "ASSETS EXTRACTED" : "EXTRACTING ASSETS"} />
            </h2>
            <ProgressBar value={Math.min(1, shown)} label={`${pct}%`} />
            <p className="mt-7 max-w-[1300px] truncate text-[30px] tracking-[2px]" aria-live="polite">
              {running ? running.text : state.status === "done" ? `${state.count} pictures saved` : "..."}
            </p>
          </MenuBlock>
        )}

        {screen === "done" && (
          <>
            <MenuList
              label="Main menu"
              open={open}
              top={MENU_TOP}
              items={[
                {
                  label: playNote ?? "PLAY",
                  run: () => {
                    setPlayNote("LOADING...");
                    void unsealAssets()
                      .then((items) => {
                        if (items.length === 0) throw new Error("empty");
                        registerVault(items);
                        setPlaying(true);
                      })
                      .catch(() => {
                        setPlayNote("RE-EXTRACT NEEDED");
                        setTimeout(() => setPlayNote(null), 2000);
                      });
                  },
                },
                { label: "RE-EXTRACT", run: () => go("root") },
              ]}
            />
          </>
        )}

        {screen === "error" && (
          <>
            <MenuBlock open={open} top={672}>
              <h2 className="text-[44px] leading-none tracking-[3px] text-kotb-danger">
                <WaveText text="EXTRACTION FAILED" />
              </h2>
              <p className="mt-5 max-w-[1300px] text-center text-[28px] leading-snug tracking-[2px]">
                {state.status === "error" ? state.message : "Something went wrong."}
              </p>
            </MenuBlock>
            <MenuList
              label="Error menu"
              open={open}
              top={850}
              items={[
                { label: "TRY AGAIN", run: () => go("root") },
              ]}
            />
          </>
        )}


        <span
          className="absolute z-30 font-kotb text-[42px] leading-none text-kotb-black"
          style={{ left: 75, top: 1008 }}
        >
          <WaveText text={'"By CreatriXstudioS, Creator, Repy."'} />
        </span>

        <input
          ref={filesInput}
          type="file"
          accept=".zip,.tar,.gz,.tgz"
          hidden
          onChange={onPicked}
          aria-label="Select game archive"
        />

      </Stage>
    </div>
  );
}

/** Pixel-art bar in the game's palette: stepped-corner frame and chunky segments like the menu UI. */
const SEGMENTS = 24;
/** Each segment loses one (scaled) pixel at every corner so it reads as slightly rounded. */
const SEGMENT_CLIP =
  "polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 4px 4px)";
function ProgressBar({ value, label }: { value: number; label: string }) {
  const filled = Math.floor(value * SEGMENTS + 1e-6);
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        className="bg-kotb-white p-2"
        style={{ clipPath: PIXEL_FRAME_CLIP }}
      >
        <div className="flex gap-2 bg-kotb-outline p-3" style={{ clipPath: PIXEL_FRAME_CLIP }}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span
              key={i}
              className={i < filled ? "bg-kotb-background" : "bg-kotb-black/40"}
              style={{ width: 36, height: 36, clipPath: SEGMENT_CLIP }}
            />
          ))}
        </div>
      </div>
      <span className="text-[38px] leading-none tracking-[3px] text-kotb-white">
        <WaveText text={label} />
      </span>
    </div>
  );
}
