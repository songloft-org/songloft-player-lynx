import * as host from "@lynx-js/lynxtron";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve, dirname } from "node:path";
import { assertTarget } from "./target.mjs";
import { desktopIdentity } from "./host/identity.mjs";
import { createDesktopStorage } from "./host/storage.mjs";
import { HostNetwork } from "./host/network.mjs";
import { createPlatformServices } from "./host/platform.mjs";
import { DesktopBackend, unavailableMusicDirectory } from "./host/backend.mjs";
import { DesktopPlayer } from "./host/player.mjs";
import { DesktopSession } from "./host/session.mjs";
import { createHostRpc } from "./host/rpc.mjs";
import { singleInstance } from "./host/single-instance.mjs";
import { DesktopCache } from "./host/cache.mjs";
import { DesktopSystem, DesktopMedia } from "./host/system.mjs";
import { DesktopUpdater } from "./host/updater.mjs";
import {
  backupDatabase,
  confirmUpdateStartup,
} from "./host/database-backup.mjs";
import { DesktopLog } from "./host/logging.mjs";
import { DesktopResources } from "./host/resources.mjs";
import { DesktopKeyboard } from "./host/keyboard.mjs";
import { DesktopPluginSockets } from "./host/plugin-sockets.mjs";
import { DesktopVisibility } from "./host/visibility.mjs";

