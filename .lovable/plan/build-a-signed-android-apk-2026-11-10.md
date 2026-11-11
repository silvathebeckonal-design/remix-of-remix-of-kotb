# Build a signed Android APK

## Goal
Produce an installable, signed offline APK (`cxs.kingofthebridge.port`) you can download and install on your phone.

## Steps
1. Install a Java JDK 21 and Android SDK (build-tools, platform 35) in the sandbox temporarily.
2. Prepare the offline web files and sync them into the Android project.
3. Generate a release signing key (kept out of the project; you get a copy to keep safe — you need the same key for every future update).
4. Add release signing settings to the Android build that read the key from environment values, not from the repo.
5. Build the release APK and check it: correct app ID, icon, signature, and that the web files are bundled (no network needed).
6. Save the APK and key backup to your Files.

## What can't be done here
- Testing on a real phone (offline launch, save file in internal storage and `Android/media/cxs.kingofthebridge.port`) — you'll need to install and try it.
- Gameplay saves: the project only has the launcher/asset extractor, so only launcher saves are written.

## Technical details
- Tools installed under /tmp; Gradle `signingConfigs.release` reads `KOTB_KEYSTORE`, `KOTB_KEYSTORE_PASSWORD`, `KOTB_KEY_ALIAS`, `KOTB_KEY_PASSWORD`.
- Verify with `apksigner verify` and `aapt dump badging`.
- If the build exceeds sandbox limits (time/disk), fall back to delivering the ready-to-build project and exact commands.

## Also: accept archives that mostly match
- An archive counts as valid when at least 70% of the expected game files are present (today it's accepted if any game data exists; missing files are only listed).
- Below 70%: show a clear "this doesn't look like King of the Bridge" message instead of extracting.
- 70–99%: extract normally with a short note listing what's missing.
- Add a small test: 69% rejected, 70% and 80% accepted.
- Technical: compute matched / EXPECTED_FILES.length in src/launcher/extract.ts after `missing`; threshold as an exported constant. Add this task to roadmap.md.
