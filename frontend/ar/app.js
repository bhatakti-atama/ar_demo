/**
 * Phase 1 (plan.md): A-Frame + AR.js (CDN) + secure context + maximum structured logging.
 * @file app.js
 */

const BOOT_T0 = performance.now();
const LOG_NS = "phase1";
const MAX_DEBUG_LOG_LINES = 220;

const STORAGE_DEVICE_KEY = "ar-charts-preferred-camera-device-id";
const PERMISSIONS_QUERY_TIMEOUT_MS = 2000;

const MARKER_LAYOUT = [
  {
    corner: "top-left",
    elementId: "marker-tl",
    barcodeValue: "1",
    markerFile: "barcode-3x3-id1-top-left.png",
  },
  {
    corner: "top-right",
    elementId: "marker-tr",
    barcodeValue: "6",
    markerFile: "barcode-3x3-id6-top-right.png",
  },
  {
    corner: "bottom-left",
    elementId: "marker-bl",
    barcodeValue: "12",
    markerFile: "barcode-3x3-id12-bottom-left.png",
  },
  {
    corner: "bottom-right",
    elementId: "marker-br",
    barcodeValue: "18",
    markerFile: "barcode-3x3-id18-bottom-right.png",
  },
];
const markerEls = MARKER_LAYOUT.map((x) => document.getElementById(x.elementId)).filter(Boolean);
const markerEl = markerEls[0] ?? null;
const solarModelEl = document.getElementById("solar-dummy-model");
const layersModelEl = document.getElementById("layers_of_the_sun_model");
const settingsDrawer = document.getElementById("settings-drawer");
const settingsGear = document.getElementById("settings-gear");
const drawerClose = document.getElementById("drawer-close");
const refreshCamerasBtn = document.getElementById("refresh-cameras");
const zoomSlider = document.getElementById("zoom-slider");
const zoomNote = document.getElementById("zoom-note");
const focusNote = document.getElementById("focus-note");
const stableModelRootEl = document.getElementById("stable-model-root");
const stabilizerLerpSlider = document.getElementById("stabilizer-lerp-slider");
const positionDeadbandSlider = document.getElementById("position-deadband-slider");
const rotationDeadbandSlider = document.getElementById("rotation-deadband-slider");
const biasOneXSlider = document.getElementById("bias-one-x-slider");
const biasOneYSlider = document.getElementById("bias-one-y-slider");
const biasOneZSlider = document.getElementById("bias-one-z-slider");
const biasTwoXSlider = document.getElementById("bias-two-x-slider");
const biasTwoYSlider = document.getElementById("bias-two-y-slider");
const biasTwoZSlider = document.getElementById("bias-two-z-slider");
const biasThreeXSlider = document.getElementById("bias-three-x-slider");
const biasThreeYSlider = document.getElementById("bias-three-y-slider");
const biasThreeZSlider = document.getElementById("bias-three-z-slider");
const sizeSlider = document.getElementById("size-slider");
const offsetXSlider = document.getElementById("offset-x-slider");
const offsetYSlider = document.getElementById("offset-y-slider");
const offsetZSlider = document.getElementById("offset-z-slider");
const pitchSlider = document.getElementById("pitch-slider");
const yawSlider = document.getElementById("yaw-slider");
const rollSlider = document.getElementById("roll-slider");
const sizeValue = document.getElementById("size-value");
const stabilizerLerpValue = document.getElementById("stabilizer-lerp-value");
const positionDeadbandValue = document.getElementById("position-deadband-value");
const rotationDeadbandValue = document.getElementById("rotation-deadband-value");
const biasOneXValue = document.getElementById("bias-one-x-value");
const biasOneYValue = document.getElementById("bias-one-y-value");
const biasOneZValue = document.getElementById("bias-one-z-value");
const biasTwoXValue = document.getElementById("bias-two-x-value");
const biasTwoYValue = document.getElementById("bias-two-y-value");
const biasTwoZValue = document.getElementById("bias-two-z-value");
const biasThreeXValue = document.getElementById("bias-three-x-value");
const biasThreeYValue = document.getElementById("bias-three-y-value");
const biasThreeZValue = document.getElementById("bias-three-z-value");
const offsetXValue = document.getElementById("offset-x-value");
const offsetYValue = document.getElementById("offset-y-value");
const offsetZValue = document.getElementById("offset-z-value");
const pitchValue = document.getElementById("pitch-value");
const yawValue = document.getElementById("yaw-value");
const rollValue = document.getElementById("roll-value");
const cameraSelect = document.getElementById("camera-select");
const splashScreen = document.getElementById("splash-screen");
const splashStart = document.getElementById("splash-start");
const crosshair = document.getElementById("crosshair");
const crosshairLabel = document.getElementById("crosshair-label");
const hudHeader = document.getElementById("hud-header");
const signalBarInner = document.getElementById("signal-bar-inner");
const arViewport = document.getElementById("ar-viewport");
const arScene = document.getElementById("ar-scene");

let firstMarkerLock = true;
let signalJitterId = 0;
let toastHideTimer = 0;
let layersModelFitDone = false;
let modelBaseMaxDim = 0;
let modelTransformRafId = 0;
let modelScaleRefreshPending = false;
let STABILIZER_LERP_FACTOR = 0.18;
let POSITION_DEADBAND = 0.002;
let ROTATION_DEADBAND_DEG = 0.8;
const IS_MOBILE_DEVICE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const MODEL_POSITION_RELATIVE_TO_TAG = { x: -1.35, y: -1.65, z: 2.3 };
const MODEL_ROTATION = { pitch: -78, yaw: 0, roll: 3 };
let MODEL_SIZE_RELATIVE_TO_TAG = 3;
const MODEL_DEVICE_CALIBRATION = IS_MOBILE_DEVICE
  ? { size: 1.25, pitch: -41, yaw: 2, roll: 2 }
  : { size: 1.0, pitch: 0, yaw: 0, roll: 0 };
