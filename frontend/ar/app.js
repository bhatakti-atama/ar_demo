/**
 * Phase 1: A-Frame WebXR hit-test (surface placement) + HUD + logging.
 * @file app.js
 */

import {
  appDebugLog,
  arScene,
  arPlacementHint,
  calibrationContinue,
  calibrationScreen,
  cameraSelect,
  clearDebugLogBtn,
  copyDebugLogBtn,
  crosshair,
  crosshairLabel,
  drawerClose,
  hudHeader,
  layersModelEl,
  refreshCamerasBtn,
  settingsDrawer,
  settingsGear,
  signalBarInner,
  splashScreen,
  splashStart,
  stableModelRootEl,
  zoomNote,
} from "./modules/dom-elements.js";
import { PERMISSIONS_QUERY_TIMEOUT_MS } from "./modules/marker-config.js";
import { createDebugLog, isLoggingEnabled, isRemoteLoggingEnabled, setLoggingEnabled, setRemoteLoggingEnabled } from "./modules/debug-utils.js";
import {
  initSliderBindings,
  resetModelToDefaults,
  syncSlidersFromState,
} from "./modules/slider-bindings.js";
import {
  applyStreamToTargetVideo,
  bindVideoPipelineLoggers,
  findArVideo,
  formatGetUserMediaError,
  initVideoManager,
  logTrackDetail,
  logVideoList,
  nudgeAllVideos,
  populateCameraSelect,
  reparentArjsVideoIntoViewport,
  requestCameraStream,
  setupTrackControls,
  switchCamera,
  watchVideoElements,
} from "./modules/video-manager.js";
import {
  getDeviceCalibration,
  initModelTransform,
  isMobileDevice,
  onModelLoaded,
  scheduleModelTransform,
  tryInitialModelFit,
} from "./modules/model-transform.js";
import { initTouchGestures, registerArQuickTapHandler, setArTapPlacementMode, setJoystickArSession, setupTouchGestures, syncTouchTargetsFromModel } from "./modules/touch-gestures.js";

const BOOT_T0 = performance.now();
const LOG_NS = "phase1";
const MAX_DEBUG_LOG_LINES = 220;

let firstWebxrPlacement = true;
let signalJitterId = 0;
let toastHideTimer = 0;

const debugLog = createDebugLog({
  bootTime: BOOT_T0,
  namespace: LOG_NS,
  maxLines: MAX_DEBUG_LOG_LINES,
});

// Initialize modules with debugLog
initVideoManager(debugLog);
initModelTransform(debugLog);
initTouchGestures(debugLog);

// --- HUD helpers ---

const showToast = (message, durationMs = 3200) => {
  const el = document.getElementById("hud-toast");
  if (!el) return;
  el.textContent = message;
  el.removeAttribute("hidden");
  el.classList.add("hud-toast--show");
  if (toastHideTimer) clearTimeout(toastHideTimer);
  toastHideTimer = window.setTimeout(() => {
    el.classList.remove("hud-toast--show");
    el.setAttribute("hidden", "true");
  }, durationMs);
};

const setCrosshairTapReady = () => {
  if (!crosshair) return;
  crosshair.classList.remove("locked");
  crosshair.classList.add("scanning");
  if (crosshairLabel) crosshairLabel.textContent = "TAP";
  if (signalBarInner) signalBarInner.dataset.lock = "0";
  updateArPlacementHint();
};

const setCrosshairScanning = () => {
  if (!crosshair) return;
  crosshair.classList.remove("locked");
  crosshair.classList.add("scanning");
  if (crosshairLabel) crosshairLabel.textContent = "SEARCH";
  if (signalBarInner) signalBarInner.dataset.lock = "0";
  updateArPlacementHint();
};

const startSignalJitter = () => {
  if (signalJitterId || !signalBarInner) return;
  signalJitterId = window.setInterval(() => {
    if (signalBarInner.dataset.lock === "1") return;
    const pct = 22 + Math.random() * 68;
    signalBarInner.style.width = `${pct.toFixed(0)}%`;
  }, 450);
  debugLog("P1:hud:signalJitter", "started");
};

