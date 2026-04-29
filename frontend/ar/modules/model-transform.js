/**
 * Model transformation logic - scaling, positioning, and rotation.
 * Consolidates 5 overlapping functions into 2 clear ones.
 * @file model-transform.js
 */

import { layersModelEl } from "./dom-elements.js";
import {
  CHART_HEIGHT_M,
  CHART_WIDTH_M,
  MARKER_SIZE_M,
  getMarkerSizeUnits,
} from "./marker-config.js";
import { modelPosition, modelRotation, modelSize, syncDisplaysFromState } from "./slider-bindings.js";

/** @typedef {(tag: string, ...parts: unknown[]) => void} DebugLogFn */

const IS_MOBILE_DEVICE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const MODEL_CENTER_RATIO_FROM_CHART = { x: 0.0, y: -0.06 };
const MODEL_DEPTH_RELATIVE_TO_TAG = 2.3;
const MODEL_DEVICE_CALIBRATION = IS_MOBILE_DEVICE
  ? { size: 2.0, pitch: -41, yaw: 2, roll: 2 }
  : { size: 1.5, pitch: 0, yaw: 0, roll: 0 };

let modelBaseMaxDim = 0;
let modelFitDone = false;
let transformRafId = 0;
let scaleRefreshPending = false;
let baseComputedSize = 0;

/** @type {DebugLogFn} */
let debugLog = () => {};

/**
 * Initialize model transform with debug logger
 * @param {DebugLogFn} logger
 */
export const initModelTransform = (logger) => {
  debugLog = logger;
};

/** Get device calibration values */
export const getDeviceCalibration = () => MODEL_DEVICE_CALIBRATION;

/** Check if mobile device */
export const isMobileDevice = () => IS_MOBILE_DEVICE;

/**
 * Reset model state (call when model reloads)
 */
export const resetModelState = () => {
  modelBaseMaxDim = 0;
  modelFitDone = false;
  baseComputedSize = 0;
};

/**
 * Scale model to fit marker size
 * @returns {boolean} true if successful
 */
const fitModelScale = () => {
  if (!layersModelEl) return false;

  const THREERef = window.THREE;
  if (!THREERef || !THREERef.Box3 || !layersModelEl.object3D) return false;

  if (!modelBaseMaxDim) {
    const mesh = layersModelEl.getObject3D("mesh") || layersModelEl.object3D;
    const worldBox = new THREERef.Box3().setFromObject(mesh);
    const worldSize = worldBox.getSize(new THREERef.Vector3());
    const worldMaxDim = Math.max(worldSize.x, worldSize.y, worldSize.z);
    const currentScale = Number(layersModelEl.object3D.scale?.x) || 1;
    modelBaseMaxDim = worldMaxDim / currentScale;
    
    debugLog("P1:model:measure", {
      worldSize: { x: worldSize.x.toFixed(3), y: worldSize.y.toFixed(3), z: worldSize.z.toFixed(3) },
      worldMaxDim: worldMaxDim.toFixed(3),
      currentScale,
      modelBaseMaxDim: modelBaseMaxDim.toFixed(3),
    });
  }

  if (!modelBaseMaxDim || !Number.isFinite(modelBaseMaxDim) || modelBaseMaxDim <= 0) {
    return false;
  }

  const markerSizeAttr = getMarkerSizeUnits();
  const targetDiameterInWorld = CHART_WIDTH_M * 0.8;
  const targetInMarkerUnits = targetDiameterInWorld / MARKER_SIZE_M * markerSizeAttr;
  
  if (!baseComputedSize) {
    baseComputedSize = targetInMarkerUnits / modelBaseMaxDim;
    modelSize.value = baseComputedSize * MODEL_DEVICE_CALIBRATION.size;
  }

  const s = modelSize.value;
  layersModelEl.setAttribute("scale", `${s} ${s} ${s}`);
  
  debugLog("P1:model:scale", {
    markerSizeAttr,
    targetDiameterInWorld,
    targetInMarkerUnits: targetInMarkerUnits.toFixed(3),
    baseComputedSize: baseComputedSize.toFixed(3),
    appliedScale: s.toFixed(3),
  });
  
  return true;
};

/**
 * Position and rotate model relative to marker
 */
const placeModel = () => {
  if (!layersModelEl) return;

  const markerSize = getMarkerSizeUnits();
  const chartWidthInMarkerUnits = CHART_WIDTH_M / markerSize;
  const chartHeightInMarkerUnits = CHART_HEIGHT_M / markerSize;

  const baseX = MODEL_CENTER_RATIO_FROM_CHART.x * chartWidthInMarkerUnits;
  const baseY = MODEL_CENTER_RATIO_FROM_CHART.y * chartHeightInMarkerUnits;
  const baseZ = MODEL_DEPTH_RELATIVE_TO_TAG;

  layersModelEl.setAttribute(
    "position",
    `${(baseX + modelPosition.x) * markerSize} ${(baseY + modelPosition.y) * markerSize} ${(baseZ + modelPosition.z) * markerSize}`,
  );

  layersModelEl.setAttribute(
    "rotation",
    `${modelRotation.pitch + MODEL_DEVICE_CALIBRATION.pitch} ${modelRotation.yaw + MODEL_DEVICE_CALIBRATION.yaw} ${modelRotation.roll + MODEL_DEVICE_CALIBRATION.roll}`,
  );
};

/**
 * Apply model transform immediately (scale if needed, then position)
 */
const applyTransformNow = () => {
  if (scaleRefreshPending) {
    fitModelScale();
    scaleRefreshPending = false;
  }
  placeModel();
  syncDisplaysFromState();
};

/**
 * Schedule model transform on next animation frame
 * @param {Object} [options]
 * @param {boolean} [options.recomputeScale=false]
 */
export const scheduleModelTransform = ({ recomputeScale = false } = {}) => {
  scaleRefreshPending = scaleRefreshPending || recomputeScale;
  if (transformRafId) return;

  transformRafId = requestAnimationFrame(() => {
    transformRafId = 0;
    applyTransformNow();
  });
};

/**
 * Try initial model fit (called when marker first detected)
 * @returns {boolean} true if fit was applied
 */
export const tryInitialModelFit = () => {
  if (!layersModelEl || modelFitDone) return false;

  const ok = fitModelScale();
  if (!ok) return false;

  placeModel();
  modelFitDone = true;
  debugLog("P1:model:layers:fit", { ok: true });
  return true;
};

/**
 * Handle model-loaded event - reset and refit
 */
export const onModelLoaded = () => {
  resetModelState();
  scheduleModelTransform({ recomputeScale: true });
};
