<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- `src/launcher/unity/*` and `src/launcher/extract.ts` stay DOM-free so the extractor runs in the worker and under bun/vitest against real game files; UI lives in `src/launcher/*.tsx`.
- The launcher accepts only one game archive (.zip/.tar/.tar.gz), unpacked in `extract.ts`, to keep the first screen to a single action.
- Extraction runs in `extract.worker.ts` and saves PNGs to IndexedDB (`storage.ts`); the main thread only shows progress, so big files never block the menu.
- Unity 2022.3 release builds ship without type trees, so object layouts (e.g. Texture2D) are hand-coded from the engine version's tree; re-check them if the game updates its Unity version.
- The menu layout reuses the original game's 1920x1080 Stage and world-unit sprite placement so the launcher matches the in-game main menu.
- Android uses Capacitor with prerendered local web files and no remote server; the preparation script bundles asset-pointer targets at their existing URLs so native launches need no network or app-shell service worker.
- Native saves use a dedicated Android plugin with atomic internal JSON writes followed by an external-media mirror; workers and Unity extraction remain independent of native APIs.
- Android release signing reads KOTB_KEYSTORE/KOTB_KEYSTORE_PASSWORD/KOTB_KEY_ALIAS/KOTB_KEY_PASSWORD env vars so the key never lives in the repo.
- The game bundles no game art: `src/game/assets.ts` resolves every picture from a session-only blob-URL vault filled by the launcher after decrypting the player's extracted files, so the repo and site never serve copyrighted assets.