const stopSignalJitter = () => {
  if (signalJitterId) {
    clearInterval(signalJitterId);
    signalJitterId = 0;
  }
};

const runHeaderGlitch = () => {
  if (!hudHeader) return;
  hudHeader.classList.add("glitch-active");
  setTimeout(() => hudHeader.classList.remove("glitch-active"), 220);
};

const dismissSplash = () => {
  if (!splashScreen) return;
  splashScreen.classList.add("splash--dismissed");
  splashScreen.setAttribute("aria-hidden", "true");
  debugLog("P1:hud:splash", "dismissed");
};

const showCalibrationScreen = () => {
  if (!calibrationScreen) return;
  calibrationScreen.removeAttribute("hidden");
  calibrationScreen.setAttribute("aria-hidden", "false");
  debugLog("P1:hud:calibration", "shown");
  window.requestAnimationFrame(() => {
    calibrationContinue?.focus();
  });
};

const dismissCalibrationScreen = () => {
  if (!calibrationScreen) return;
  calibrationScreen.setAttribute("hidden", "true");
  calibrationScreen.setAttribute("aria-hidden", "true");
  debugLog("P1:hud:calibration", "dismissed");
};

/** After START SCAN (and optional calibration): toast + camera nudge. */
const finishMissionStart = async () => {
  showToast("Use ENTER AR, then tap the view to place the Sun (drag to use rotation joysticks).", 5500);
  await onNudgeOrManualCamera();
};

// --- Boot & environment logging ---

const logBootEnvironment = () => {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  debugLog("P1:env:document", {
    readyState: document.readyState,
    visibility: document.visibilityState,
    childElementCount: document.body?.childElementCount,
  });
  debugLog("P1:env:location", {
    href: location.href,
    origin: location.origin,
    protocol: location.protocol,
    host: location.host,
  });
  debugLog("P1:env:security", {
    isSecureContext: window.isSecureContext,
    hasSecureContext: "isSecureContext" in window,
  });
  debugLog("P1:env:navigator", {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: nav.languages,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: /** @type {Navigator & { deviceMemory?: number }} */ (nav).deviceMemory,
  });
  debugLog("P1:env:media", {
    hasMediaDevices: Boolean(nav.mediaDevices),
    hasGetUserMedia: Boolean(nav.mediaDevices?.getUserMedia),
  });
  try {
    const c = "connection" in nav
      ? /** @type {Navigator & { connection?: { effectiveType: string, downlink: number } }} */ (nav).connection
      : null;
    if (c) debugLog("P1:env:network", { effectiveType: c.effectiveType, downlink: c.downlink });
  } catch (e) {
    debugLog("P1:env:network", { err: e instanceof Error ? e.message : e });
  }
  if (window.visualViewport) {
    const vv = window.visualViewport;
    debugLog("P1:env:visualViewport:initial", { width: vv.width, height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale });
  }
  if ("memory" in performance) {
    const m = /** @type {Performance & { memory?: { usedJSHeapSize: number, totalJSHeapSize: number, jsHeapSizeLimit: number } }} */ (performance).memory;
    if (m) debugLog("P1:env:heap", { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit });
  }
};

const logScriptTags = () => {
  const scripts = [...document.getElementsByTagName("script")];
  const rows = scripts.map((s, i) => ({
    i,
    src: s.src || "(inline)",
    async: s.async,
    defer: s.defer,
    type: s.type || "text/javascript",
  }));
  debugLog("P1:env:script-count", { count: scripts.length });
  console.table(rows);
  debugLog("P1:env:scripts:detail", rows);
};

const logAframeAndThree = () => {
  const AF = window.AFRAME;
  const TH = typeof window.THREE !== "undefined" ? window.THREE : null;
  debugLog("P1:lib:globals", { hasAFRAME: Boolean(AF), hasTHREE: Boolean(TH) });
  if (AF) {
    debugLog("P1:lib:aframe", { version: AF.version, keyNames: Object.keys(AF).length });
  } else {
    debugLog("P1:lib:aframe:MISSING", "AFRAME not on window; CDN may have failed to load (check 404s).");
  }
  if (TH && "REVISION" in TH) {
    debugLog("P1:lib:three", { revision: /** @type {typeof import('three') & { REVISION: string }} */ (TH).REVISION });
  }
};