const {
  app,
  LynxWindow,
  dialog,
  shell,
  clipboard,
  lynxBridge,
  Menu,
  Tray,
  nativeImage,
  screen,
} = host;
const root = fileURLToPath(new URL(".", import.meta.url));
let window, tray, services, instance;
let cefRepaint;
let quitting = false;
const prepared = new Map();
const send = (name, payload) => window?.sendGlobalEvent(name, payload);
function showWindow() {
  if (!window) createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
async function quit({ prepared: alreadyPrepared = false } = {}) {
  if (quitting) return;
  quitting = true;
  try {
    if (services) {
      if (window && !alreadyPrepared)
        await services.prepare("quit").catch(() => {});
      await services.updater?.close();
      await services.session.close();
      services.visibility.close();
      await services.player.close();
      await services.cache.close();
      services.system.close();
      await services.log.close();
      services.resourceLoader.close();
      services.keyboard.close();
      services.sockets.close();
      await services.network.close();
    }
    tray?.destroy();
    await instance?.close();
    app.quit();
  } catch (error) {
    console.error("[desktop] Shutdown failed", error?.name);
    app.exit(1);
  }
}
function createWindow() {
  const bundle =
    services.config.id.endsWith(".dev") &&
    process.env.SONGLOFT_DESKTOP_TEST_BUNDLE
      ? resolve(process.env.SONGLOFT_DESKTOP_TEST_BUNDLE)
      : existsSync(join(services.resources, "app", "main.lynx.bundle"))
        ? join(services.resources, "app", "main.lynx.bundle")
        : join(root, "..", "dist", "main.lynx.bundle");
  if (!existsSync(bundle))
    throw new Error("Missing desktop bundle; run pnpm run desktop:build");
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  window = new LynxWindow({
    width: Math.min(1280, workArea.width),
    height: Math.min(820, workArea.height),
    minWidth: Math.min(780, workArea.width),
    minHeight: Math.min(560, workArea.height),
    center: true,
    title: "Songloft",
  });
  window.on("--lynx-error", () =>
    console.error("[desktop] Lynx runtime error"),
  );
  window.on("close", (event) => {
    if (!quitting && (process.platform === "darwin" || tray)) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    window = null;
  });
  services.visibility.attach(window);
  window.on("enter-full-screen", () =>
    send("SongloftVideo.fullscreenChanged", { active: true }),
  );
  window.on("leave-full-screen", () =>
    send("SongloftVideo.fullscreenChanged", { active: false }),
  );
  services.media.initialize(window.getNativeWindowHandle());
  services.keyboard.initialize(
    window.getNativeWindowHandle(),
    process.platform === "win32" && !!tray,
  );
  if (
    !window.loadFile(bundle, {
      globalProps: {
        songloftDesktop: services.config,
        deployMode: "standalone",
        ...services.system.current,
        systemLanguage:
          typeof app.getLocale === "function"
            ? app.getLocale()
            : Intl.DateTimeFormat().resolvedOptions().locale,
      },
    })
  )
    throw new Error("Lynx rejected the bundle load request");
  window.show();
}
function createMenus() {
  const modeItem = (label, mode) => ({
    label,
    enabled: mode !== "local" || !!services.config.capabilities.bundle,
    click: () => {
      showWindow();
      send("SongloftDesktop.switchMode", { mode });
    },
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Songloft",
        submenu: [
          { label: "Show Songloft", click: showWindow },
          modeItem("Local music…", "local"),
          modeItem("Connect to server…", "remote"),
          { type: "separator" },
          {
            label: "Quit Songloft",
            accelerator: "CommandOrControl+Q",
            click: () => void quit(),
          },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { label: "Show Songloft", click: showWindow },
          { role: "togglefullscreen" },
        ],
      },
    ]),
  );
  const image = nativeImage
    .createFromPath(
      existsSync(join(services.resources, "app", "app_icon.png"))
        ? join(services.resources, "app", "app_icon.png")
        : join(root, "..", "web", "app_icon.png"),
    )
    .resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip("Songloft");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Songloft", click: showWindow },
      { label: "Play", click: () => services.player.remote("play") },
      { label: "Pause", click: () => services.player.remote("pause") },
      { label: "Next", click: () => services.player.remote("next") },
      { type: "separator" },
      { label: "Quit Songloft", click: () => void quit() },
    ]),
  );
  tray.on("click", showWindow);
}
async function start() {
  const target = assertTarget();
  const packagedResources =
    process.resourcesPath ??
    (process.platform === "darwin"
      ? join(dirname(dirname(process.execPath)), "Resources")
      : join(dirname(process.execPath), "resources"));
  const resources = resolve(
    process.env.SONGLOFT_DESKTOP_RESOURCES ??
      (existsSync(join(packagedResources, "songloft"))
        ? join(packagedResources, "songloft")
        : join(root, "resources", target)),
  );
  const metadataFile = join(resources, "build-info.json");
  const buildInfo = existsSync(metadataFile)
    ? JSON.parse(readFileSync(metadataFile, "utf8"))
    : null;
  const channel =
    buildInfo?.channel === "stable" ||
    (!buildInfo && process.env.SONGLOFT_DESKTOP_CHANNEL === "stable")
      ? "stable"
      : "dev";
  const developmentDataRoot =
    channel === "dev" ? process.env.SONGLOFT_DESKTOP_DATA_ROOT : undefined;
  const identity = desktopIdentity({
    channel,
    appData: developmentDataRoot
      ? resolve(developmentDataRoot)
      : app.getPath("appData"),
    isolateProfile: !!developmentDataRoot,
  });
  app.setName("Songloft");
  host.devtool.setDevToolEnabled(channel === "dev");
  mkdirSync(identity.data, { recursive: true, mode: 0o700 });
  app.setPath("userData", identity.data);
  if (process.platform === "win32") {
    // The official CEF module scopes its cache by the Windows AppUserModelID.
    app.setAppUserModelId(identity.appUserModelId);
    // CEF reads the OS command line. Its GPU process can fail even when DXGI
    // reports an adapter that the native video surface can use.
    if (!process.argv.includes("--disable-gpu")) {
      app.relaunch({ args: [...process.argv.slice(1), "--disable-gpu"] });
      app.exit(0);
      return;
    }
  }
  const require = createRequire(import.meta.url);
  if (process.platform === "win32")
    process.env.PATH = `${join(resources, "native")};${process.env.PATH ?? ""}`;
  const native = require(
    existsSync(join(resources, "native", "songloft_mpv.node"))
      ? join(resources, "native", "songloft_mpv.node")
      : join(root, ".build", target, "songloft_mpv.node"),
  );
  instance = await singleInstance(
    identity.id,
    () => {
      if (services) showWindow();
    },
    native.acquireInstance,
  );
  if (!instance.primary) {
    app.quit();
    return;
  }
  const stagedCef = join(
    root,
    ".lynxtron",
    "native",
    "node_modules",
    "@lynx-js",
    "cef-webview",
    "index.cjs",
  );
  (existsSync(stagedCef)
    ? require(stagedCef)
    : require("@lynx-js/cef-webview/lynxtron")
  ).initialize();
  const token = randomBytes(32).toString("hex");
  native.setBridgeToken(token);
  const storage = createDesktopStorage({ identity, native });
  const log = new DesktopLog(join(identity.data, "logs"));
  const network = new HostNetwork();
  const resourceLoader = new DesktopResources({ native, network });
  const sockets = new DesktopPluginSockets({ network, send });
  const platform = createPlatformServices({
    dialog,
    shell,
    clipboard,
    getWindow: () => window,
    network,
  });
  const system = new DesktopSystem(native);
  system.on("appearance", (appearance) =>
    send("SongloftSystem.appearanceChanged", appearance),
  );
  const media = new DesktopMedia(native);
  const player = new DesktopPlayer({ native, network, media });
  const keyboard = new DesktopKeyboard({
    native,
    send,
    hideWindow: () => {
      if (!quitting) window?.hide();
    },
  });
  media.on("intent", (intent) => {
    if (intent.command === "seek")
      void player
        .command({ method: "seek", value: intent.positionMs })
        .catch(() => {});
    else player.remote(intent.command);
  });
  const cache = new DesktopCache({
    directory: join(identity.cache, "songs"),
    network,
  });
  await cache.ready();
  cache.on("progress", (event) => send("songCacheProgress", event));
  const credentials = async () => {
    let password = await storage.secure.get("bundle.adminPassword");
    if (!password) {
      password = randomBytes(32).toString("base64url");
      await storage.secure.set("bundle.adminPassword", password);
    }
    return { username: "admin", password };
  };
  const executable = join(
    resources,
    "backend",
    process.platform === "win32" ? "songloft.exe" : "songloft",
  );
  const backend = new DesktopBackend({
    executable,
    toolsDirectory: join(resources, "tools"),
    dataDirectory: identity.backend,
    credentials,
  });
  backend.on("log", (line) => {
    void log.write(`[backend] ${line}`).catch(() => {});
  });
  const prepare = async (mode) => {
    if (!window) return;
    const id = randomUUID();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        prepared.delete(id);
        reject(new Error("Page cleanup timed out"));
      }, 12000);
      prepared.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
      send("SongloftDesktop.prepare", { id, mode });
    });
  };
  let updater = null;
  const session = new DesktopSession({
    cancelPluginWork: () => {
      resourceLoader.cancelAll();
      sockets.closeAll();
    },
    cache,
    storage,
    backend,
    platform,
    player,
    network,
    credentials,
    prepare,
    confirmUpdate: async () => confirmUpdate?.(),
    localFailure: async (error) => localFailure(error),
    publish: (mode) => {
      if (mode === "local" || mode === "remote") config.sessionKind = mode;
      send("SongloftDesktop.sessionChanged", { mode });
    },
  });
  const config = {
    id: identity.id,
    token,
    os: process.platform,
    ...(buildInfo?.version && buildInfo?.clientSha && buildInfo?.builtAt
      ? {
          build: {
            version: buildInfo.version,
            clientSha: buildInfo.clientSha,
            builtAt: buildInfo.builtAt,
          },
        }
      : {}),
    audioFormats: native.audioFormats(),
    videoFormats: native.videoFormats(),
    assetBaseUrl: pathToFileURL(
      existsSync(join(resources, "app", "app_icon.png"))
        ? join(resources, "app")
        : join(root, "..", "web"),
    ).href,
    capabilities: {
      bundle:
        existsSync(executable) &&
        ["ffmpeg", "ffprobe"].every((name) =>
          existsSync(
            join(
              resources,
              "tools",
              name + (process.platform === "win32" ? ".exe" : ""),
            ),
          ),
        ),
      tray: false,
      filePicker: true,
      fileExport: true,
      audio: true,
      video: true,
      equalizer: true,
      songCache: true,
      shortcuts: true,
      updates: false,
    },
  };
  services = {
    visibility: new DesktopVisibility({
      native,
      send,
      powerMonitor: host.powerMonitor,
      config,
    }),
    resources,
    sockets,
    keyboard,
    native,
    resourceLoader,
    log,
    system,
    media,
    cache,
    storage,
    network,
    platform,
    player,
    backend,
    session,
    config,
    prepare,
  };
  const appPath =
    process.platform === "darwin"
      ? dirname(dirname(dirname(process.execPath)))
      : dirname(process.execPath);
  const updateDirectory = join(identity.data, "updates");
  let updateConfirmation = Promise.resolve();
  const confirmUpdate = async () => {
    if (!updater) return null;
    updateConfirmation = updateConfirmation
      .catch(() => {})
      .then(() =>
        confirmUpdateStartup({
          directory: updateDirectory,
          appPath,
          version: buildInfo.version,
          clientSha: buildInfo.clientSha,
          backendSha: buildInfo.backendSha,
          backendRunning: backend.state.state === "running",
          // The launcher treats app.asar as a virtual directory in node:fs.
          removePrevious: (path) =>
            require("original-fs").promises.rm(path, {
              recursive: true,
              force: true,
              maxRetries: 3,
            }),
          onCleanupError: (error) => {
            void log
              .write(`Update cleanup failed: ${error.message}`)
              .catch(() => {});
          },
        }),
      );
    return updateConfirmation;
  };
  if (
    buildInfo?.updatePublicKey &&
    buildInfo.appId === identity.id &&
    buildInfo.target === target
  ) {
    updater = new DesktopUpdater({
      directory: updateDirectory,
      network,
      identity,
      currentVersion: buildInfo.version,
      currentClientSha: buildInfo.clientSha,
      currentBuiltAt: buildInfo.builtAt,
      variant: buildInfo.variant ?? "bundled",
      publicKey: buildInfo.updatePublicKey,
      manifestUrl: buildInfo.updateManifest,
      requestProxy: (request) =>
        send("SongloftDesktop.updateProxyRequested", request),
      helper: join(
        resources,
        "updater",
        process.platform === "win32"
          ? "songloft-update.exe"
          : "songloft-update",
      ),
      appPath,
      stop: () => session.stopForUpdate(),
      backup: () =>
        backupDatabase({
          dataDirectory: identity.backend,
          directory: updateDirectory,
          version: buildInfo.version,
          backendSha: buildInfo.backendSha,
        }),
    });
    updater.on("state", (state) => {
      send("SongloftDesktop.update", state);
      if (state.state === "ready")
        tray?.setToolTip("Songloft · Restart and install update");
    });
    updater.on("install-started", () => {
      void quit({ prepared: true });
    });
    services.updater = updater;
    config.capabilities.updates = true;
  }
  const localFailure = async (error) => {
    if (error?.message === unavailableMusicDirectory) return false;
    const keychainMessage =
      error?.message === "keychain_interaction_required" ||
      error?.message === "Keychain error -25308"
        ? "macOS could not access the login Keychain. Unlock it or allow Songloft to access credentials, then retry."
        : error?.message === "keychain_signing_required" ||
            error?.message === "Keychain error -34018"
          ? "This development build is not signed with an application identifier required for macOS Keychain access."
          : null;
    const recovery = keychainMessage
      ? false
      : await updater?.recoveryAvailable();
    const result = await dialog.showMessageBox({
      type: "error",
      title: "Songloft",
      message:
        keychainMessage ??
        (recovery
          ? "The local server could not start after an update. Restore the previous application and its matching database backup? Failed migration files will be retained."
          : "The local server could not start. Review the desktop log, then choose Local music from the menu to retry."),
      buttons: recovery
        ? [
            "Keep files and retry later",
            "Restore application and database backup",
          ]
        : ["OK"],
      defaultId: 0,
      cancelId: 0,
    });
    if (recovery && result.response === 1) {
      await updater.recover();
      return true;
    }
    return false;
  };
  const rpc = createHostRpc({
    sockets,
    keyboard,
    log,
    updater,
    confirmUpdate,
    windowServices: {
      fullscreen({ enabled }) {
        window?.setFullScreen(enabled === true);
        return { supported: true, active: window?.isFullScreen() === true };
      },
      fullscreenState() {
        return { supported: true, active: window?.isFullScreen() === true };
      },
      repaintCef() {
        if (!window || !native.repaintCef) return null;
        const target = window;
        clearTimeout(cefRepaint);
        cefRepaint = setTimeout(() => {
          if (window === target && !quitting)
            native.repaintCef(target.getNativeWindowHandle());
        }, 250);
        cefRepaint.unref();
        return null;
      },
    },
    cache,
    token,
    storage,
    backend,
    platform,
    network,
    player,
    lifecycle: session,
    getLocalCredentials: credentials,
  });
  lynxBridge.handle("songloft.desktop.rpc", (_event, raw) => {
    if (channel === "dev" && process.env.SONGLOFT_DESKTOP_DIAGNOSTICS === "1") {
      try {
        console.info("[desktop-rpc]", JSON.parse(raw).method);
      } catch {}
    }
    return rpc(raw);
  });
  lynxBridge.handle("songloft.desktop.prepared", (_event, raw) => {
    try {
      const data = JSON.parse(raw);
      if (data.token === token) {
        prepared.get(data.id)?.();
        prepared.delete(data.id);
      }
    } catch {}
    return null;
  });
  player.on("event", (event) => send(`SongloftAudio.${event.type}`, event));
  createMenus();
  config.capabilities.tray = !!tray;
  const savedMode = await storage.prefs.get("desktop.mode");
  if (savedMode === "local") {
    try {
      await session.local({ initial: true });
    } catch (error) {
      await log
        .write(`Local backend startup failed: ${error?.stack ?? error}`)
        .catch(() => {});
      if (await localFailure(error)) return;
    }
  } else {
    // Remote login is the default on a fresh install. Mode choice lives in the
    // login and settings screens, not in a native first-run modal.
    await session.remote({ initial: true });
  }
  config.sessionKind = await storage.prefs.get("desktop.mode");
  createWindow();
  const failureMarker = join(updateDirectory, "last-install-failure");
  if (updater && existsSync(failureMarker)) {
    const chinese = /^zh(?:-|$)/i.test(app.getLocale?.() ?? "");
    try {
      const { response } = await dialog.showMessageBox(window, {
        type: "error",
        title: "Songloft",
        message: chinese
          ? "应用更新未完成"
          : "Application update did not complete",
        detail: chinese
          ? "安装日志包含失败原因。"
          : "The installer log contains details about the failure.",
        buttons: chinese
          ? ["关闭", "查看安装日志"]
          : ["Dismiss", "Show installer log"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response === 1)
        shell.showItemInFolder(join(updateDirectory, "install.log"));
      await unlink(failureMarker);
    } catch (error) {
      await log
        .write(`Installer notification failed: ${error?.message ?? error}`)
        .catch(() => {});
    }
  }
}
if (process.argv.includes("--probe")) await import("./probe-main.mjs");
else {
  app
    .whenReady()
    .then(start)
    .catch(async (error) => {
      console.error("[desktop] Startup failed:", error);
      await dialog.showMessageBox({
        type: "error",
        title: "Songloft",
        message: String(error),
      });
      app.exit(1);
    });
  app.on("activate", () => {
    if (services && !quitting) showWindow();
  });
  app.on("before-quit", (event) => {
    if (!quitting) {
      event.preventDefault();
      void quit();
    }
  });
}
