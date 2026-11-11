import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cxs.kingofthebridge.port",
  appName: "King of the Bridge",
  webDir: "dist/client",
  // No remote server: the WebView serves files bundled in the APK.
  android: { allowMixedContent: false },
};

export default config;