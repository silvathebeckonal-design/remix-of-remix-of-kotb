import { createFileRoute } from "@tanstack/react-router";
import cursorDefault from "@/assets/game/cursor_default.png.asset.json";
import cursorDrag from "@/assets/game/cursor_dragable.png.asset.json";
import { Launcher } from "@/launcher/Launcher";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "King of the Bridge Launcher - extract the game assets" },
      {
        name: "description",
        content:
          "Pick your King of the Bridge game folder and the launcher unpacks its sprites and rulebook pages into PNGs, saved offline on your device.",
      },
      { property: "og:title", content: "King of the Bridge Launcher" },
      {
        property: "og:description",
        content: "Unpack the sprites and rulebook pages from your own copy of King of the Bridge, right in the browser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main
      className="h-dvh w-full select-none overflow-hidden"
      style={{
        ["--kotb-cursor" as string]: `url("${cursorDefault.url}") 0 0, default`,
        ["--kotb-cursor-drag" as string]: `url("${cursorDrag.url}") 0 0, pointer`,
      }}
    >
      <h1 className="sr-only">King of the Bridge Launcher</h1>
      <Launcher />
      {/* The game is strictly landscape: portrait screens are fully covered until rotated. */}
      <div className="fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-6 bg-kotb-outline p-8 text-center font-kotb text-kotb-white portrait:flex">
        <div className="h-24 w-14 rotate-90 border-4 border-kotb-white" aria-hidden />
        <p className="text-2xl">Rotate your device to landscape</p>
      </div>
    </main>
  );
}
