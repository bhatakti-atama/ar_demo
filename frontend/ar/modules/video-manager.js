/**
 * Centralized video management for AR.js camera feeds.
 * Consolidates video finding, binding, stream handling, and track setup.
 * @file video-manager.js
 */

import { arScene, arViewport, cameraSelect, focusNote, zoomNote, zoomSlider } from "./dom-elements.js";
import { STORAGE_DEVICE_KEY } from "./marker-config.js";

/** @typedef {(tag: string, ...parts: unknown[]) => void} DebugLogFn */

/** @type {WeakSet<HTMLVideoElement>} */
const boundVideos = new WeakSet();

/** @type {((this: HTMLInputElement) => void) | null} */
let zoomInputHandler = null;

/** @type {DebugLogFn} */
let debugLog = () => {};

/**
 * Initialize video manager with debug logger
 * @param {DebugLogFn} logger
 */
export const initVideoManager = (logger) => {
  debugLog = logger;
};

/**
 * Describe video element for logging
 * @param {HTMLVideoElement} v
 * @param {number} i
 */
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

/**
 * Log all video elements on page
 * @param {string} reason
 */
export const logVideoList = (reason) => {
  const vids = [...document.querySelectorAll("video")];
  debugLog("P1:video:list", reason, { count: vids.length, detail: vids.map(describeVideo) });
  if (vids.length) {
    console.table(vids.map((v, i) => describeVideo(v, i)));
  }
};

/**
 * Find the AR video element (AR.js injected or manual)
 * @returns {HTMLVideoElement|null}
 */
export const findArVideo = () => {
  return /** @type {HTMLVideoElement|null} */ (
    (arViewport && arViewport.querySelector("video")) ||
    (arScene && arScene.querySelector("video")) ||
    [...document.querySelectorAll("video")].find((v) => v.srcObject) ||
    document.querySelector("video")
  );
};

/**
 * Create fallback video element if none exists
 * @returns {HTMLVideoElement|null}
 */