const MULTI_MARKER_HALF_SPAN = 0.7;
const CORNER_CENTER_TUNE = {
  "top-left": { x: 0, y: 0, z: 0 },
  "top-right": { x: 0, y: 0, z: 0 },
  "bottom-left": { x: 0, y: 0, z: 0 },
  "bottom-right": { x: 0, y: 0, z: 0 },
};
const VISIBILITY_CONTEXT_BIAS = {
  one: { x: 0, y: 0, z: 0 },
  two: { x: 0, y: 0, z: 0 },
  three: { x: 0, y: 0, z: 0 },
  four: { x: 0, y: 0, z: 0 },
};

const getMarkerSizeUnits = () =>
  Number(markerEl?.getAttribute("size")) > 0 ? Number(markerEl?.getAttribute("size")) : 1.0;

const getCornerTune = (corner) => {
  if (corner === "top-left") {
    return CORNER_CENTER_TUNE["top-left"];
  }
  if (corner === "top-right") {
    return CORNER_CENTER_TUNE["top-right"];
  }
  if (corner === "bottom-left") {
    return CORNER_CENTER_TUNE["bottom-left"];
  }
  return CORNER_CENTER_TUNE["bottom-right"];
};

const getContextBiasByVisibleCount = (count) => {
  if (count >= 4) {
    return VISIBILITY_CONTEXT_BIAS.four;
  }
  if (count === 3) {
    return VISIBILITY_CONTEXT_BIAS.three;
  }
  if (count === 2) {
    return VISIBILITY_CONTEXT_BIAS.two;
  }
  return VISIBILITY_CONTEXT_BIAS.one;
};

const getCornerOffset = (THREERef, corner, halfSpan) => {
  let base = new THREERef.Vector3(halfSpan, -halfSpan, 0);
  if (corner === "top-left") {
    base = new THREERef.Vector3(-halfSpan, halfSpan, 0);
  } else if (corner === "top-right") {
    base = new THREERef.Vector3(halfSpan, halfSpan, 0);
  } else if (corner === "bottom-left") {
    base = new THREERef.Vector3(-halfSpan, -halfSpan, 0);
  }
  const tune = getCornerTune(corner);
  return base.add(new THREERef.Vector3(tune.x, tune.y, tune.z));
};

/** @type {string[]} */
const logBuffer = [];

// --- core logging: panel + console (verbose) ---

const debugLog = (tag, ...parts) => {
  const row = { tag, tMs: Math.round(performance.now() - BOOT_T0) };
  const fmt = (p) => {
    if (p === undefined) {
      return "";
    }
    if (typeof p === "object" && p !== null) {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    }
    return String(p);
  };
  const time = new Date().toISOString().slice(11, 23);
  const textParts = [tag, ...parts].map(fmt).filter(Boolean);
  const line = [time, LOG_NS, ...textParts].join(" | ");
  const stack =
    textParts.length > 0
      ? `${line} | ${row.tMs}ms from boot`
      : `${line} | ${row.tMs}ms`;
  logBuffer.push(stack);
  if (logBuffer.length > MAX_DEBUG_LOG_LINES * 2) {
    logBuffer.splice(0, logBuffer.length - MAX_DEBUG_LOG_LINES);
  }
  console.log(`[${LOG_NS}]`, tag, ...parts, { msFromBoot: row.tMs });
  const el = document.getElementById("app-debug-log");
  if (el) {
    el.textContent = logBuffer.slice(-MAX_DEBUG_LOG_LINES).join("\n");
  }
};

const showToast = (message, durationMs = 3200) => {
  const el = document.getElementById("hud-toast");
  if (!el) {
    return;
  }
  el.textContent = message;
  el.removeAttribute("hidden");
  el.classList.add("hud-toast--show");
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }
  toastHideTimer = window.setTimeout(() => {
    el.classList.remove("hud-toast--show");
    el.setAttribute("hidden", "true");
  }, durationMs);
};

const setCrosshairScanning = () => {
  if (!crosshair) {
    return;
  }
  crosshair.classList.remove("locked");
  crosshair.classList.add("scanning");
  if (crosshairLabel) {
    crosshairLabel.textContent = "SEARCH";
  }
  if (signalBarInner) {
    signalBarInner.dataset.lock = "0";
  }
};

const setCrosshairLocked = () => {
  if (!crosshair) {
    return;
  }
  crosshair.classList.remove("scanning");
  crosshair.classList.add("locked");
  if (crosshairLabel) {
    crosshairLabel.textContent = "LOCK-ON";
  }
  if (signalBarInner) {
    signalBarInner.dataset.lock = "1";
    signalBarInner.style.width = "100%";
  }
};

const startSignalJitter = () => {
  if (signalJitterId || !signalBarInner) {
    return;
  }
  signalJitterId = window.setInterval(() => {
    if (signalBarInner.dataset.lock === "1") {
      return;
    }
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
  if (!hudHeader) {
    return;
  }
  hudHeader.classList.add("glitch-active");
  setTimeout(() => {
    hudHeader.classList.remove("glitch-active");
  }, 220);
};

const dismissSplash = () => {
  if (!splashScreen) {
    return;
  }
  splashScreen.classList.add("splash--dismissed");
  splashScreen.setAttribute("aria-hidden", "true");
  debugLog("P1:hud:splash", "dismissed");
};

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

const safeJson = (o) => {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch {
    return String(o);
  }
};

const normalizeChartData = (rows) => {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row) => ({
      label: String(row.label ?? "unknown"),
      value: Number(row.value ?? 0),
    }))
    .filter((row) => Number.isFinite(row.value));
};

