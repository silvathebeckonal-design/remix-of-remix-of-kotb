# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Offline Android wrapper

Application ID: `cxs.kingofthebridge.port` (this is an identifier, not a signing key).
The existing app is an asset extractor; PLAY is not implemented and no gameplay save engine exists.

On a machine with Android Studio, its Android SDK, and JDK 21:

1. `bun install`
2. `bun run build` — prerenders the menu to `dist/client/index.html`.
3. `bun run android:prepare` — downloads all asset-pointer targets into the local web bundle and syncs Android. Internet is required only during preparation.
4. `bun run android:open` — build/run in Android Studio. For a release APK, use Build → Generate Signed App Bundle / APK with your own private signing key.

The wrapper has no remote server URL, service worker, or internet permission. It loads its menu, images, font and sounds from APK files. Extracted pictures stay in local IndexedDB. Import your own game archive once; the original Unity game itself is not converted into a playable Android game by this wrapper.

After successful extraction, editable launcher metadata is written as pretty-printed JSON to `/data/user/0/cxs.kingofthebridge.port/files/save.json`, then mirrored to `/storage/emulated/0/Android/media/cxs.kingofthebridge.port/save.json` (the storage volume path may vary). No broad storage permission is requested. The native read method accepts a newer valid media copy and restores the internal file. Android file-manager access varies by device. Uninstalling may remove these app-owned files; copy backups elsewhere first.

The provided PNG supplies the Android launcher icon and browser favicon. Android may still show its mandatory system launch animation; the app's artificial black-screen delay is removed.

## Playing
Pick a .zip of your own `King of the Bridge_Data` folder. At least 75% of the expected game files must be present. Extracted pictures are stored encrypted on your device and only decrypted in memory while the game runs; no game art ships with this repository. Game audio isn't extracted yet, so in-game sound effects stay silent.