export const ensureFallbackVideo = () => {
  let v = findArVideo();
  if (v) return v;
  if (!arViewport) return null;

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

/**
 * Bind event loggers to video (only once per video)
 * @param {HTMLVideoElement} video
 */
export const bindVideoPipelineLoggers = (video) => {
  if (!video || boundVideos.has(video)) return;
  boundVideos.add(video);

  const tag = (ev) => {
    const track = /** @type {MediaStream|null} */ (video.srcObject)?.getVideoTracks?.()[0];
    debugLog("P1:video:event", ev, {
      readyState: video.readyState,
      videoW: video.videoWidth,
      videoH: video.videoHeight,
      trackState: track?.readyState,
      trackLabel: track?.label,
    });
  };

  const events = [
    "loadstart", "loadeddata", "loadedmetadata", "canplay", "canplaythrough",
    "playing", "pause", "stalled", "waiting", "suspend", "error",
  ];
  events.forEach((ev) => video.addEventListener(ev, () => tag(ev)));

  video.addEventListener("error", () => {
    const err = video.error;
    debugLog("P1:video:error:detail", err ? { code: err.code, message: err.message } : "none");
  });
};

/**
 * Reparent AR.js injected video into viewport for proper compositing
 * @returns {boolean} true if reparented
 */
export const reparentArjsVideoIntoViewport = () => {
  const vp = arViewport;
  const v = document.getElementById("arjs-video") || document.querySelector("body > video");
  if (!vp || !v) return false;
  if (v.parentElement === vp) return false;

  const from = v.parentElement?.nodeName ?? "";
  const first = vp.firstChild;
  vp.insertBefore(v, first);
  void /** @type {HTMLVideoElement} */ (v).play().catch(() => {});
  debugLog("P1:fix:reparent-ar-video", {
    from,
    to: "ar-viewport (first child, under a-scene)",
    id: v.id,
  });
  return true;
};

/**
 * Log detailed track information
 * @param {MediaStreamTrack|null|undefined} track
 */
export const logTrackDetail = (track) => {
  if (!track) return;
  const capabilities = (() => {
    try { return track.getCapabilities?.() ?? null; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  })();
  const settings = (() => {
    try { return track.getSettings?.() ?? null; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
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

/**
 * Get track capabilities safely
 * @param {MediaStreamTrack|null|undefined} track
 * @returns {MediaTrackCapabilities|null}
 */
const getTrackCapabilities = (track) => {
  if (!track || typeof track.getCapabilities !== "function") return null;
  return track.getCapabilities();
};

const detachZoomHandler = () => {
  if (zoomSlider && zoomInputHandler) {
    zoomSlider.removeEventListener("input", zoomInputHandler);
  }
  zoomInputHandler = null;
};

/**
 * Setup zoom control for a video track
 * @param {MediaStreamTrack} track
 */
const setupZoomForTrack = (track) => {
  detachZoomHandler();
  if (!zoomSlider || !zoomNote) return;

  const capabilities = getTrackCapabilities(track);
  debugLog("P1:cam:zoom:capabilities", capabilities ?? {});

  if (!capabilities?.zoom) {
    zoomNote.textContent = "Zoom: not available (e.g. iOS Safari).";
    zoomSlider.disabled = true;
    zoomSlider.min = "1";
    zoomSlider.max = "1";
    zoomSlider.step = "0.1";
    zoomSlider.value = "1";
    return;
  }

  const { min = 1, max = 1, step = 0.1 } = capabilities.zoom;
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
    void applyZoom(Number(zoomSlider.value));
  };
  zoomSlider.addEventListener("input", zoomInputHandler);
  zoomNote.textContent = "Zoom (when supported on this device).";
};

/**
 * Setup focus mode for a video track
 * @param {MediaStreamTrack} track
 */
const setupFocusForTrack = async (track) => {
  if (!focusNote) return;

  const capabilities = getTrackCapabilities(track);
  const focusModes = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];
  debugLog("P1:cam:focus:capabilities", { focusModes });

  if (focusModes.length === 0) {
    focusNote.textContent = "Focus: not supported on this camera/browser.";
    return;
  }

  const preferredMode = focusModes.includes("single-shot") ? "single-shot"
    : focusModes.includes("continuous") ? "continuous"
    : focusModes.includes("auto") ? "auto"
    : "";

  if (preferredMode) {
    try {
      await track.applyConstraints({ advanced: [{ focusMode: preferredMode }] });
      debugLog("P1:cam:focus:apply:ok", { mode: preferredMode });
    } catch (e) {
      debugLog("P1:cam:focus:apply:fail", { mode: preferredMode, err: e instanceof Error ? e.message : String(e) });
    }
  }
  focusNote.textContent = `Focus ready (${focusModes.join(", ")}).`;
};

/**
 * Setup both zoom and focus for a track (single call instead of two)
 * @param {MediaStreamTrack} track
 */
export const setupTrackControls = async (track) => {
  setupZoomForTrack(track);
  await setupFocusForTrack(track);
};

/**
 * Build preferred video constraints with fallback-friendly options
 * @param {MediaTrackConstraints} baseVideo
 * @returns {MediaTrackConstraints}
 */
const buildPreferredVideoConstraints = (baseVideo = {}) => ({
  ...baseVideo,
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 60 },
  focusMode: "continuous",
  exposureMode: "continuous",
});

/**
 * Request camera stream with progressive fallbacks
 * @returns {Promise<MediaStream>}
 */
export const requestCameraStream = async () => {
  debugLog("P1:cam:getUserMedia:try", { idealFacing: "environment", idealWidth: 1920, idealHeight: 1080, idealFps: 30 });

  const attempts = [
    () => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: buildPreferredVideoConstraints({ facingMode: { ideal: "environment" } }),
    }),
    () => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    }),
    () => navigator.mediaDevices.getUserMedia({ audio: false, video: true }),
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      return await attempts[i]();
    } catch (e) {
      const isLast = i === attempts.length - 1;
      const isFatal = e && typeof e === "object" && "name" in e &&
        ["NotAllowedError", "SecurityError", "NotReadableError"].includes(/** @type {DOMException} */ (e).name);
      
      debugLog(`P1:cam:getUserMedia:attempt${i + 1}:fail`, e instanceof Error ? e.name : String(e));
      
      if (isLast || isFatal) throw e;
    }
  }
  throw new Error("All camera stream attempts failed");
};

