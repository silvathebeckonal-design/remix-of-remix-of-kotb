import { useCallback, useEffect, useRef, useState } from "react";
import type { V2 } from "./data";
import { preloadAll } from "./assets";
import { playSound, preloadSounds, unlockAudio } from "./audio";
import { requestFullscreenOnce } from "./fullscreen";
import { addGameTime, isCountingTime, resetGameTime, setCountTime } from "./gameTime";
import { ChessScene } from "./runtime/ChessScene";
import { DUCK_SPRITES } from "./runtime/duck";
import { WATER_FRAMES } from "./runtime/overworld";
import { tex } from "./assets";
import {
  defaultSave,
  loadSave,
  storeSave,
  wipeSave,
  type Ending,
  type OverworldState,
} from "./save";
import { ChessView } from "./ui/ChessView";
import { BridgeWalk } from "./ui/BridgeWalk";
import { EndingScreen } from "./ui/EndingScreen";
import { LostPages } from "./ui/LostPages";
import { AchievementsView } from "./ui/AchievementsView";
import { SpeedrunTimer } from "./ui/SpeedrunTimer";
import { ReactiveCursor } from "./ui/ReactiveCursor";
import { TitleScreen, type TitleChoice } from "./ui/TitleScreen";

type Phase =
  | { name: "title" }
  | { name: "bridge"; act: OverworldState; key: number; ending?: Ending; trollCapture?: V2 }
  | { name: "chess"; key: number }
  | { name: "credits" }
  | { name: "pages" }
  | { name: "achievements" };

const EXTRA_SPRITES = [
  ...WATER_FRAMES,
  ...DUCK_SPRITES,
  "hourglass",
  "hourglass_fill",
  "hourglass_in",
  "hourglass_out",
  "Logo32",
  "banner",
  "bridge_overlay",
  "sludge",
  "sludge_hole",
  "cursor_default",
  "cursor_dragable",
].map(tex);

export function Game() {
  const [phase, setPhase] = useState<Phase>({ name: "title" });
  const [iris, setIris] = useState(true);
  const [ready, setReady] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const busy = useRef(false);
  const sceneKey = useRef(0);

  useEffect(() => {
    setHasProgress(loadSave().totalAttemptCount > 0);
    void preloadAll(EXTRA_SPRITES).then(() => setReady(true));
    preloadSounds();
    // SpeedrunTimer: totalGameTime += deltaTime while doCountTime
    const id = window.setInterval(() => {
      if (isCountingTime() && document.visibilityState === "visible") addGameTime(0.25);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  /** TransitionManager: iris out, swap scene, iris in. */
  const goTo = useCallback((next: Phase) => {
    if (busy.current) return;
    busy.current = true;
    playSound("transition_fade_out");
    setIris(false);
    setTimeout(() => {
      if (next.name === "title" || next.name === "pages" || next.name === "achievements" || next.name === "credits")
        setCountTime(false);
      setPhase(next);
      setHasProgress(loadSave().totalAttemptCount > 0);
      setTimeout(() => {
        playSound("transition_fade_in");
        setIris(true);
        busy.current = false;
      }, 120);
    }, 650);
  }, []);

  const toBridge = useCallback(
    (act: OverworldState, extra: { ending?: Ending; trollCapture?: V2 } = {}) =>
      goTo({ name: "bridge", act, key: ++sceneKey.current, ...extra }),
    [goTo],
  );

  const startChess = useCallback(
    (withStartTopic: boolean) => {
      if (withStartTopic) {
        // IntroCutscene: overworldState = ACT_II; ChessTrollManager.doStartTopic = true
        const save = loadSave();
        save.overworldState = "ACT_II";
        storeSave(save);
      }
      ChessScene.doStartTopic = withStartTopic;
      goTo({ name: "chess", key: ++sceneKey.current });
    },
    [goTo],
  );

  const onTitle = (c: TitleChoice) => {
    unlockAudio();
    if (c === "start") {
      const save = loadSave();
      toBridge(save.overworldState, { ending: save.ending });
    } else if (c === "credits") goTo({ name: "credits" });
    else if (c === "pages") goTo({ name: "pages" });
    else if (c === "achievements") goTo({ name: "achievements" });
    else if (c === "resetRun") {
      // Speedrun reset: fresh save and timer, achievements are kept.
      wipeSave();
      resetGameTime();
      storeSave(defaultSave());
      setHasProgress(false);
      toBridge("ACT_I");
    }
    else if (c === "wipe") {
      wipeSave();
      resetGameTime();
      storeSave(defaultSave());
      setHasProgress(false);
    }
  };

  return (
    <div
      className="relative flex h-dvh w-full items-center justify-center overflow-hidden touch-none select-none bg-kotb-outline cursor-none [&_*]:cursor-none"
      onPointerDownCapture={() => {
        unlockAudio();
        requestFullscreenOnce();
      }}
      onKeyDownCapture={() => {
        unlockAudio();
        requestFullscreenOnce();
      }}
    >
      {phase.name === "title" && <TitleScreen onChoose={onTitle} hasProgress={hasProgress} />}
      {phase.name === "bridge" && (
        <BridgeWalk
          key={phase.key}
          act={phase.act}
          ending={phase.ending}
          trollCapture={phase.trollCapture}
          onStartChess={startChess}
          onCredits={() => goTo({ name: "credits" })}
        />
      )}
      {phase.name === "chess" && (
        <ChessView
          key={phase.key}
          onRetry={() => startChess(false)}
          onEscape={() => toBridge("ACT_II")}
          onWhiteWin={(ending, trollPos) =>
            setTimeout(() => toBridge("ACT_III", { ending, trollCapture: trollPos }), 1500)
          }
        />
      )}
      {phase.name === "credits" && <EndingScreen onDone={() => goTo({ name: "title" })} />}
      {phase.name === "pages" && <LostPages onBack={() => goTo({ name: "title" })} />}
      {phase.name === "achievements" && <AchievementsView onBack={() => goTo({ name: "title" })} />}
      {(phase.name === "bridge" || phase.name === "chess") && <SpeedrunTimer />}

      {/* iris transition */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div
          className="rounded-full transition-[width,height] duration-[600ms] ease-in-out shadow-[0_0_0_200vmax_var(--kotb-outline)]"
          style={{ width: iris ? "260vmax" : 0, height: iris ? "260vmax" : 0 }}
        />
      </div>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-kotb-outline font-kotb text-3xl text-kotb-white">
          Loading the bridge…
        </div>
      )}
      <ReactiveCursor />
    </div>
  );
}
