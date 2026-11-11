// MenuManager.OnItemQuit -> Application.Quit(). A browser tab can't quit itself, so this hands the request
// to a native/web wrapper when one is present and otherwise tries window.close() (works only in windows
// the game itself opened). Wrappers can set `window.kotbQuit` or listen for the "kotb:quit" message.
declare global {
  interface Window {
    kotbQuit?: () => void;
    ReactNativeWebView?: { postMessage: (msg: string) => void };
    Capacitor?: { Plugins?: { App?: { exitApp?: () => void } } };
    Android?: { quitApp?: () => void; closeApp?: () => void; openUrl?: (url: string) => void };
    AndroidBridge?: { quitApp?: () => void; closeApp?: () => void; openUrl?: (url: string) => void };
  }
}

export function quitGame() {
  if (typeof window === "undefined") return;
  if (typeof window.kotbQuit === "function") {
    window.kotbQuit();
    return;
  }
  // Native wrappers (Capacitor, Cordova, Android WebView JS interfaces)
  const cap = window.Capacitor?.Plugins?.App?.exitApp;
  if (cap) return void cap();
  const navApp = (window.navigator as Navigator & { app?: { exitApp?: () => void } }).app;
  if (navApp?.exitApp) return void navApp.exitApp();
  for (const b of [window.Android, window.AndroidBridge]) {
    if (b?.quitApp) return void b.quitApp();
    if (b?.closeApp) return void b.closeApp();
  }
  window.dispatchEvent(new CustomEvent("kotb:quit"));
  window.ReactNativeWebView?.postMessage("kotb:quit");
  if (window.parent !== window) window.parent.postMessage({ type: "kotb:quit" }, "*");
  window.close();
}

/** Opens an external link; wrappers get first pick so links leave the app's WebView correctly. */
export function openExternal(url: string) {
  if (typeof window === "undefined") return;
  for (const b of [window.Android, window.AndroidBridge]) {
    if (b?.openUrl) return void b.openUrl(url);
  }
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "kotb:openUrl", url }));
    return;
  }
  if (window.parent !== window) window.parent.postMessage({ type: "kotb:openUrl", url }, "*");
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) window.location.href = url;
}
