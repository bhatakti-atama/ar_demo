/**
 * Phase 1 (plan.md): A-Frame + AR.js (CDN) + secure context + maximum structured logging.
 * @file app.js
 */

const BOOT_T0 = performance.now();
const LOG_NS = "phase1";
const MAX_DEBUG_LOG_LINES = 220;

const STORAGE_DEVICE_KEY = "ar-charts-preferred-camera-device-id";
const PERMISSIONS_QUERY_TIMEOUT_MS = 2000;

const markerEl = document.getElementById("barcode-marker");
const solarModelEl = document.getElementById("solar-dummy-model");
const layersModelEl = document.getElementById("layers_of_the_sun_model");
const settingsDrawer = document.getElementById("settings-drawer");
const settingsGear = document.getElementById("settings-gear");
const drawerClose = document.getElementById("drawer-close");
const refreshCamerasBtn = document.getElementById("refresh-cameras");
const zoomSlider = document.getElementById("zoom-slider");
const zoomNote = document.getElementById("zoom-note");
const autofocusBtn = document.getElementById("autofocus-now");
const focusNote = document.getElementById("focus-note");
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
const MODEL_OFFSET_X = -1.2;
const MODEL_OFFSET_Y = -1.2;
const MODEL_OFFSET_Z = 1.0;
const MODEL_TARGET_SIZE = 3;

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

const getActiveVideoTrack = () => {
  const video = findArVideo();
  return video?.srcObject?.getVideoTracks?.()[0] ?? null;
};

const setFocusUiState = (enabled, message) => {
  if (autofocusBtn) {
    autofocusBtn.disabled = !enabled;
  }
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

const clamp01 = (value) => {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
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

const triggerAutofocus = async (track, normPoint = null) => {
  const capabilities = getTrackCapabilities(track);
  const mode = getPreferredFocusMode(capabilities);
  if (!mode) {
    setFocusUiState(false, "Focus: unsupported on this camera.");
    return false;
  }

  // Try touch-based focus first when supported, then fall back to mode-only autofocus.
  if (
    normPoint &&
    Array.isArray(capabilities?.pointsOfInterest) &&
    capabilities.pointsOfInterest.length > 0
  ) {
    try {
      await track.applyConstraints({
        advanced: [
          {
            focusMode: mode,
            pointsOfInterest: [
              {
                x: clamp01(normPoint.x),
                y: clamp01(normPoint.y),
              },
            ],
          },
        ],
      });
      debugLog("P1:cam:focus:poi:ok", { mode, point: normPoint });
      setFocusUiState(true, `Focus tapped (${mode}).`);
      showToast(`AUTOFOCUS TAP // ${mode.toUpperCase()}`, 1800);
      return true;
    } catch (e) {
      debugLog("P1:cam:focus:poi:fail", e instanceof Error ? e.message : String(e));
    }
  }

  const ok = await applyFocusMode(track, mode);
  if (ok) {
    setFocusUiState(true, `Focus triggered (${mode}).`);
    showToast(`AUTOFOCUS // ${mode.toUpperCase()}`, 2200);
    return true;
  }
  setFocusUiState(true, `Focus mode ${mode} failed.`);
  return false;
};

const setupFocusForTrack = async (track) => {
  if (!autofocusBtn || !focusNote) {
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

const requestStreamForDevice = async (deviceId) => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: deviceId } },
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { ideal: deviceId } },
    });
  }
};

const requestCameraStream = async () => {
  debugLog("P1:cam:getUserMedia:try", { idealFacing: "environment" });
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    return s;
  } catch (e) {
    debugLog("P1:cam:getUserMedia:fallback:video-true", e instanceof Error ? e.name : e);
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

if (markerEl) {
  markerEl.addEventListener("markerFound", () => {
    debugLog("P1:marker:found", {
      timeMs: Math.round(performance.now() - BOOT_T0),
      model: layersModelEl ? "layers_of_the_sun" : solarModelEl ? "solar-dummy" : "none",
    });
    setCrosshairLocked();
    showToast("STABLE LINK // SOLAR TELEMETRY LOCKED", 4200);
    if (firstMarkerLock) {
      firstMarkerLock = false;
      runHeaderGlitch();
    }
    tryFitLayersModelToMarker();
  });
  markerEl.addEventListener("markerLost", () => {
    debugLog("P1:marker:lost");
    setCrosshairScanning();
    showToast("SIGNAL LOST // RESCANNING TARGET", 3200);
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

  const obj = layersModelEl.object3D;
  const box = new THREERef.Box3().setFromObject(obj);
  const size = box.getSize(new THREERef.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // Target fits within the 1x1 marker bounds (leave a little margin).
  const target = MODEL_TARGET_SIZE;
  if (!maxDim || !Number.isFinite(maxDim) || maxDim <= 0) {
    return false;
  }

  const s = target / maxDim;
  layersModelEl.setAttribute("scale", `${s} ${s} ${s}`);
  return true;
};

const placeLayersModelInFrontOfMarker = () => {
  // Move slightly towards the camera to sit "in front of" the printed marker.
  // Tuneable: increase if it appears inside/behind the image.
  layersModelEl?.setAttribute(
    "position",
    `${MODEL_OFFSET_X} ${MODEL_OFFSET_Y} ${MODEL_OFFSET_Z}`,
  );
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
    layersModelFitDone = false;
    tryFitLayersModelToMarker();
  });
}

// If the model loads before marker tracking, attempt a late fit as a fallback.
setTimeout(() => {
  tryFitLayersModelToMarker();
}, 1500);

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

if (autofocusBtn) {
  autofocusBtn.addEventListener("click", () => {
    void (async () => {
      const track = getActiveVideoTrack();
      if (!track) {
        setFocusUiState(false, "Focus: no active camera track.");
        return;
      }
      await triggerAutofocus(track);
    })();
  });
}

if (arViewport) {
  arViewport.addEventListener(
    "touchstart",
    (event) => {
      void (async () => {
        const touch = event.touches?.[0];
        if (!touch) {
          return;
        }
        const rect = arViewport.getBoundingClientRect();
        const x = clamp01((touch.clientX - rect.left) / rect.width);
        const y = clamp01((touch.clientY - rect.top) / rect.height);
        const track = getActiveVideoTrack();
        if (!track) {
          return;
        }
        await triggerAutofocus(track, { x, y });
      })();
    },
    { passive: true },
  );
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
