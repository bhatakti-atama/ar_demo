/**
 * Model transformation logic - scaling, positioning, and rotation.
 * All units are in METERS since AR.js with size="X" works in meter units.
 * @file model-transform.js
 */

import { layersModelEl } from "./dom-elements.js";
import { CHART_HEIGHT_M, CHART_WIDTH_M } from "./marker-config.js";
import { modelPosition, modelRotation, modelSize, syncDisplaysFromState } from "./slider-bindings.js";

/** @typedef {(tag: string, ...parts: unknown[]) => void} DebugLogFn */

const IS_MOBILE_DEVICE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const MODEL_CENTER_OFFSET_M = { x: 0.0, y: -0.03, z: 0.15 };
const MODEL_DEVICE_CALIBRATION = IS_MOBILE_DEVICE
  ? { size: 1.5, pitch: -41, yaw: 2, roll: 2 }
  : { size: 1.0, pitch: 0, yaw: 0, roll: 0 };

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
 * Scale model to fit chart size (in meters)
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
      worldSize: { x: worldSize.x.toFixed(4), y: worldSize.y.toFixed(4), z: worldSize.z.toFixed(4) },
      worldMaxDim: worldMaxDim.toFixed(4),
      currentScale,
      modelBaseMaxDim: modelBaseMaxDim.toFixed(4),
    });
  }

  if (!modelBaseMaxDim || !Number.isFinite(modelBaseMaxDim) || modelBaseMaxDim <= 0) {
    return false;
  }

  const targetDiameterMeters = CHART_WIDTH_M * 0.7;
  
  if (!baseComputedSize) {
    baseComputedSize = targetDiameterMeters / modelBaseMaxDim;
    modelSize.value = baseComputedSize * MODEL_DEVICE_CALIBRATION.size;
  }

  const s = modelSize.value;
  layersModelEl.setAttribute("scale", `${s} ${s} ${s}`);
  
  debugLog("P1:model:scale", {
    targetDiameterMeters,
    baseComputedSize: baseComputedSize.toFixed(4),
    appliedScale: s.toFixed(4),
  });
  
  return true;
};

/**
 * Position and rotate model relative to chart center (in meters)
 */
const placeModel = () => {
  if (!layersModelEl) return;

  const x = MODEL_CENTER_OFFSET_M.x + modelPosition.x * 0.1;
  const y = MODEL_CENTER_OFFSET_M.y + modelPosition.y * 0.1;
  const z = MODEL_CENTER_OFFSET_M.z + modelPosition.z * 0.1;

  layersModelEl.setAttribute("position", `${x} ${y} ${z}`);
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