const logSceneIntrospection = (scene) => {
  if (!scene) return;
  try {
    const webxr = scene.getAttribute("webxr");
    const xrModeUi = scene.getAttribute("xr-mode-ui");
    const arHitTest = scene.getAttribute("ar-hit-test");
    const renderer = scene.renderer;
    const el = /** @type {import('aframe').Entity} */ (scene);
    const sysKeys = el.systems && typeof el.systems === "object" ? Object.keys(el.systems) : [];
    debugLog("P1:scene:attribs", {
      webxr,
      xrModeUi,
      arHitTest,
      embedded: scene.getAttribute("embedded"),
      hasRenderer: Boolean(renderer),
      systemKeys: sysKeys,
    });
    if (renderer) {
      const cvs = renderer.domElement;
      debugLog("P1:scene:gl", {
        width: cvs?.width,
        height: cvs?.height,
        clientWidth: cvs?.clientWidth,
        clientHeight: cvs?.clientHeight,
        localName: cvs?.localName,
        alpha: renderer.getClearAlpha ? renderer.getClearAlpha() : "n/a",
      });
    }
  } catch (e) {
    debugLog("P1:scene:inspect:error", e instanceof Error ? e.message : e);
  }
};

const logCanvasOnce = (scene) => {
  if (!scene?.renderer?.domElement) return;
  const cvs = scene.renderer.domElement;
  const log = () => {
    debugLog("P1:scene:canvas:measure", {
      w: cvs.width,
      h: cvs.height,
      clientW: cvs.clientWidth,
      clientH: cvs.clientHeight,
      dpr: window.devicePixelRatio,
    });
  };
  requestAnimationFrame(log);
  setTimeout(log, 500);
};

// --- Permission helpers ---

const isSecureCameraContext = () => {
  if (window.isSecureContext) return true;
  const { hostname, protocol } = window.location;
  if (protocol === "file:") return false;
  return protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1");
};

