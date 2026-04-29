/**
 * Phase 1 (plan.md): A-Frame + AR.js (CDN) + secure context + maximum structured logging.
 * Refactored for clarity - redundant logic moved to dedicated modules.
 * @file app.js
 */

import {
  arScene,
  cameraSelect,
  crosshair,
  crosshairLabel,
  detectedMarkersEl,
  drawerClose,
  hudHeader,
  layersModelEl,
  markerEls,
  refreshCamerasBtn,
  settingsDrawer,
  settingsGear,
  signalBarInner,
  solarModelEl,
  splashScreen,
  splashStart,
  stableModelRootEl,
  zoomNote,
} from "./modules/dom-elements.js";
import {
  MARKER_LAYOUT,
  PERMISSIONS_QUERY_TIMEOUT_MS,
  getContextBiasByVisibleCount,
  getCornerOffset,
  markerIdToBarcodeValue,
} from "./modules/marker-config.js";
import { createDebugLog } from "./modules/debug-utils.js";
import {
  initSliderBindings,
  stabilizerState,
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

const BOOT_T0 = performance.now();
const LOG_NS = "phase1";
const MAX_DEBUG_LOG_LINES = 220;

let firstMarkerLock = true;
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

// --- HUD helpers ---

const updateDetectedMarkersHud = (visibleMarkerIds) => {
  if (!detectedMarkersEl) return;
  const detected = [...visibleMarkerIds]
    .map((id) => markerIdToBarcodeValue.get(id) ?? id)
    .sort((a, b) => Number(a) - Number(b));
  detectedMarkersEl.textContent = detected.length
    ? `DETECTED TAGS: ${detected.join(", ")}`
    : "DETECTED TAGS: --";
  detectedMarkersEl.classList.toggle("active", detected.length > 0);
};

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

const setCrosshairScanning = () => {
  if (!crosshair) return;
  crosshair.classList.remove("locked");
  crosshair.classList.add("scanning");
  if (crosshairLabel) crosshairLabel.textContent = "SEARCH";
  if (signalBarInner) signalBarInner.dataset.lock = "0";
};

const setCrosshairLocked = () => {
  if (!crosshair) return;
  crosshair.classList.remove("scanning");
  crosshair.classList.add("locked");
  if (crosshairLabel) crosshairLabel.textContent = "LOCK-ON";
  if (signalBarInner) {
    signalBarInner.dataset.lock = "1";
    signalBarInner.style.width = "100%";
  }
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
    const arjs = scene.getAttribute("arjs");
    const renderer = scene.renderer;
    const el = /** @type {import('aframe').Entity} */ (scene);
    const sysKeys = el.systems && typeof el.systems === "object" ? Object.keys(el.systems) : [];
    debugLog("P1:scene:attribs", {
      arjs,
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
  showToast("Sensors online. Point camera at Barcode ID 5 marker.", 4500);
  await onNudgeOrManualCamera();
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

// --- Multi-marker stabilizer component ---

if (window.AFRAME && !window.AFRAME.components["multi-marker-stabilizer"]) {
  window.AFRAME.registerComponent("multi-marker-stabilizer", {
    schema: {
      lerpFactor: { type: "number", default: stabilizerState.stabilizerLerp },
    },
    init() {
      const THREERef = window.THREE;
      if (!THREERef) return;
      this.THREERef = THREERef;
      this.offsetsComputed = false;
      this.markerConfig = MARKER_LAYOUT.map((spec) => ({
        spec,
        el: document.getElementById(spec.elementId),
        offset: null,
      })).filter((x) => x.el);
      this.avgPos = new THREERef.Vector3();
      this.tmpPos = new THREERef.Vector3();
      this.tmpOffset = new THREERef.Vector3();
      this.chartCenter = new THREERef.Vector3();
      this.avgQuat = new THREERef.Quaternion();
      this.tmpQuat = new THREERef.Quaternion();
      this.hasInitQuat = false;
      this.el.object3D.visible = false;
      this.debugCounter = 0;
    },
    computeOffsets() {
      for (const marker of this.markerConfig) {
        marker.offset = getCornerOffset(this.THREERef, marker.spec.corner);
      }
      this.offsetsComputed = true;
      debugLog("P1:stabilizer:offsets", {
        chartDimensions: { width: 0.6, height: 0.45, markerSize: 0.065 },
        halfSpan: { x: (0.6 - 0.065) / 2, y: (0.45 - 0.065) / 2 },
        offsets: this.markerConfig.map((m) => ({
          corner: m.spec.corner,
          offset: { x: m.offset.x.toFixed(4), y: m.offset.y.toFixed(4), z: m.offset.z.toFixed(4) },
        })),
      });
    },
    tick() {
      if (!this.avgPos) return;
      if (!this.offsetsComputed) this.computeOffsets();

      let count = 0;
      this.avgPos.set(0, 0, 0);
      this.hasInitQuat = false;
      const visibleCorners = [];

      for (const marker of this.markerConfig) {
        const markerObj = marker.el?.object3D;
        if (!markerObj || !markerObj.visible || !marker.offset) continue;

        markerObj.getWorldPosition(this.tmpPos);
        markerObj.getWorldQuaternion(this.tmpQuat);

        this.tmpOffset.copy(marker.offset).multiplyScalar(-1).applyQuaternion(this.tmpQuat);
        this.chartCenter.copy(this.tmpPos).add(this.tmpOffset);
        this.avgPos.add(this.chartCenter);
        visibleCorners.push(marker.spec.corner);

        if (count === 0 && this.debugCounter % 30 === 0) {
          debugLog("P1:stabilizer:marker", {
            corner: marker.spec.corner,
            markerPos: { x: this.tmpPos.x.toFixed(3), y: this.tmpPos.y.toFixed(3), z: this.tmpPos.z.toFixed(3) },
            offset: { x: marker.offset.x.toFixed(3), y: marker.offset.y.toFixed(3), z: marker.offset.z.toFixed(3) },
            negOffset: { x: this.tmpOffset.x.toFixed(3), y: this.tmpOffset.y.toFixed(3), z: this.tmpOffset.z.toFixed(3) },
            chartCenter: { x: this.chartCenter.x.toFixed(3), y: this.chartCenter.y.toFixed(3), z: this.chartCenter.z.toFixed(3) },
          });
        }

        if (!this.hasInitQuat) {
          this.avgQuat.copy(this.tmpQuat);
          this.hasInitQuat = true;
        } else {
          if (this.avgQuat.dot(this.tmpQuat) < 0) {
            this.tmpQuat.set(-this.tmpQuat.x, -this.tmpQuat.y, -this.tmpQuat.z, -this.tmpQuat.w);
          }
          const alpha = 1 / (count + 1);
          this.avgQuat.slerp(this.tmpQuat, alpha);
        }
        count += 1;
      }

      if (count === 0) {
        this.el.object3D.visible = false;
        return;
      }

      this.avgPos.divideScalar(count);
      const contextBias = getContextBiasByVisibleCount(count);
      if (contextBias && (contextBias.x !== 0 || contextBias.y !== 0 || contextBias.z !== 0)) {
        this.tmpOffset.set(contextBias.x, contextBias.y, contextBias.z).applyQuaternion(this.avgQuat);
        this.avgPos.add(this.tmpOffset);
      }

      const lerpFactor = this.data.lerpFactor;
      this.el.object3D.visible = true;

      const posDelta = this.el.object3D.position.distanceTo(this.avgPos);
      const rotDeltaDeg = (this.el.object3D.quaternion.angleTo(this.avgQuat) * 180) / Math.PI;

      if (posDelta < stabilizerState.positionDeadband && rotDeltaDeg < stabilizerState.rotationDeadbandDeg) {
        this.debugCounter++;
        return;
      }

      this.el.object3D.position.lerp(this.avgPos, lerpFactor);
      this.el.object3D.quaternion.slerp(this.avgQuat, lerpFactor);

      this.debugCounter++;
      if (this.debugCounter % 60 === 0) {
        debugLog("P1:stabilizer:tick", {
          count,
          corners: visibleCorners,
          avgPos: { x: this.avgPos.x.toFixed(3), y: this.avgPos.y.toFixed(3), z: this.avgPos.z.toFixed(3) },
          elPos: {
            x: this.el.object3D.position.x.toFixed(3),
            y: this.el.object3D.position.y.toFixed(3),
            z: this.el.object3D.position.z.toFixed(3),
          },
        });
      }
    },
  });
}

// --- Stabilizer update ---

const applyStabilizerLerpToRoot = () => {
  if (!stableModelRootEl) return;
  stableModelRootEl.setAttribute("multi-marker-stabilizer", `lerpFactor: ${stabilizerState.stabilizerLerp.toFixed(2)}`);
};

// --- Run ---

logBootEnvironment();

for (const spec of MARKER_LAYOUT) {
  const marker = document.getElementById(spec.elementId);
  if (!marker) {
    debugLog("P1:marker:config:missing", spec);
    continue;
  }
  const configuredValue = String(marker.getAttribute("value") ?? "");
  if (configuredValue !== spec.barcodeValue) {
    debugLog("P1:marker:config:mismatch", {
      elementId: spec.elementId,
      expectedValue: spec.barcodeValue,
      actualValue: configuredValue,
      expectedFile: spec.markerFile,
    });
  }
}

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
  arScene.addEventListener("loaded", () => {
    debugLog("P1:scene:loaded", { id: arScene.id });
    logSceneIntrospection(arScene);
    logCanvasOnce(/** @type {import('aframe').Scene} */ (arScene));
    // Single reparent attempt (MutationObserver handles the rest)
    reparentArjsVideoIntoViewport();
  });
  arScene.addEventListener("renderstart", () => {
    debugLog("P1:scene:renderstart");
  });
} else {
  debugLog("P1:scene:missing", "No #ar-scene");
}

// Marker events
if (markerEls.length) {
  const visibleMarkerIds = new Set();
  updateDetectedMarkersHud(visibleMarkerIds);

  markerEls.forEach((marker) => {
    marker.addEventListener("markerFound", () => {
      visibleMarkerIds.add(marker.id);
      updateDetectedMarkersHud(visibleMarkerIds);
      debugLog("P1:marker:found", {
        markerId: marker.id,
        visibleMarkers: visibleMarkerIds.size,
        timeMs: Math.round(performance.now() - BOOT_T0),
        model: layersModelEl ? "layers_of_the_sun" : solarModelEl ? "solar-dummy" : "none",
      });
      setCrosshairLocked();
      showToast("STABLE LINK // SOLAR TELEMETRY LOCKED", 2000);
      if (firstMarkerLock) {
        firstMarkerLock = false;
        runHeaderGlitch();
      }
      tryInitialModelFit();
    });

    marker.addEventListener("markerLost", () => {
      visibleMarkerIds.delete(marker.id);
      updateDetectedMarkersHud(visibleMarkerIds);
      debugLog("P1:marker:lost", { markerId: marker.id, visibleMarkers: visibleMarkerIds.size });
      if (visibleMarkerIds.size === 0) {
        setCrosshairScanning();
        showToast("SIGNAL LOST // RESCANNING TARGET", 2000);
      }
    });
  });
}

// Model loaded event
if (layersModelEl) {
  layersModelEl.addEventListener("model-loaded", onModelLoaded);
}

// Late fit fallback
setTimeout(tryInitialModelFit, 1500);

// Initialize sliders with callbacks
initSliderBindings({
  onStabilizerChange: applyStabilizerLerpToRoot,
  onModelTransformChange: scheduleModelTransform,
});
syncSlidersFromState();
applyStabilizerLerpToRoot();

// UI event handlers
if (splashStart) {
  splashStart.addEventListener("click", () => void onStartMission());
}

if (refreshCamerasBtn) {
  refreshCamerasBtn.addEventListener("click", async () => {
    const v = findArVideo();
    const id = /** @type {MediaStream|null} */ (v?.srcObject)?.getVideoTracks?.()[0]?.getSettings?.().deviceId ?? "";
    await populateCameraSelect(id);
    logVideoList("after-refresh");
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

debugLog("P1:boot:app-js:end", { ms: Math.round(performance.now() - BOOT_T0) });
