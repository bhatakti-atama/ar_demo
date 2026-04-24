const statusNode = document.getElementById("status");
const marker = document.getElementById("chart-marker");
const cameraPanel = document.getElementById("camera-panel");
const cameraToggle = document.getElementById("camera-toggle");
const refreshCamerasBtn = document.getElementById("refresh-cameras");
const zoomSlider = document.getElementById("zoom-slider");
const zoomNote = document.getElementById("zoom-note");
const cameraSelect = document.getElementById("camera-select");

const STORAGE_DEVICE_KEY = "ar-charts-preferred-camera-device-id";

const palette = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"];

const setStatus = (message) => {
  if (statusNode) {
    statusNode.innerHTML = message;
  }
};

const syncCameraPanel = (isOpen) => {
  if (!cameraPanel || !cameraToggle) {
    return;
  }
  cameraPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  cameraToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
};

if (cameraToggle && cameraPanel) {
  cameraToggle.addEventListener("click", () => {
    const isHidden = cameraPanel.getAttribute("aria-hidden") === "true";
    syncCameraPanel(!isHidden);
  });
}

const findArVideo = () => {
  const scene = document.querySelector("a-scene");
  const inScene = scene?.querySelector?.("video");
  if (inScene) {
    return inScene;
  }
  const withStream = [...document.querySelectorAll("video")].find(
    (video) => video.srcObject,
  );
  return withStream ?? document.querySelector("video");
};

const toHeight = (value, maxValue) => {
  const minHeight = 0.2;
  const maxHeight = 1.4;
  return minHeight + (value / maxValue) * (maxHeight - minHeight);
};

const getTrackCapabilities = (track) => {
  if (!track || typeof track.getCapabilities !== "function") {
    return null;
  }
  return track.getCapabilities();
};

const waitForVideoTrack = async () => {
  const maxAttempts = 80;

  const tryOnce = () => {
    const video = findArVideo();
    const stream = video?.srcObject;
    const tracks = stream?.getVideoTracks?.() ?? [];
    return tracks[0] ?? null;
  };

  let track = tryOnce();
  if (track) {
    return { track, video: findArVideo() };
  }

  await new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      track = tryOnce();
      if (track) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 15000);
  });

  track = tryOnce();
  if (track) {
    return { track, video: findArVideo() };
  }

  for (let i = 0; i < maxAttempts; i += 1) {
    track = tryOnce();
    if (track) {
      return { track, video: findArVideo() };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { track: null, video: findArVideo() };
};

/** @type {((this: HTMLInputElement, ev: Event) => void) | null} */
let zoomInputHandler = null;

const detachZoomHandler = () => {
  if (zoomSlider && zoomInputHandler) {
    zoomSlider.removeEventListener("input", zoomInputHandler);
  }
  zoomInputHandler = null;
};

const setupZoomForTrack = (track) => {
  detachZoomHandler();
  if (!zoomSlider || !zoomNote) {
    return;
  }

  const capabilities = getTrackCapabilities(track);

  if (!capabilities?.zoom) {
    zoomNote.textContent =
      "Zoom: not available in this browser (common on iOS Safari).";
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
      await track.applyConstraints({
        advanced: [{ zoom: value }],
      });
      zoomNote.textContent = `Zoom: ${Number(value).toFixed(1)}x`;
    } catch {
      zoomNote.textContent =
        "Zoom blocked by the browser. Try Chrome on Android or move closer.";
    }
  };

  zoomInputHandler = () => {
    const value = Number(zoomSlider.value);
    void applyZoom(value);
  };
  zoomSlider.addEventListener("input", zoomInputHandler);

  zoomNote.textContent =
    "Rear camera preferred. Adjust zoom if the marker looks soft.";
};

const getVideoInputs = () =>
  navigator.mediaDevices
    .enumerateDevices()
    .then((devices) => devices.filter((d) => d.kind === "videoinput"));