/**
 * Request stream for specific device with fallbacks
 * @param {string} deviceId
 * @returns {Promise<MediaStream>}
 */
export const requestStreamForDevice = async (deviceId) => {
  const attempts = [
    () => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: buildPreferredVideoConstraints({ deviceId: { exact: deviceId } }),
    }),
    () => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: buildPreferredVideoConstraints({ deviceId: { ideal: deviceId } }),
    }),
    () => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { ideal: deviceId } },
    }),
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      return await attempts[i]();
    } catch (e) {
      debugLog(`P1:cam:getUserMedia:device:attempt${i + 1}:fail`, e instanceof Error ? e.name : String(e));
      if (i === attempts.length - 1) throw e;
    }
  }
  throw new Error("All device stream attempts failed");
};

/**
 * Populate camera select dropdown
 * @param {string} currentDeviceId
 */
export const populateCameraSelect = async (currentDeviceId) => {
  if (!cameraSelect || !navigator.mediaDevices?.enumerateDevices) return;

  const videoInputs = await navigator.mediaDevices.enumerateDevices()
    .then((d) => d.filter((x) => x.kind === "videoinput"));

  debugLog("P1:cam:enumerate", { n: videoInputs.length, hasLabels: videoInputs.filter((d) => d.label).length });

  cameraSelect.innerHTML = "";
  for (const device of videoInputs) {
    if (!device.deviceId) continue;
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label?.trim() || `id ${String(device.deviceId).slice(0, 6)}…`;
    if (device.deviceId === currentDeviceId) option.selected = true;
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

/**
 * Format getUserMedia error for user display
 * @param {unknown} e
 * @returns {string}
 */
export const formatGetUserMediaError = (e) => {
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

/**
 * Apply stream to video element with full setup
 * @param {MediaStream} stream
 * @param {(msg: string, duration?: number) => void} showToast
 */
export const applyStreamToTargetVideo = async (stream, showToast) => {
  const video = ensureFallbackVideo();
  if (!video) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("No video target element.");
  }

  const prev = /** @type {MediaStream|null} */ (video.srcObject);
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
    await setupTrackControls(track);
  }

  showToast("Manual stream attached to preview (check drawer if AR conflicts).", 4000);
  debugLog("P1:cam:applyStream:done", { toId: video.id });
};

/**
 * Watch for dynamically added video elements (AR.js injection)
 * @returns {MutationObserver}
 */
export const watchVideoElements = () => {
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

/**
 * Nudge all videos to play (useful after user interaction)
 */
export const nudgeAllVideos = () => {
  const vids = [...document.querySelectorAll("video")];
  debugLog("P1:cam:nudge:count", { videos: vids.length });
  for (const v of /** @type {HTMLVideoElement[]} */ (vids)) {
    v.muted = true;
    void v.play().then(() => {
      debugLog("P1:cam:nudge:play:ok", { id: v.id, paused: v.paused });
    }).catch((e) => {
      debugLog("P1:cam:nudge:play:fail", { id: v.id, err: e instanceof Error ? e.message : e });
    });
  }
};

/**
 * Handle camera switch from dropdown
 * @param {string} deviceId
 * @param {(msg: string, duration?: number) => void} showToast
 */
export const switchCamera = async (deviceId, showToast) => {
  if (!deviceId) return;

  const v = findArVideo() || ensureFallbackVideo();
  if (!v) return;

  try {
    /** @type {MediaStream|null} */ (v.srcObject)?.getTracks().forEach((t) => t.stop());
    const stream = await requestStreamForDevice(deviceId);
    v.srcObject = stream;
    localStorage.setItem(STORAGE_DEVICE_KEY, deviceId);

    const tr = stream.getVideoTracks()[0];
    if (tr) {
      logTrackDetail(tr);
      await setupTrackControls(tr);
    }
    await v.play();
    debugLog("P1:cam:switch:ok", { device: deviceId.slice(0, 8) });
  } catch (e) {
    debugLog("P1:cam:switch:fail", e instanceof Error ? e.message : e);
    showToast(formatGetUserMediaError(e), 5000);
  }
};
