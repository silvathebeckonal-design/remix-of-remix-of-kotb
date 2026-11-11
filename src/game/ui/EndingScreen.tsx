// Port of the "Credits" scene (CreditsManager): each entry waits 1s, appears with titel_impact for 4s,
// then the menu loads 2s after the last one.
import { useEffect, useState } from "react";
import { CREDITS_STRINGS } from "../data";
import { playSound } from "../audio";
import { setCountTime } from "../gameTime";
import { Stage } from "./Stage";

const C = CREDITS_STRINGS as typeof CREDITS_STRINGS & Record<string, string>;

function creditLines(): string[] {
  const keys = [
    "CreditsNames1Key",
    "CreditsNames2Key",
    "CreditsNames3Key",
    "CreditsNames4Key",
    "CreditsNames5Key",
    "CreditsNames6Key",
    "CreditsNames7Key",
    "CreditsThanksKey",
  ];
  const lines = keys.map((k) => (C[k] ?? "").replace(/\r/g, "").trim()).filter(Boolean);
  // Port credit, right after the first original credit.
  lines.splice(1, 0, "unofficial android port by\n\nCreatriXstudioS, creator, repy");
  return lines;
}

export function EndingScreen({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setCountTime(false);
    let cancelled = false;
    const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
    void (async () => {
      for (const line of creditLines()) {
        await sleep(1);
        if (cancelled) return;
        setText(line);
        playSound("titel_impact");
        await sleep(4);
        if (cancelled) return;
        setText(null);
      }
      await sleep(2);
      if (!cancelled) onDone();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stage>
      <div className="absolute inset-y-0 inset-x-bleed flex items-center justify-center bg-kotb-outline px-[160px]">
        {text && (
          <p className="whitespace-pre-line text-center font-kotb text-[64px] leading-tight text-kotb-white">
            {text}
          </p>
        )}
      </div>
    </Stage>
  );
}