const loadChartDataStub = async () => {
  try {
    const chartDataUrl = new URL("../data/chartData.json", window.location.href).toString();
    const res = await fetch(chartDataUrl, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    const rows = normalizeChartData(json);
    const maxValue = rows.reduce((max, row) => Math.max(max, row.value), 0);
    const previewScale = rows[0] && maxValue > 0 ? 0.18 + (rows[0].value / maxValue) * 0.2 : 0.24;
    debugLog("P2:data:chart:stub", {
      rows: rows.length,
      first: rows[0] ?? null,
      previewScale: Number(previewScale.toFixed(3)),
      mode: "stub-only",
    });
  } catch (e) {
    debugLog("P2:data:chart:stub:error", e instanceof Error ? e.message : String(e));
  }
};

// --- 1) Boot & environment (secure context) ---

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
    deviceMemory: /** @type {Navigator & { deviceMemory?: number }} */ (nav)
      .deviceMemory,
  });
  debugLog("P1:env:media", {
    hasMediaDevices: Boolean(nav.mediaDevices),
    hasGetUserMedia: Boolean(nav.mediaDevices?.getUserMedia),
  });
  try {
    const c = "connection" in nav ? /** @type {Navigator & { connection?: { effectiveType: string, downlink: number } }} */ (nav).connection : null;
    if (c) {
      debugLog("P1:env:network", { effectiveType: c.effectiveType, downlink: c.downlink });
    }
  } catch (e) {
    debugLog("P1:env:network", { err: e instanceof Error ? e.message : e });
  }
  if (window.visualViewport) {
    const vv = window.visualViewport;
    debugLog("P1:env:visualViewport:initial", {
      width: vv.width,
      height: vv.height,
      offsetTop: vv.offsetTop,
      scale: vv.scale,
    });
  }
  if ("memory" in performance) {
    const m = /** @type {Performance & { memory?: { usedJSHeapSize: number, totalJSHeapSize: number, jsHeapSizeLimit: number } }} */ (performance).memory;
    if (m) {
      debugLog("P1:env:heap", {
        usedJSHeapSize: m.usedJSHeapSize,
        totalJSHeapSize: m.totalJSHeapSize,
        jsHeapSizeLimit: m.jsHeapSizeLimit,
      });
    }
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

// --- 2) A-Frame / THREE (after sync CDN scripts) ---

const logAframeAndThree = () => {
  const AF = window.AFRAME;
  const TH = typeof window.THREE !== "undefined" ? window.THREE : null;
  debugLog("P1:lib:globals", {
    hasAFRAME: Boolean(AF),
    hasTHREE: Boolean(TH),
  });
  if (AF) {
    debugLog("P1:lib:aframe", {
      version: AF.version,
      keyNames: Object.keys(AF).length,
    });
  } else {
    debugLog("P1:lib:aframe:MISSING", "AFRAME not on window; CDN may have failed to load (check 404s).");
  }
  if (TH && "REVISION" in TH) {
    debugLog("P1:lib:three", { revision: /** @type {typeof import('three') & { REVISION: string }} */ (TH).REVISION });
  }
};

// --- 3) Scene introspection + AR.js hooks ---

const logSceneIntrospection = (scene) => {
  if (!scene) {
    return;
  }
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
  if (!scene?.renderer?.domElement) {
    return;
  }
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
  requestAnimationFrame(() => {
    log();
  });
  setTimeout(log, 500);
  setTimeout(log, 2000);
};

// --- 4) Video discovery & stream logging ---

const describeVideo = (v, i) => ({
  i,
  id: v.id,
  className: v.className,
  readyState: v.readyState,
  videoWidth: v.videoWidth,
  videoHeight: v.videoHeight,
  paused: v.paused,
  muted: v.muted,
  hasSrcObject: Boolean(v.srcObject),
  parent: v.parentElement?.tagName,
});

const logVideoList = (reason) => {
  const vids = [...document.querySelectorAll("video")];
  debugLog("P1:video:list", reason, { count: vids.length, detail: vids.map(describeVideo) });
  if (vids.length) {
    console.table(vids.map((v, i) => describeVideo(v, i)));
  }
};

const findArVideo = () => {
  return (
    (arViewport && arViewport.querySelector("video")) ||
    (arScene && arScene.querySelector("video")) ||
    [...document.querySelectorAll("video")].find((v) => v.srcObject) ||
    document.querySelector("video")
  );
};

const ensureFallbackVideo = () => {
  let v = findArVideo();
  if (v) {
    return v;
  }
  if (!arViewport) {
    return null;
  }
  v = document.createElement("video");
  v.id = "manual-fallback-preview";
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.muted = true;
  v.setAttribute("aria-label", "Manual camera preview");
  arViewport.appendChild(v);
  debugLog("P1:video:created-fallback", { id: v.id });
  return v;
};

const bindVideoPipelineLoggers = (video) => {
  if (!video || video.dataset.p1Bound === "1") {
    return;
  }
  video.dataset.p1Bound = "1";
  const tag = (ev) => {
    const track = video.srcObject?.getVideoTracks?.()[0];
    debugLog("P1:video:event", ev, {
      readyState: video.readyState,
      videoW: video.videoWidth,
      videoH: video.videoHeight,
      trackState: track?.readyState,
      trackLabel: track?.label,
    });
  };
  [
    "loadstart",
    "loadeddata",
    "loadedmetadata",
    "canplay",
    "canplaythrough",
    "playing",
    "pause",
    "stalled",
    "waiting",
    "suspend",
    "error",
  ].forEach((ev) => {
    video.addEventListener(ev, () => tag(ev));
  });
  video.addEventListener("error", () => {
    const err = video.error;
    debugLog("P1:video:error:detail", err ? { code: err.code, message: err.message } : "none");
  });
};

const logTrackDetail = (track) => {
  if (!track) {
    return;
  }
  const capabilities = (() => {
    try {
      return track.getCapabilities?.() ?? null;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  })();
  const settings = (() => {
    try {
      return track.getSettings?.() ?? null;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  })();
  debugLog("P1:track:detail", {
    id: track.id,
    kind: track.kind,
    label: track.label,
    readyState: track.readyState,
    settings,
    capabilities,
  });
};

// --- 5) DOM mutation (AR.js injects &lt;video&gt;) ---

/**
 * AR.js appends the camera &lt;video&gt; to `document.body`. A full-screen
 * `#ar-viewport` with an opaque `background: #000` then sits on top: transparent
 * WebGL pixels composite against that black, not the live video. Moving the
 * video inside `#ar-viewport` (below the canvas) and keeping the wrapper
 * `background: transparent` fixes the black feed (see `style.css`).
 * @returns {boolean}
 */
const reparentArjsVideoIntoViewport = () => {
  const vp = arViewport;
  const v = document.getElementById("arjs-video") || document.querySelector("body > video");
  if (!vp || !v) {
    return false;
  }
  if (v.parentElement === vp) {
    return false;
  }
  const from = v.parentElement?.nodeName ?? "";
  const first = vp.firstChild;
  vp.insertBefore(v, first);
  void v.play().catch(() => {});
  debugLog("P1:fix:reparent-ar-video", {
    from,
    to: "ar-viewport (first child, under a-scene)",
    id: v.id,
  });
  return true;
};

const watchVideoElements = () => {
  const onVideos = (videos) => {
    for (const v of /** @type {HTMLVideoElement[]} */ (videos)) {
      bindVideoPipelineLoggers(v);
    }
    if (videos.length) {
      reparentArjsVideoIntoViewport();
    }
  };

  const obs = new MutationObserver((records) => {
    const added = records.flatMap((r) => [...r.addedNodes]);
    const videos = added.filter((n) => n.nodeName === "VIDEO");
    if (videos.length) {
      debugLog("P1:dom:mutation", "video nodes added", {
        count: videos.length,
        detail: /** @type {HTMLVideoElement[]} */ (videos).map((v) => describeVideo(v, 0)),
      });
    }
    onVideos(/** @type {HTMLVideoElement[]} */ (videos));
  });
  obs.observe(document.body, { childList: true, subtree: true });
  debugLog("P1:dom:observer", "MutationObserver on body for <video> injection");
  return obs;
};

// --- 6) Permission / gUM (manual path + nudge) ---

/**
 * @param {unknown} e
 * @returns {string}
 */
const formatGetUserMediaError = (e) => {
  if (e && typeof e === "object" && "name" in e) {
    const name = /** @type {{ name: string }} */ (e).name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Not allowed: fix site camera permission, reload, try again.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No camera found.";
    }
    if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") {
      return "Camera busy or not readable.";
    }
  }
  return e instanceof Error ? e.message : String(e);
};

const isSecureCameraContext = () => {
  if (window.isSecureContext) {
    return true;
  }
  const { hostname, protocol } = window.location;
  if (protocol === "file:") {
    return false;
  }
  return (
    protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")
  );
};

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms, label) => {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} (${ms}ms timeout)`));
    }, ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
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

// --- 7) Camera device UI (zoom / switch) — reuses same pipeline as camera-only page ---

/** @type {((this: HTMLInputElement) => void) | null} */
let zoomInputHandler = null;

const detachZoomHandler = () => {
  if (zoomSlider && zoomInputHandler) {
    zoomSlider.removeEventListener("input", zoomInputHandler);
  }
  zoomInputHandler = null;
};

const getTrackCapabilities = (track) => {
  if (!track || typeof track.getCapabilities !== "function") {
    return null;
  }
  return track.getCapabilities();
};

const setFocusUiState = (enabled, message) => {
  if (focusNote) {
    focusNote.textContent = message;
  }
};

const getPreferredFocusMode = (capabilities) => {
  const focusModes = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];
  if (focusModes.includes("single-shot")) {
    return "single-shot";
  }
  if (focusModes.includes("continuous")) {
    return "continuous";
  }
  if (focusModes.includes("auto")) {
    return "auto";
  }
  return "";
};

const applyFocusMode = async (track, mode) => {
  if (!track || !mode) {
    return false;
  }
  try {
    await track.applyConstraints({ advanced: [{ focusMode: mode }] });
    debugLog("P1:cam:focus:apply:ok", { mode });
    return true;
  } catch (e) {
    debugLog("P1:cam:focus:apply:fail", {
      mode,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
};

const setupFocusForTrack = async (track) => {
  if (!focusNote) {
    return;
  }
  const capabilities = getTrackCapabilities(track);
  const focusModes = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];
  debugLog("P1:cam:focus:capabilities", safeJson({ focusModes }) ?? {});

  if (focusModes.length === 0) {
    setFocusUiState(false, "Focus: not supported on this camera/browser.");
    return;
  }

  const preferredMode = getPreferredFocusMode(capabilities);
  if (preferredMode) {
    await applyFocusMode(track, preferredMode);
  }
  setFocusUiState(true, `Focus ready (${focusModes.join(", ")}).`);
};

const setupZoomForTrack = (track) => {
  detachZoomHandler();
  if (!zoomSlider || !zoomNote) {
    return;
  }
  const capabilities = getTrackCapabilities(track);
  debugLog("P1:cam:zoom:capabilities", safeJson(capabilities) ?? {});

  if (!capabilities?.zoom) {
    zoomNote.textContent = "Zoom: not available (e.g. iOS Safari).";
    zoomSlider.disabled = true;
    zoomSlider.min = "1";
    zoomSlider.max = "1";
    zoomSlider.step = "0.1";
    zoomSlider.value = "1";
    return;
  }

  const min = capabilities.zoom.min ?? 1;
  const max = capabilities.zoom.max ?? 1;
  const step = capabilities.zoom.step ?? 0.1;
  zoomSlider.min = String(min);
  zoomSlider.max = String(max);
  zoomSlider.step = String(step);
  zoomSlider.value = String(min);
  zoomSlider.disabled = false;

  const applyZoom = async (value) => {
    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] });
      zoomNote.textContent = `Zoom: ${Number(value).toFixed(1)}x`;
    } catch (e) {
      debugLog("P1:cam:zoom:apply:error", e instanceof Error ? e.message : e);
      zoomNote.textContent = "Zoom applyConstraints failed.";
    }
  };
  zoomInputHandler = () => {
    const value = Number(zoomSlider.value);
    void applyZoom(value);
  };
  zoomSlider.addEventListener("input", zoomInputHandler);
  zoomNote.textContent = "Zoom (when supported on this device).";
};

const getVideoInputs = () =>
  navigator.mediaDevices
    .enumerateDevices()
    .then((d) => d.filter((x) => x.kind === "videoinput"));

const populateCameraSelect = async (currentDeviceId) => {
  if (!cameraSelect || !navigator.mediaDevices?.enumerateDevices) {
    return;
  }
  const videoInputs = await getVideoInputs();
  debugLog("P1:cam:enumerate", {
    n: videoInputs.length,
    hasLabels: videoInputs.filter((d) => d.label).length,
  });
  cameraSelect.innerHTML = "";
  for (const device of videoInputs) {
    if (!device.deviceId) {
      continue;
    }
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label?.trim() || `id ${String(device.deviceId).slice(0, 6)}…`;
    if (device.deviceId === currentDeviceId) {
      option.selected = true;
    }
    cameraSelect.appendChild(option);
  }
  if (cameraSelect.options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No IDs yet — START SCAN, then refresh";
    cameraSelect.appendChild(option);
    cameraSelect.disabled = true;
    return;
  }
  cameraSelect.disabled = false;
};

const buildPreferredVideoConstraints = (baseVideo = {}) => {
  return {
    ...baseVideo,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 60 },
    // These are best-effort hints and can be ignored by browsers.
    focusMode: "continuous",
    exposureMode: "continuous",
  };
};

const requestStreamForDevice = async (deviceId) => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: buildPreferredVideoConstraints({ deviceId: { exact: deviceId } }),
    });
  } catch (e1) {
    debugLog("P1:cam:getUserMedia:device:exact:fail", e1 instanceof Error ? e1.name : String(e1));
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: buildPreferredVideoConstraints({ deviceId: { ideal: deviceId } }),
      });
    } catch (e2) {
      debugLog("P1:cam:getUserMedia:device:ideal:fail", e2 instanceof Error ? e2.name : String(e2));
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { ideal: deviceId } },
      });
    }
  }
};

const requestCameraStream = async () => {
  debugLog("P1:cam:getUserMedia:try", {
    idealFacing: "environment",
    idealWidth: 1920,
    idealHeight: 1080,
    idealFps: 30,
  });
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: buildPreferredVideoConstraints({ facingMode: { ideal: "environment" } }),
    });
  } catch (e) {
    debugLog("P1:cam:getUserMedia:fallback:base", e instanceof Error ? e.name : String(e));
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
    } catch (eBase) {
      debugLog("P1:cam:getUserMedia:fallback:facing-only", eBase instanceof Error ? eBase.name : String(eBase));
    }
    if (
      e &&
      typeof e === "object" &&
      "name" in e &&
      (/** @type {DOMException} */ (e).name === "NotAllowedError" ||
        /** @type {DOMException} */ (e).name === "SecurityError" ||
        /** @type {DOMException} */ (e).name === "NotReadableError")
    ) {
      throw e;
    }
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
};

const applyStreamToTargetVideo = async (stream) => {
  const video = ensureFallbackVideo();
  if (!video) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("No video target element.");
  }
  const prev = video.srcObject;
  prev?.getTracks?.().forEach((t) => t.stop());
  const track = stream.getVideoTracks()[0];
  logTrackDetail(track);
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.srcObject = stream;
  await video.play().catch((err) => {
    debugLog("P1:cam:play:rejected", err instanceof Error ? err.message : err);
  });
  if (track) {
    const settings = track.getSettings?.() ?? {};
    await populateCameraSelect(settings.deviceId ?? "");
    setupZoomForTrack(track);
    await setupFocusForTrack(track);
  }
  showToast("Manual stream attached to preview (check drawer if AR conflicts).", 4000);
  debugLog("P1:cam:applyStream:done", { toId: video.id });
};

// --- 8) Orchestration: scene, marker, nudge button ---

const syncSettingsDrawer = (open) => {
  if (!settingsDrawer || !settingsGear) {
    return;
  }
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
  drawerClose.addEventListener("click", () => {
    syncSettingsDrawer(false);
  });
}

const nudgeAllVideos = () => {
  const vids = [...document.querySelectorAll("video")];
  debugLog("P1:cam:nudge:count", { videos: vids.length });
  for (const v of vids) {
    v.muted = true;
    void v.play().then(() => {
      debugLog("P1:cam:nudge:play:ok", { id: v.id, paused: v.paused });
    }).catch((e) => {
      debugLog("P1:cam:nudge:play:fail", { id: v.id, err: e instanceof Error ? e.message : e });
    });
  }
};

const onNudgeOrManualCamera = async () => {
  nudgeAllVideos();
  logVideoList("post-nudge");
  let v = findArVideo();
  let track = v?.srcObject?.getVideoTracks?.()[0];
  if (track) {
    logTrackDetail(track);
    await populateCameraSelect(track.getSettings?.().deviceId ?? "");
    setupZoomForTrack(track);
    await setupFocusForTrack(track);
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
    await applyStreamToTargetVideo(stream);
  } catch (e) {
    const msg = formatGetUserMediaError(e);
    debugLog("P1:cam:manual-gum:fail", e instanceof Error ? e.name : e, msg);
    if (zoomNote) {
      zoomNote.textContent = msg;
    }
    showToast(msg, 5000);
  }
};

// --- 9) Global error hooks ---

const reportBootError = () => {
  window.addEventListener("error", (event) => {
    debugLog("P1:window:error", {
      message: event.message,
      file: event.filename,
      line: event.lineno,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    debugLog("P1:window:unhandledrejection", {
      reason:
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason),
    });
  });
};

// --- 10) Lifecycle: visibility, resize, page ---

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
      if (!v) {
        return;
      }
      debugLog("P1:life:visualViewport:resize", {
        w: v.width,
        h: v.height,
        scale: v.scale,
      });
    });
  }
  window.addEventListener("orientationchange", () => {
    debugLog("P1:life:orientation", { angle: window.screen?.orientation?.angle });
  });
};

// --- 11) Run ---

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
  isMobile: IS_MOBILE_DEVICE,
  calibration: MODEL_DEVICE_CALIBRATION,
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

if (arScene) {
  arScene.addEventListener("loaded", () => {
    debugLog("P1:scene:loaded", { id: arScene.id });
    logSceneIntrospection(arScene);
    logCanvasOnce(/** @type {import('aframe').Scene} */ (arScene));
    reparentArjsVideoIntoViewport();
    requestAnimationFrame(() => {
      reparentArjsVideoIntoViewport();
    });
    setTimeout(() => {
      if (reparentArjsVideoIntoViewport()) {
        debugLog("P1:fix:reparent:delayed-ok");
      }
    }, 100);
  });
  arScene.addEventListener("renderstart", () => {
    debugLog("P1:scene:renderstart");
  });
} else {
  debugLog("P1:scene:missing", "No #ar-scene");
}

if (window.AFRAME && !window.AFRAME.components["multi-marker-stabilizer"]) {
  window.AFRAME.registerComponent("multi-marker-stabilizer", {
    schema: {
      lerpFactor: { type: "number", default: STABILIZER_LERP_FACTOR },
    },
    init() {
      const THREERef = window.THREE;
      if (!THREERef) {
        return;
      }
      this.THREERef = THREERef;
      const h = MULTI_MARKER_HALF_SPAN;
      this.markerConfig = MARKER_LAYOUT.map((spec) => ({
        spec,
        el: document.getElementById(spec.elementId),
        offset: getCornerOffset(THREERef, spec.corner, h),
      })).filter((x) => x.el);
      this.avgPos = new THREERef.Vector3();
      this.tmpPos = new THREERef.Vector3();
      this.tmpOffset = new THREERef.Vector3();
      this.avgQuat = new THREERef.Quaternion();
      this.tmpQuat = new THREERef.Quaternion();
      this.hasInitQuat = false;
      this.el.object3D.visible = false;
    },
    tick() {
      if (!this.avgPos) {
        return;
      }
      let count = 0;
      this.avgPos.set(0, 0, 0);
      this.hasInitQuat = false;

      for (const marker of this.markerConfig) {
        const markerObj = marker.el?.object3D;
        if (!markerObj || !markerObj.visible) {
          continue;
        }
        markerObj.getWorldPosition(this.tmpPos);
        markerObj.getWorldQuaternion(this.tmpQuat);

        this.tmpOffset.copy(marker.offset).multiplyScalar(-1).applyQuaternion(this.tmpQuat);
        this.avgPos.add(this.tmpPos.add(this.tmpOffset));

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
      if (contextBias) {
        this.tmpOffset
          .set(contextBias.x, contextBias.y, contextBias.z)
          .applyQuaternion(this.avgQuat);
        this.avgPos.add(this.tmpOffset);
      }
      const lerpFactor = this.data.lerpFactor;
      this.el.object3D.visible = true;
      const posDelta = this.el.object3D.position.distanceTo(this.avgPos);
      const rotDeltaDeg = (this.el.object3D.quaternion.angleTo(this.avgQuat) * 180) / Math.PI;
      if (posDelta < POSITION_DEADBAND && rotDeltaDeg < ROTATION_DEADBAND_DEG) {
        return;
      }
      this.el.object3D.position.lerp(this.avgPos, lerpFactor);
      this.el.object3D.quaternion.slerp(this.avgQuat, lerpFactor);
    },
  });
}

if (markerEls.length) {
  const visibleMarkerIds = new Set();
  markerEls.forEach((marker) => {
    marker.addEventListener("markerFound", () => {
      visibleMarkerIds.add(marker.id);
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
      tryFitLayersModelToMarker();
    });
    marker.addEventListener("markerLost", () => {
      visibleMarkerIds.delete(marker.id);
      debugLog("P1:marker:lost", { markerId: marker.id, visibleMarkers: visibleMarkerIds.size });
      if (visibleMarkerIds.size === 0) {
        setCrosshairScanning();
        showToast("SIGNAL LOST // RESCANNING TARGET", 2000);
      }
    });
  });
}

const fitLayersModelToMarker = () => {
  if (!layersModelEl) {
    return false;
  }
  const THREERef = window.THREE;
  if (!THREERef || !THREERef.Box3 || !layersModelEl.object3D) {
    return false;
  }

  if (!modelBaseMaxDim) {
    const mesh = layersModelEl.getObject3D("mesh") || layersModelEl.object3D;
    const worldBox = new THREERef.Box3().setFromObject(mesh);
    const worldSize = worldBox.getSize(new THREERef.Vector3());
    const worldMaxDim = Math.max(worldSize.x, worldSize.y, worldSize.z);
    const currentScale = Number(layersModelEl.object3D.scale?.x) || 1;
    modelBaseMaxDim = worldMaxDim / currentScale;
  }
  if (!modelBaseMaxDim || !Number.isFinite(modelBaseMaxDim) || modelBaseMaxDim <= 0) {
    return false;
  }

  const markerSize = getMarkerSizeUnits();
  const target = markerSize * MODEL_SIZE_RELATIVE_TO_TAG * MODEL_DEVICE_CALIBRATION.size;
  const s = target / modelBaseMaxDim;
  layersModelEl.setAttribute("scale", `${s} ${s} ${s}`);
  return true;
};

const placeLayersModelInFrontOfMarker = () => {
  // Tune translation and orientation from one place.
  if (!layersModelEl) {
    return;
  }
  const markerSize = getMarkerSizeUnits();
  layersModelEl.setAttribute(
    "position",
    `${MODEL_POSITION_RELATIVE_TO_TAG.x * markerSize} ${MODEL_POSITION_RELATIVE_TO_TAG.y * markerSize} ${
      MODEL_POSITION_RELATIVE_TO_TAG.z * markerSize
    }`,
  );
  layersModelEl.setAttribute(
    "rotation",
    `${MODEL_ROTATION.pitch + MODEL_DEVICE_CALIBRATION.pitch} ${
      MODEL_ROTATION.yaw + MODEL_DEVICE_CALIBRATION.yaw
    } ${MODEL_ROTATION.roll + MODEL_DEVICE_CALIBRATION.roll}`,
  );
};

const applyModelTransformNow = () => {
  if (modelScaleRefreshPending) {
    fitLayersModelToMarker();
    modelScaleRefreshPending = false;
  }
  placeLayersModelInFrontOfMarker();
  updateRotationReadout();
};

const scheduleModelTransform = ({ recomputeScale = false } = {}) => {
  modelScaleRefreshPending = modelScaleRefreshPending || recomputeScale;
  if (modelTransformRafId) {
    return;
  }
  modelTransformRafId = requestAnimationFrame(() => {
    modelTransformRafId = 0;
    applyModelTransformNow();
  });
};

const updateRotationReadout = () => {
  if (stabilizerLerpValue) {
    stabilizerLerpValue.textContent = STABILIZER_LERP_FACTOR.toFixed(2);
  }
  if (positionDeadbandValue) {
    positionDeadbandValue.textContent = POSITION_DEADBAND.toFixed(3);
  }
  if (rotationDeadbandValue) {
    rotationDeadbandValue.textContent = `${ROTATION_DEADBAND_DEG.toFixed(2)}deg`;
  }
  if (biasOneXValue) {
    biasOneXValue.textContent = VISIBILITY_CONTEXT_BIAS.one.x.toFixed(2);
  }
  if (biasOneYValue) {
    biasOneYValue.textContent = VISIBILITY_CONTEXT_BIAS.one.y.toFixed(2);
  }
  if (biasOneZValue) {
    biasOneZValue.textContent = VISIBILITY_CONTEXT_BIAS.one.z.toFixed(2);
  }
  if (biasTwoXValue) {
    biasTwoXValue.textContent = VISIBILITY_CONTEXT_BIAS.two.x.toFixed(2);
  }
  if (biasTwoYValue) {
    biasTwoYValue.textContent = VISIBILITY_CONTEXT_BIAS.two.y.toFixed(2);
  }
  if (biasTwoZValue) {
    biasTwoZValue.textContent = VISIBILITY_CONTEXT_BIAS.two.z.toFixed(2);
  }
  if (biasThreeXValue) {
    biasThreeXValue.textContent = VISIBILITY_CONTEXT_BIAS.three.x.toFixed(2);
  }
  if (biasThreeYValue) {
    biasThreeYValue.textContent = VISIBILITY_CONTEXT_BIAS.three.y.toFixed(2);
  }
  if (biasThreeZValue) {
    biasThreeZValue.textContent = VISIBILITY_CONTEXT_BIAS.three.z.toFixed(2);
  }
  if (sizeValue) {
    sizeValue.textContent = `${MODEL_SIZE_RELATIVE_TO_TAG.toFixed(2)}x`;
  }
  if (offsetXValue) {
    offsetXValue.textContent = MODEL_POSITION_RELATIVE_TO_TAG.x.toFixed(2);
  }
  if (offsetYValue) {
    offsetYValue.textContent = MODEL_POSITION_RELATIVE_TO_TAG.y.toFixed(2);
  }
  if (offsetZValue) {
    offsetZValue.textContent = MODEL_POSITION_RELATIVE_TO_TAG.z.toFixed(2);
  }
  if (pitchValue) {
    pitchValue.textContent = `${Math.round(MODEL_ROTATION.pitch)}deg`;
  }
  if (yawValue) {
    yawValue.textContent = `${Math.round(MODEL_ROTATION.yaw)}deg`;
  }
  if (rollValue) {
    rollValue.textContent = `${Math.round(MODEL_ROTATION.roll)}deg`;
  }
};

const syncRotationSlidersFromModel = () => {
  if (stabilizerLerpSlider) {
    stabilizerLerpSlider.value = String(STABILIZER_LERP_FACTOR);
  }
  if (positionDeadbandSlider) {
    positionDeadbandSlider.value = String(POSITION_DEADBAND);
  }
  if (rotationDeadbandSlider) {
    rotationDeadbandSlider.value = String(ROTATION_DEADBAND_DEG);
  }
  if (biasOneXSlider) {
    biasOneXSlider.value = String(VISIBILITY_CONTEXT_BIAS.one.x);
  }
  if (biasOneYSlider) {
    biasOneYSlider.value = String(VISIBILITY_CONTEXT_BIAS.one.y);
  }
  if (biasOneZSlider) {
    biasOneZSlider.value = String(VISIBILITY_CONTEXT_BIAS.one.z);
  }
  if (biasTwoXSlider) {
    biasTwoXSlider.value = String(VISIBILITY_CONTEXT_BIAS.two.x);
  }
  if (biasTwoYSlider) {
    biasTwoYSlider.value = String(VISIBILITY_CONTEXT_BIAS.two.y);
  }
  if (biasTwoZSlider) {
    biasTwoZSlider.value = String(VISIBILITY_CONTEXT_BIAS.two.z);
  }
  if (biasThreeXSlider) {
    biasThreeXSlider.value = String(VISIBILITY_CONTEXT_BIAS.three.x);
  }
  if (biasThreeYSlider) {
    biasThreeYSlider.value = String(VISIBILITY_CONTEXT_BIAS.three.y);
  }
  if (biasThreeZSlider) {
    biasThreeZSlider.value = String(VISIBILITY_CONTEXT_BIAS.three.z);
  }
  if (sizeSlider) {
    sizeSlider.value = String(MODEL_SIZE_RELATIVE_TO_TAG);
  }
  if (offsetXSlider) {
    offsetXSlider.value = String(MODEL_POSITION_RELATIVE_TO_TAG.x);
  }
  if (offsetYSlider) {
    offsetYSlider.value = String(MODEL_POSITION_RELATIVE_TO_TAG.y);
  }
  if (offsetZSlider) {
    offsetZSlider.value = String(MODEL_POSITION_RELATIVE_TO_TAG.z);
  }
  if (pitchSlider) {
    pitchSlider.value = String(MODEL_ROTATION.pitch);
  }
  if (yawSlider) {
    yawSlider.value = String(MODEL_ROTATION.yaw);
  }
  if (rollSlider) {
    rollSlider.value = String(MODEL_ROTATION.roll);
  }
  updateRotationReadout();
};

const tryFitLayersModelToMarker = () => {
  if (!layersModelEl || layersModelFitDone) {
    return;
  }
  const ok = fitLayersModelToMarker();
  if (!ok) {
    return;
  }
  placeLayersModelInFrontOfMarker();
  layersModelFitDone = true;
  debugLog("P1:model:layers:fit", { ok: true });
};

if (layersModelEl) {
  // If the model finishes loading after we already started tracking, ensure we still fit it.
  layersModelEl.addEventListener("model-loaded", () => {
    modelBaseMaxDim = 0;
    layersModelFitDone = false;
    scheduleModelTransform({ recomputeScale: true });
  });
}

// If the model loads before marker tracking, attempt a late fit as a fallback.
setTimeout(() => {
  tryFitLayersModelToMarker();
}, 1500);
syncRotationSlidersFromModel();

if (splashStart) {
  splashStart.addEventListener("click", () => {
    void onStartMission();
  });
}

if (refreshCamerasBtn) {
  refreshCamerasBtn.addEventListener("click", async () => {
    const v = findArVideo();
    const id = v?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().deviceId ?? "";
    await populateCameraSelect(id);
    logVideoList("after-refresh");
  });
}

if (cameraSelect) {
  cameraSelect.addEventListener("change", () => {
    const id = cameraSelect.value;
    if (!id) {
      return;
    }
    const v = findArVideo() || ensureFallbackVideo();
    if (!v) {
      return;
    }
    void (async () => {
      try {
        v.srcObject?.getTracks().forEach((t) => t.stop());
        const stream = await requestStreamForDevice(id);
        v.srcObject = stream;
        localStorage.setItem(STORAGE_DEVICE_KEY, id);
        const tr = stream.getVideoTracks()[0];
        if (tr) {
          logTrackDetail(tr);
          setupZoomForTrack(tr);
          await setupFocusForTrack(tr);
        }
        await v.play();
        debugLog("P1:cam:switch:ok", { device: id.slice(0, 8) });
      } catch (e) {
        debugLog("P1:cam:switch:fail", e instanceof Error ? e.message : e);
      }
    })();
  });
}

const applyStabilizerLerpToRoot = () => {
  if (!stableModelRootEl) {
    return;
  }
  stableModelRootEl.setAttribute("multi-marker-stabilizer", `lerpFactor: ${STABILIZER_LERP_FACTOR.toFixed(2)}`);
};

const bindBiasSlider = (sliderEl, targetBias, axis) => {
  if (!sliderEl) {
    return;
  }
  sliderEl.addEventListener("input", () => {
    const value = Number(sliderEl.value);
    if (axis === "x") {
      targetBias.x = value;
    } else if (axis === "y") {
      targetBias.y = value;
    } else if (axis === "z") {
      targetBias.z = value;
    }
    updateRotationReadout();
  });
};

if (stabilizerLerpSlider) {
  stabilizerLerpSlider.addEventListener("input", () => {
    STABILIZER_LERP_FACTOR = Number(stabilizerLerpSlider.value);
    applyStabilizerLerpToRoot();
    updateRotationReadout();
  });
}

if (positionDeadbandSlider) {
  positionDeadbandSlider.addEventListener("input", () => {
    POSITION_DEADBAND = Number(positionDeadbandSlider.value);
    updateRotationReadout();
  });
}

if (rotationDeadbandSlider) {
  rotationDeadbandSlider.addEventListener("input", () => {
    ROTATION_DEADBAND_DEG = Number(rotationDeadbandSlider.value);
    updateRotationReadout();
  });
}

bindBiasSlider(biasOneXSlider, VISIBILITY_CONTEXT_BIAS.one, "x");
bindBiasSlider(biasOneYSlider, VISIBILITY_CONTEXT_BIAS.one, "y");
bindBiasSlider(biasOneZSlider, VISIBILITY_CONTEXT_BIAS.one, "z");
bindBiasSlider(biasTwoXSlider, VISIBILITY_CONTEXT_BIAS.two, "x");
bindBiasSlider(biasTwoYSlider, VISIBILITY_CONTEXT_BIAS.two, "y");
bindBiasSlider(biasTwoZSlider, VISIBILITY_CONTEXT_BIAS.two, "z");
bindBiasSlider(biasThreeXSlider, VISIBILITY_CONTEXT_BIAS.three, "x");
bindBiasSlider(biasThreeYSlider, VISIBILITY_CONTEXT_BIAS.three, "y");
bindBiasSlider(biasThreeZSlider, VISIBILITY_CONTEXT_BIAS.three, "z");
applyStabilizerLerpToRoot();

if (pitchSlider) {
  pitchSlider.addEventListener("input", () => {
    MODEL_ROTATION.pitch = Number(pitchSlider.value);
    scheduleModelTransform();
  });
}

if (yawSlider) {
  yawSlider.addEventListener("input", () => {
    MODEL_ROTATION.yaw = Number(yawSlider.value);
    scheduleModelTransform();
  });
}

if (rollSlider) {
  rollSlider.addEventListener("input", () => {
    MODEL_ROTATION.roll = Number(rollSlider.value);
    scheduleModelTransform();
  });
}

if (sizeSlider) {
  sizeSlider.addEventListener("input", () => {
    MODEL_SIZE_RELATIVE_TO_TAG = Number(sizeSlider.value);
    scheduleModelTransform({ recomputeScale: true });
  });
}

if (offsetXSlider) {
  offsetXSlider.addEventListener("input", () => {
    MODEL_POSITION_RELATIVE_TO_TAG.x = Number(offsetXSlider.value);
    scheduleModelTransform();
  });
}

if (offsetYSlider) {
  offsetYSlider.addEventListener("input", () => {
    MODEL_POSITION_RELATIVE_TO_TAG.y = Number(offsetYSlider.value);
    scheduleModelTransform();
  });
}

if (offsetZSlider) {
  offsetZSlider.addEventListener("input", () => {
    MODEL_POSITION_RELATIVE_TO_TAG.z = Number(offsetZSlider.value);
    scheduleModelTransform();
  });
}

/** Periodically re-scan for late AR.js video and bind loggers. */
const pollVideos = (maxMs) => {
  const t0 = performance.now();
  const id = setInterval(() => {
    logVideoList("interval-scan");
    for (const v of document.querySelectorAll("video")) {
      bindVideoPipelineLoggers(v);
    }
    if (performance.now() - t0 > maxMs) {
      clearInterval(id);
      debugLog("P1:poll:stopped", { maxMs });
    }
  }, 2000);
};

pollVideos(30000);
void loadChartDataStub();

setTimeout(() => {
  for (const v of document.querySelectorAll("video")) {
    bindVideoPipelineLoggers(v);
  }
  const v = findArVideo();
  if (v) {
    const t = v.srcObject?.getVideoTracks?.()[0];
    if (t) {
      logTrackDetail(t);
      void populateCameraSelect(t.getSettings?.().deviceId ?? "");
      void setupFocusForTrack(t);
    }
  }
  logVideoList("2s-snapshot");
}, 2000);

debugLog("P1:boot:app-js:end", { ms: Math.round(performance.now() - BOOT_T0) });