const populateCameraSelect = async (currentDeviceId) => {
  if (!cameraSelect) {
    return;
  }

  cameraSelect.innerHTML = "";

  if (!navigator.mediaDevices?.enumerateDevices) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Camera list is not supported here";
    cameraSelect.appendChild(option);
    cameraSelect.disabled = true;
    return;
  }

  const videoInputs = await getVideoInputs();

  if (videoInputs.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No cameras found";
    cameraSelect.appendChild(option);
    cameraSelect.disabled = true;
    return;
  }

  for (const device of videoInputs) {
    const option = document.createElement("option");
    option.value = device.deviceId;
    const label = device.label?.trim() || `Camera ${device.deviceId.slice(0, 6)}…`;
    option.textContent = label;
    if (device.deviceId === currentDeviceId) {
      option.selected = true;
    }
    cameraSelect.appendChild(option);
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

const switchCamera = async (deviceId) => {
  const video = findArVideo();
  if (!video || !deviceId) {
    return;
  }

  const oldStream = video.srcObject;
  oldStream?.getTracks?.().forEach((t) => t.stop());

  try {
    const stream = await requestStreamForDevice(deviceId);
    video.srcObject = stream;
    localStorage.setItem(STORAGE_DEVICE_KEY, deviceId);
    const track = stream.getVideoTracks()[0];
    if (track) {
      setupZoomForTrack(track);
    }
    if (zoomNote) {
      zoomNote.textContent = "Switched camera.";
    }
    const settings = track?.getSettings?.() ?? {};
    await populateCameraSelect(settings.deviceId ?? deviceId);
  } catch {
    if (zoomNote) {
      zoomNote.textContent =
        "Could not switch camera. Check permission and try again.";
    }
  }
};

const setupCameraChangeHandler = () => {
  if (!cameraSelect || cameraSelect.dataset.bound === "1") {
    return;
  }
  cameraSelect.dataset.bound = "1";
  cameraSelect.addEventListener("change", () => {
    const nextId = cameraSelect.value;
    if (nextId) {
      void switchCamera(nextId);
    }
  });
};

const setupCameraUi = async () => {
  if (!zoomSlider || !zoomNote) {
    return;
  }

  syncCameraPanel(true);
  zoomNote.textContent = "Waiting for the AR camera stream…";
  zoomSlider.disabled = true;

  const { track, video } = await waitForVideoTrack();

  if (!track || !video) {
    zoomNote.textContent =
      "No camera video from AR yet. Allow camera, then refresh the page.";
    if (cameraSelect) {
      cameraSelect.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Unavailable";
      cameraSelect.appendChild(option);
      cameraSelect.disabled = true;
    }
    return;
  }

  const settings = track.getSettings?.() ?? {};
  const currentId = settings.deviceId ?? "";

  await populateCameraSelect(currentId);
  setupCameraChangeHandler();

  if (refreshCamerasBtn && refreshCamerasBtn.dataset.bound !== "1") {
    refreshCamerasBtn.dataset.bound = "1";
    refreshCamerasBtn.addEventListener("click", async () => {
      const video = findArVideo();
      const activeId =
        video?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().deviceId ??
        currentId;
      await populateCameraSelect(activeId);
    });
  }

  const preferred = localStorage.getItem(STORAGE_DEVICE_KEY);
  if (
    preferred &&
    preferred !== currentId &&
    cameraSelect &&
    [...cameraSelect.options].some((o) => o.value === preferred)
  ) {
    cameraSelect.value = preferred;
    await switchCamera(preferred);
  } else {
    setupZoomForTrack(track);
  }
};

const createBar = (point, index, maxValue) => {
  const root = document.createElement("a-entity");

  const bar = document.createElement("a-box");
  const height = toHeight(point.value, maxValue);
  const x = index * 0.7 - 1.05;

  bar.setAttribute("position", `${x} ${height / 2} 0`);
  bar.setAttribute("depth", "0.32");
  bar.setAttribute("width", "0.32");
  bar.setAttribute("height", `${height}`);
  bar.setAttribute("color", palette[index % palette.length]);
  root.appendChild(bar);

  const valueLabel = document.createElement("a-text");
  valueLabel.setAttribute("value", `${point.value}`);
  valueLabel.setAttribute("position", `${x} ${height + 0.15} 0`);
  valueLabel.setAttribute("align", "center");
  valueLabel.setAttribute("color", "#ffffff");
  valueLabel.setAttribute("scale", "0.45 0.45 0.45");
  root.appendChild(valueLabel);

  const categoryLabel = document.createElement("a-text");
  categoryLabel.setAttribute("value", point.label);
  categoryLabel.setAttribute("position", `${x} -0.2 0`);
  categoryLabel.setAttribute("align", "center");
  categoryLabel.setAttribute("color", "#bfdbfe");
  categoryLabel.setAttribute("scale", "0.35 0.35 0.35");
  root.appendChild(categoryLabel);

  return root;
};

const buildChart = async () => {
  if (!marker) {
    return;
  }

  const response = await fetch("../data/chartData.json");
  const chartData = await response.json();
  const maxValue = Math.max(...chartData.map((point) => point.value));

  const base = document.createElement("a-box");
  base.setAttribute("position", "0 -0.03 0");
  base.setAttribute("depth", "0.9");
  base.setAttribute("width", "3.2");
  base.setAttribute("height", "0.06");
  base.setAttribute("color", "#1e293b");
  marker.appendChild(base);

  chartData.forEach((point, index) => {
    marker.appendChild(createBar(point, index, maxValue));
  });
};

marker?.addEventListener("markerFound", () => {
  setStatus("<strong>Marker detected.</strong> Chart anchored in AR.");
});

marker?.addEventListener("markerLost", () => {
  setStatus(
    "<strong>Marker lost.</strong> Re-center the camera on the Hiro marker.",
  );
});

buildChart().catch(() => {
  setStatus(
    "<strong>Unable to load chart data.</strong> Refresh and check the connection.",
  );
});

void setupCameraUi();

/** Ask A-Frame to reflow when orientation or mobile dynamic viewport changes */
const notifyViewportChange = () => {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
  });
};

window.addEventListener("orientationchange", notifyViewportChange, {
  passive: true,
});
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", notifyViewportChange, {
    passive: true,
  });
}