const withTimeout = (promise, ms, label) => {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} (${ms}ms timeout)`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
};

const applyInitialPermissionHints = async () => {
  if (!isSecureCameraContext()) {
    debugLog("P1:perm:unsafe", "Not a safe context for camera (need HTTPS or localhost).");
    showToast("Unsafe context: use HTTPS or localhost.", 6000);
    return;
  }
  try {
    if (navigator.permissions?.query) {
      const result = await withTimeout(
        navigator.permissions.query({ name: "camera" }),
        PERMISSIONS_QUERY_TIMEOUT_MS,
        "permissions.query(camera)",
      );
      debugLog("P1:perm:camera:state", result.state, { onchange: "listener not used" });
    }
  } catch (e) {
    debugLog("P1:perm:query:skip", e instanceof Error ? e.message : String(e));
  }
};

// --- Settings drawer ---

const syncSettingsDrawer = (open) => {
  if (!settingsDrawer || !settingsGear) return;
  settingsDrawer.classList.toggle("drawer--open", open);
  settingsDrawer.setAttribute("aria-hidden", open ? "false" : "true");
  settingsGear.setAttribute("aria-expanded", open ? "true" : "false");
};

if (settingsGear && settingsDrawer) {
  settingsGear.addEventListener("click", () => {
    const isOpen = settingsDrawer.classList.contains("drawer--open");
    syncSettingsDrawer(!isOpen);
  });
}
if (drawerClose && settingsDrawer) {
  drawerClose.addEventListener("click", () => syncSettingsDrawer(false));
}

// --- Camera nudge/manual ---

const onNudgeOrManualCamera = async () => {
  nudgeAllVideos();
  logVideoList("post-nudge");

  const v = findArVideo();
  const track = /** @type {MediaStream|null} */ (v?.srcObject)?.getVideoTracks?.()[0];

  if (track) {
    logTrackDetail(track);
    await populateCameraSelect(track.getSettings?.().deviceId ?? "");
    await setupTrackControls(track);
    showToast("Video track live — use optical zoom in footer.", 4000);
    debugLog("P1:cam:nudge:ar-track-present");
    return;
  }

  if (!window.navigator.mediaDevices?.getUserMedia) {
    debugLog("P1:cam:nudge:no-gum");
    return;
  }

  try {
    const stream = await requestCameraStream();
    await applyStreamToTargetVideo(stream, showToast);
  } catch (e) {
    const msg = formatGetUserMediaError(e);
    debugLog("P1:cam:manual-gum:fail", e instanceof Error ? e.name : e, msg);
    if (zoomNote) zoomNote.textContent = msg;
    showToast(msg, 5000);
  }
};

// --- Mission start ---

const onStartMission = async () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (typeof AC === "function") {
      const ctx = new AC();
      await ctx.resume();
      debugLog("P1:hud:audioContext", { state: ctx.state });
    }
  } catch (e) {
    debugLog("P1:hud:audioContext:skip", e instanceof Error ? e.message : e);
  }
  dismissSplash();
  if (calibrationScreen) {
    showCalibrationScreen();
  } else {
    await finishMissionStart();
  }
};

// --- Error hooks ---

const reportBootError = () => {
  window.addEventListener("error", (event) => {
    debugLog("P1:window:error", { message: event.message, file: event.filename, line: event.lineno });
  });
  window.addEventListener("unhandledrejection", (event) => {
    debugLog("P1:window:unhandledrejection", {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    });
  });
};

// --- Lifecycle ---

const wireLifecycle = () => {
  document.addEventListener("visibilitychange", () => {
    debugLog("P1:life:visibility", { state: document.visibilityState });
  });
  window.addEventListener("pagehide", () => {
    stopSignalJitter();
    debugLog("P1:life:pagehide");
  });
  window.addEventListener("pageshow", (e) => {
    debugLog("P1:life:pageshow", { persisted: e.persisted });
  });
  window.addEventListener("resize", () => {
    debugLog("P1:life:resize", { innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio });
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const v = window.visualViewport;
      if (!v) return;
      debugLog("P1:life:visualViewport:resize", { w: v.width, h: v.height, scale: v.scale });
    });
  }
  window.addEventListener("orientationchange", () => {
    debugLog("P1:life:orientation", { angle: window.screen?.orientation?.angle });
  });
};

// --- WebXR tap placement (floor when looking down; virtual vertical wall otherwise) ---

const AR_PLACEMENT_HINT =
  "Tap to place. Look down for the floor; level view uses a wall sheet. Bottom thirds: left YAW ↔, center PITCH ↕, right ROLL ↔. Two-finger pinch = size.";

const PLACE_FLOOR_MIN_T = 0.25;
const PLACE_FLOOR_MAX_T = 14;
/** Ray direction.y below this ⇒ prefer WebXR floor plane (y = 0). */
const PLACE_LOOK_DOWN_FOR_FLOOR = -0.18;
/** Distance (m) in front of you where we approximate a vertical wall sheet for non-floor taps. */
const WALL_VIRTUAL_DEPTH_M = 1.5;
const PLACE_FALLBACK_M = 1.35;

/**
 * @param {import("three").Vector3} origin ray origin (world)
 * @param {import("three").Vector3} dir unit direction (world)
 * @param {import("three").PerspectiveCamera} camObj
 * @param {typeof import("three")} TH
 * @param {import("three").Vector3} out
 */
const computePlacePoint = (origin, dir, camObj, TH, out) => {
  // 1) Floor plane y = 0 (local-floor), only when aiming clearly downward
  if (dir.y < PLACE_LOOK_DOWN_FOR_FLOOR - 1e-6) {
    const tFloor = -origin.y / dir.y;
    if (tFloor >= PLACE_FLOOR_MIN_T && tFloor <= PLACE_FLOOR_MAX_T) {
      debugLog("P1:webxr:tap-place:branch", "floor");
      return out.copy(dir).multiplyScalar(tFloor).add(origin);
    }
  }

  // 2) Vertical plane through camPos + horizontalForward * depth, normal = horizontalForward
  const camPos = new TH.Vector3();
  camObj.getWorldPosition(camPos);
  const quat = new TH.Quaternion();
  camObj.getWorldQuaternion(quat);
  const forward = new TH.Vector3(0, 0, -1).applyQuaternion(quat).normalize();
  const h = new TH.Vector3(forward.x, 0, forward.z);
  if (h.lengthSq() < 1e-8) {
    h.set(0, 0, -1);
  } else {
    h.normalize();
  }

  const tDenom = dir.dot(h);
  if (Math.abs(tDenom) > 1e-5) {
    const p0x = camPos.x + h.x * WALL_VIRTUAL_DEPTH_M;
    const p0y = camPos.y + h.y * WALL_VIRTUAL_DEPTH_M;
    const p0z = camPos.z + h.z * WALL_VIRTUAL_DEPTH_M;
    const tWall = ((p0x - origin.x) * h.x + (p0y - origin.y) * h.y + (p0z - origin.z) * h.z) / tDenom;
    if (tWall >= PLACE_FLOOR_MIN_T && tWall <= PLACE_FLOOR_MAX_T) {
      debugLog("P1:webxr:tap-place:branch", "wall-plane");
      return out.copy(dir).multiplyScalar(tWall).add(origin);
    }
  }

  debugLog("P1:webxr:tap-place:branch", "fallback-ray");
  return out.copy(dir).multiplyScalar(PLACE_FALLBACK_M).add(origin);
};

const isInteractiveHudAt = (clientX, clientY) => {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return false;
  return Boolean(
    el.closest(
      ".control-bar, .hud-header, .settings-drawer, .splash-screen:not(.splash--dismissed), #calibration-screen:not([hidden]), label, button, input, select, textarea, a[href], .model-loading-status, .hud-toast",
    ),
  );
};

/**
 * A-Frame may set `scene.camera` to the camera entity or to the raw THREE camera.
 * @param {import('aframe').Scene} scene
 * @returns {import('three').PerspectiveCamera | import('three').OrthographicCamera | null}
 */
const resolveSceneThreeCamera = (scene) => {
  if (!scene) return null;
  const camRef = scene.camera;
  if (!camRef) return null;
  if (typeof camRef.getObject3D === "function") {
    const fromEntity = camRef.getObject3D("camera");
    if (fromEntity && "isCamera" in fromEntity && fromEntity.isCamera) return fromEntity;
  }
  if ("isCamera" in camRef && camRef.isCamera) {
    return camRef;
  }
  const fromComp = /** @type {{ components?: { camera?: { camera?: import('three').Camera } } }} */ (
    camRef
  ).components?.camera?.camera;
  if (fromComp && "isCamera" in fromComp && fromComp.isCamera) {
    return /** @type {import('three').PerspectiveCamera} */ (fromComp);
  }
  return null;
};

/** @param {import('aframe').Scene} scene */
const placeSunAtScreen = (scene, clientX, clientY) => {
  const TH = window.THREE;
  if (!TH || !scene?.renderer?.xr?.isPresenting || !stableModelRootEl) return;

  const canvas = scene.canvas;
  const camObj = resolveSceneThreeCamera(scene);
  if (!canvas || !camObj) {
    debugLog("P1:webxr:tap-place:skip", { hasCanvas: Boolean(canvas), hasCam: Boolean(camObj) });
    return;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;

  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

  try {
    camObj.updateMatrixWorld(true);
    const raycaster = new TH.Raycaster();
    raycaster.setFromCamera(new TH.Vector2(ndcX, ndcY), camObj);

    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction.clone().normalize();
    const point = computePlacePoint(origin, dir, camObj, TH, new TH.Vector3());

    stableModelRootEl.setAttribute("position", { x: point.x, y: point.y, z: point.z });
    stableModelRootEl.setAttribute("visible", true);

    showToast(
      firstWebxrPlacement ? "Placed — tap again to move. Side drags spin the model." : "Moved.",
      firstWebxrPlacement ? 3200 : 1600,
    );
    if (firstWebxrPlacement) {
      firstWebxrPlacement = false;
      runHeaderGlitch();
    }
    tryInitialModelFit();
    scheduleModelTransform({ recomputeScale: true });
    setCrosshairTapReady();
    debugLog("P1:webxr:tap-place", { x: point.x.toFixed(3), y: point.y.toFixed(3), z: point.z.toFixed(3) });
  } catch (err) {
    debugLog("P1:webxr:tap-place:error", err instanceof Error ? err.message : err);
  }
};

/** Shown during handheld AR session (tap-to-place + joystick guidance). */
const updateArPlacementHint = () => {
  if (!arPlacementHint || !arScene) return;
  if (!arScene.is("ar-mode")) {
    arPlacementHint.setAttribute("hidden", "true");
    return;
  }

  arPlacementHint.textContent = AR_PLACEMENT_HINT;
  arPlacementHint.removeAttribute("hidden");
};

const wireWebXrTapPlacement = () => {
  if (!arScene) return;

  arScene.addEventListener("exit-vr", () => {
    setArTapPlacementMode(false);
    setJoystickArSession(false);
    if (stableModelRootEl) stableModelRootEl.setAttribute("visible", false);
    setCrosshairScanning();
    updateArPlacementHint();
    debugLog("P1:webxr:session-end");
  });

  arScene.addEventListener("enter-vr", () => {
    if (arScene.is("ar-mode")) {
      setArTapPlacementMode(true);
      setJoystickArSession(true);
      setCrosshairTapReady();
    } else {
      setArTapPlacementMode(false);
      setJoystickArSession(false);
    }
    updateArPlacementHint();
  });
};

/**
 * Custom ENTER / EXIT AR control (avoids xr-mode-ui hiding the button mid-session).
 * @param {import('aframe').Scene} scene
 */
const wireEnterArButton = (scene) => {
  const btn = document.getElementById("enter-ar-hud");
  if (!btn || !scene) return;

  const sync = () => {
    // Immersive AR uses `ar-mode`; headset VR uses `vr-mode` (A-Frame a-scene.enterVR.)
    const inSession = scene.is("vr-mode") || scene.is("ar-mode");
    btn.textContent = inSession ? "EXIT AR" : "ENTER AR";
    btn.classList.toggle("in-ar-session", Boolean(inSession));
    btn.setAttribute(
      "aria-label",
      inSession ? "Exit AR session" : "Enter WebXR AR, then tap the view to place the model",
    );
    updateArPlacementHint();
    setArTapPlacementMode(scene.is("ar-mode"));
    setJoystickArSession(scene.is("ar-mode"));
  };

  scene.addEventListener("enter-vr", sync);
  scene.addEventListener("exit-vr", sync);
  sync();

  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (scene.is("vr-mode") || scene.is("ar-mode")) {
      if (typeof scene.exitVR === "function") scene.exitVR();
    } else if (typeof scene.enterAR === "function") {
      scene.enterAR();
    }
  });
};

// --- Run ---

logBootEnvironment();

debugLog("P1:model:device-calibration", {
  isMobile: isMobileDevice(),
  calibration: getDeviceCalibration(),
});

logScriptTags();
logAframeAndThree();
reportBootError();
wireLifecycle();
watchVideoElements();
void applyInitialPermissionHints();
syncSettingsDrawer(false);
startSignalJitter();
setCrosshairScanning();

// Scene events
if (arScene) {
  const sceneLoadStart = performance.now();
  
  const assets = arScene.querySelector("a-assets");
  if (assets) {
    assets.addEventListener("loaded", () => {
      const assetsLoadTime = Math.round(performance.now() - sceneLoadStart);
      debugLog("P1:assets:loaded", { loadTimeMs: assetsLoadTime });
    });
  }
  
  arScene.addEventListener("loaded", () => {
    const sceneLoadTime = Math.round(performance.now() - sceneLoadStart);
    debugLog("P1:scene:loaded", { id: arScene.id, loadTimeMs: sceneLoadTime });
    logSceneIntrospection(arScene);
    logCanvasOnce(/** @type {import('aframe').Scene} */ (arScene));
    reparentArjsVideoIntoViewport();
    setupTouchGestures();
    wireEnterArButton(arScene);
    registerArQuickTapHandler((x, y) => {
      if (!arScene?.is("ar-mode") || !arScene.renderer?.xr?.isPresenting) return;
      if (isInteractiveHudAt(x, y)) return;
      placeSunAtScreen(arScene, x, y);
    });

    if (navigator.xr?.isSessionSupported) {
      void navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        debugLog("P1:webxr:immersive-ar_supported", { supported, secureContext: window.isSecureContext });
        if (!supported) {
          showToast(
            "WebXR AR not available (try Chrome on Android, trusted HTTPS, or fix the certificate warning).",
            9000,
          );
        }
      });
    } else {
      debugLog("P1:webxr:no_api", { secureContext: window.isSecureContext });
    }
  });
  arScene.addEventListener("renderstart", () => {
    debugLog("P1:scene:renderstart");
  });
} else {
  debugLog("P1:scene:missing", "No #ar-scene");
}

wireWebXrTapPlacement();

// Model loading UI elements
const modelLoadingStatus = document.getElementById("model-loading-status");
const loadingText = document.getElementById("loading-text");
const loadingProgressBar = document.getElementById("loading-progress-bar");
const loadingPercent = document.getElementById("loading-percent");
const splashStartBtn = document.getElementById("splash-start");

/**
 * Update loading progress UI
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} [status] - Optional status text
 */
const updateLoadingProgress = (percent, status) => {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  if (loadingProgressBar) {
    loadingProgressBar.style.width = `${clampedPercent}%`;
  }
  if (loadingPercent) {
    loadingPercent.textContent = `${Math.round(clampedPercent)}%`;
  }
  if (status && loadingText) {
    loadingText.textContent = status;
  }
};

// Model loaded event
const modelLoadStart = performance.now();
debugLog("P1:model:load-start", { timestamp: modelLoadStart });

// Hook into THREE.js loading manager for real progress
if (window.THREE?.DefaultLoadingManager) {
  const manager = window.THREE.DefaultLoadingManager;
  let itemsLoaded = 0;
  let itemsTotal = 0;
  
  manager.onStart = (url, loaded, total) => {
    itemsLoaded = loaded;
    itemsTotal = total;
    updateLoadingProgress(5, "Loading assets...");
    debugLog("P1:model:loader-start", { url, loaded, total });
  };
  
  manager.onProgress = (url, loaded, total) => {
    itemsLoaded = loaded;
    itemsTotal = total;
    const percent = 5 + (loaded / total) * 85; // 5-90%
    updateLoadingProgress(percent, "Loading model...");
  };
  
  manager.onLoad = () => {
    updateLoadingProgress(90, "Processing...");
    debugLog("P1:model:loader-complete", { itemsLoaded, itemsTotal });
  };
  
  manager.onError = (url) => {
    debugLog("P1:model:loader-error", { url });
  };
} else {
  // Fallback: animate progress while waiting
  updateLoadingProgress(10, "Loading model...");
  let fakeProgress = 10;
  const progressInterval = setInterval(() => {
    fakeProgress += Math.random() * 8;
    if (fakeProgress >= 85) {
      clearInterval(progressInterval);
      fakeProgress = 85;
    }
    updateLoadingProgress(fakeProgress, "Loading model...");
  }, 200);
  
  // Clear interval when model loads
  if (layersModelEl) {
    layersModelEl.addEventListener("model-loaded", () => clearInterval(progressInterval), { once: true });
  }
}

if (layersModelEl) {
  layersModelEl.addEventListener("model-loaded", () => {
    const loadTime = Math.round(performance.now() - modelLoadStart);
    debugLog("P1:model:loaded", { loadTimeMs: loadTime });

    updateLoadingProgress(95, "Preparing scene...");
    
    // Quick finish animation
    setTimeout(() => {
      updateLoadingProgress(100, "Ready!");
      onModelLoaded();
      
      setTimeout(() => {
        if (modelLoadingStatus) {
          modelLoadingStatus.classList.add("hidden");
        }
        if (splashStartBtn) {
          splashStartBtn.disabled = false;
        }
      }, 200);
    }, 100);
  });
  
  layersModelEl.addEventListener("model-error", (e) => {
    debugLog("P1:model:error", { error: e.detail?.message || "Unknown error" });
    if (loadingText) {
      loadingText.textContent = "Failed to load model";
    }
    if (loadingProgressBar) {
      loadingProgressBar.style.background = "linear-gradient(90deg, #ff3355, #ff5555)";
    }
  });
}

// Late fit fallback
setTimeout(tryInitialModelFit, 1500);

// Initialize sliders with callbacks
initSliderBindings({
  onModelTransformChange: scheduleModelTransform,
});
syncSlidersFromState();

// UI event handlers
if (splashStart) {
  splashStart.addEventListener("click", () => void onStartMission());
}

if (calibrationContinue) {
  calibrationContinue.addEventListener("click", () => {
    dismissCalibrationScreen();
    void finishMissionStart();
  });
}

if (refreshCamerasBtn) {
  refreshCamerasBtn.addEventListener("click", async () => {
    const v = findArVideo();
    const id = /** @type {MediaStream|null} */ (v?.srcObject)?.getVideoTracks?.()[0]?.getSettings?.().deviceId ?? "";
    await populateCameraSelect(id);
    logVideoList("after-refresh");
  });
}

// Reset model button
const resetModelBtn = document.getElementById("reset-model-btn");
if (resetModelBtn) {
  resetModelBtn.addEventListener("click", () => {
    resetModelToDefaults();
    syncTouchTargetsFromModel();
    scheduleModelTransform({ recomputeScale: true });
    showToast("Model reset to defaults", 1500);
    debugLog("P1:model:reset", "Model transform reset to defaults");
  });
}

if (cameraSelect) {
  cameraSelect.addEventListener("change", () => {
    void switchCamera(cameraSelect.value, showToast);
  });
}

// Single delayed video check (MutationObserver handles dynamic injection)
setTimeout(() => {
  for (const v of document.querySelectorAll("video")) {
    bindVideoPipelineLoggers(/** @type {HTMLVideoElement} */ (v));
  }
  const v = findArVideo();
  if (v) {
    const t = /** @type {MediaStream|null} */ (v.srcObject)?.getVideoTracks?.()[0];
    if (t) {
      logTrackDetail(t);
      void populateCameraSelect(t.getSettings?.().deviceId ?? "");
      void setupTrackControls(t);
    }
  }
  logVideoList("2s-snapshot");
}, 2000);

// Debug log actions
if (copyDebugLogBtn && appDebugLog) {
  copyDebugLogBtn.addEventListener("click", async () => {
    const text = appDebugLog.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      showToast("Log copied to clipboard", 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast("Log copied to clipboard", 2000);
    }
  });
}

if (clearDebugLogBtn && appDebugLog) {
  clearDebugLogBtn.addEventListener("click", () => {
    appDebugLog.textContent = "";
    showToast("Log cleared", 1500);
  });
}

// Logging toggles
const toggleLoggingEl = document.getElementById("toggle-logging");
const toggleRemoteLoggingEl = document.getElementById("toggle-remote-logging");

if (toggleLoggingEl) {
  toggleLoggingEl.checked = isLoggingEnabled();
  toggleLoggingEl.addEventListener("change", () => {
    setLoggingEnabled(toggleLoggingEl.checked);
    showToast(`Logging ${toggleLoggingEl.checked ? "enabled" : "disabled"}`, 1500);
  });
}

if (toggleRemoteLoggingEl) {
  toggleRemoteLoggingEl.checked = isRemoteLoggingEnabled();
  toggleRemoteLoggingEl.addEventListener("change", () => {
    setRemoteLoggingEnabled(toggleRemoteLoggingEl.checked);
    showToast(`Remote logging ${toggleRemoteLoggingEl.checked ? "enabled" : "disabled"}`, 1500);
  });
}

debugLog("P1:boot:app-js:end", { ms: Math.round(performance.now() - BOOT_T0) });
