const statusNode = document.getElementById("status");
const marker = document.getElementById("chart-marker");
const zoomControls = document.getElementById("camera-controls");
const zoomSlider = document.getElementById("zoom-slider");
const zoomNote = document.getElementById("zoom-note");

const palette = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"];

const setStatus = (message) => {
  if (statusNode) {
    statusNode.innerHTML = message;
  }
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
  for (let i = 0; i < 25; i += 1) {
    const video = document.querySelector("video");
    const stream = video?.srcObject;
    const tracks = stream?.getVideoTracks?.() ?? [];
    const track = tracks[0];
    if (track) {
      return track;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
};

const setupZoomControl = async () => {
  const track = await waitForVideoTrack();
  if (!track || !zoomControls || !zoomSlider || !zoomNote) {
    return;
  }

  const capabilities = getTrackCapabilities(track);
  if (!capabilities?.zoom) {
    zoomNote.textContent =
      "This device/browser does not expose camera zoom controls.";
    zoomControls.hidden = false;
    zoomSlider.disabled = true;
    return;
  }

  const min = capabilities.zoom.min ?? 1;
  const max = capabilities.zoom.max ?? 1;
  const step = capabilities.zoom.step ?? 0.1;

  zoomSlider.min = String(min);
  zoomSlider.max = String(max);
  zoomSlider.step = String(step);
  zoomSlider.value = String(min);

  const applyZoom = async (value) => {
    try {
      await track.applyConstraints({
        advanced: [{ zoom: value }],
      });
      zoomNote.textContent = `Zoom: ${value.toFixed(1)}x`;
    } catch {
      zoomNote.textContent =
        "Zoom change blocked by browser. Try Chrome on Android.";
    }
  };

  zoomSlider.addEventListener("input", () => {
    const value = Number(zoomSlider.value);
    void applyZoom(value);
  });

  zoomControls.hidden = false;
  zoomNote.textContent = "Rear camera preferred. Adjust zoom if tracking is unstable.";
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
    "<strong>Marker lost.</strong> Re-center camera on Hiro marker for stable tracking.",
  );
});

buildChart().catch(() => {
  setStatus(
    "<strong>Unable to load chart data.</strong> Refresh page and check connection.",
  );
});

void setupZoomControl();
