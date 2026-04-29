import { markerEl } from "./dom-elements.js";

export const STORAGE_DEVICE_KEY = "ar-charts-preferred-camera-device-id";
export const PERMISSIONS_QUERY_TIMEOUT_MS = 2000;

export const MARKER_LAYOUT = [
  { corner: "top-left", elementId: "marker-tl", barcodeValue: "1", markerFile: "barcode-3x3-id1-top-left.png" },
  { corner: "top-right", elementId: "marker-tr", barcodeValue: "6", markerFile: "barcode-3x3-id6-top-right.png" },
  { corner: "bottom-left", elementId: "marker-bl", barcodeValue: "12", markerFile: "barcode-3x3-id12-bottom-left.png" },
  { corner: "bottom-right", elementId: "marker-br", barcodeValue: "18", markerFile: "barcode-3x3-id18-bottom-right.png" },
];

export const MARKER_SIZE_M = 0.065;
export const CHART_WIDTH_M = 0.6;
export const CHART_HEIGHT_M = 0.45;
export const MODEL_DIAMETER_RATIO_OF_CHART_WIDTH = 0.8;

export const CORNER_CENTER_TUNE = {
  "top-left": { x: 0, y: 0, z: 0 },
  "top-right": { x: 0, y: 0, z: 0 },
  "bottom-left": { x: 0, y: 0, z: 0 },
  "bottom-right": { x: 0, y: 0, z: 0 },
};

export const VISIBILITY_CONTEXT_BIAS = {
  one: { x: 0, y: 0, z: 0 },
  two: { x: 0, y: 0, z: 0 },
  three: { x: 0, y: 0, z: 0 },
  four: { x: 0, y: 0, z: 0 },
};

export const getMarkerSizeUnits = () =>
  Number(markerEl?.getAttribute("size")) > 0 ? Number(markerEl?.getAttribute("size")) : 1.0;

export const computeModelSizeRelativeToTag = (markerSize) => {
  const safeMarker = markerSize > 0 ? markerSize : MARKER_SIZE_M;
  const modelDiameterM = CHART_WIDTH_M * MODEL_DIAMETER_RATIO_OF_CHART_WIDTH;
  return modelDiameterM / safeMarker;
};

export const markerIdToBarcodeValue = new Map(
  MARKER_LAYOUT.map((spec) => [spec.elementId, spec.barcodeValue]),
);

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

export const getContextBiasByVisibleCount = (count) => {
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

/**
 * Get offset from corner marker to chart center.
 * Returns the position of the corner RELATIVE TO the chart center.
 * To get from corner to center, negate this offset.
 * 
 * Uses the marker's size attribute to scale properly with AR.js coordinate system.
 * @param {typeof THREE} THREERef
 * @param {string} corner
 * @param {number} markerSizeAttr - The marker's "size" attribute value (A-Frame units)
 */
export const getCornerOffset = (THREERef, corner, markerSizeAttr = 1.0) => {
  const halfSpanXMeters = (CHART_WIDTH_M - MARKER_SIZE_M) / 2;
  const halfSpanYMeters = (CHART_HEIGHT_M - MARKER_SIZE_M) / 2;
  
  const halfSpanX = halfSpanXMeters / MARKER_SIZE_M * markerSizeAttr;
  const halfSpanY = halfSpanYMeters / MARKER_SIZE_M * markerSizeAttr;

  let base;
  if (corner === "top-left") {
    base = new THREERef.Vector3(-halfSpanX, halfSpanY, 0);
  } else if (corner === "top-right") {
    base = new THREERef.Vector3(halfSpanX, halfSpanY, 0);
  } else if (corner === "bottom-left") {
    base = new THREERef.Vector3(-halfSpanX, -halfSpanY, 0);
  } else {
    base = new THREERef.Vector3(halfSpanX, -halfSpanY, 0);
  }

  const tune = getCornerTune(corner);
  return base.add(new THREERef.Vector3(tune.x, tune.y, tune.z));
};
