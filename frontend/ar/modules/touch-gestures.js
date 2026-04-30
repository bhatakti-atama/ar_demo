/**
 * Touch gesture controls for AR model manipulation.
 * - Rotation cube widget: Rotate model (yaw/pitch)
 * - Two finger pinch on viewport: Scale model
 * @file touch-gestures.js
 */

import { modelRotation, modelSize, syncSlidersFromState } from "./slider-bindings.js";
import { scheduleModelTransform } from "./model-transform.js";

/** @typedef {(tag: string, ...parts: unknown[]) => void} DebugLogFn */

/** @type {DebugLogFn} */
let debugLog = () => {};

let isEnabled = true;
let isCubeDragging = false;
let isPinching = false;
let lastTouchX = 0;
let lastTouchY = 0;
let lastPinchDistance = 0;

const ROTATION_SENSITIVITY = 0.4;
const SCALE_SENSITIVITY = 0.006;
const MIN_SCALE = 0.5;
const MAX_SCALE = 15;
const SMOOTHING_FACTOR = 0.1;

let targetYaw = 0;
let targetPitch = 0;
let targetScale = 4;
let animationFrameId = null;
let rotationCube = null;

/**
 * Initialize touch gestures with debug logger
 * @param {DebugLogFn} logger
 */
export const initTouchGestures = (logger) => {
  debugLog = logger;
};

/**
 * Enable/disable touch gestures
 * @param {boolean} enabled
 */
export const setTouchGesturesEnabled = (enabled) => {
  isEnabled = enabled;
  debugLog("P1:touch:enabled", { enabled });
};

/**
 * Sync touch gesture targets from model state (call after external reset)
 */
export const syncTouchTargetsFromModel = () => {
  targetYaw = modelRotation.yaw;
  targetPitch = modelRotation.pitch;
  targetScale = modelSize.value;
  if (rotationCube) {
    const inner = rotationCube.querySelector('.rotation-cube-inner');
    if (inner) {
      inner.style.transform = `rotateX(${-targetPitch}deg) rotateY(${targetYaw}deg)`;
    }
  }
};

/**
 * Get distance between two touch points
 * @param {Touch} t1
 * @param {Touch} t2
 */
const getPinchDistance = (t1, t2) => {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Handle touch start on viewport (pinch only)
 * @param {TouchEvent} e
 */
const onViewportTouchStart = (e) => {
  if (!isEnabled) return;
  
  // Sync target values with current state
  targetScale = modelSize.value;
  
  if (e.touches.length === 2) {
    isPinching = true;
    lastPinchDistance = getPinchDistance(e.touches[0], e.touches[1]);
  }
};

/**
 * Handle touch start on rotation cube
 * @param {TouchEvent} e
 */
const onCubeTouchStart = (e) => {
  if (!isEnabled) return;
  e.stopPropagation();
  
  // Sync target values with current state
  targetYaw = modelRotation.yaw;
  targetPitch = modelRotation.pitch;
  
  if (e.touches.length === 1) {
    isCubeDragging = true;
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
  }
};

/**
 * Lerp helper
 */
const lerp = (current, target, factor) => current + (target - current) * factor;

/**
 * Smooth animation loop
 */
const smoothUpdate = () => {
  const yawDiff = Math.abs(modelRotation.yaw - targetYaw);
  const pitchDiff = Math.abs(modelRotation.pitch - targetPitch);
  const scaleDiff = Math.abs(modelSize.value - targetScale);
  
  if (yawDiff > 0.01 || pitchDiff > 0.01 || scaleDiff > 0.001) {
    modelRotation.yaw = lerp(modelRotation.yaw, targetYaw, SMOOTHING_FACTOR);
    modelRotation.pitch = lerp(modelRotation.pitch, targetPitch, SMOOTHING_FACTOR);
    modelSize.value = lerp(modelSize.value, targetScale, SMOOTHING_FACTOR);
    
    scheduleModelTransform({ recomputeScale: scaleDiff > 0.001 });
    animationFrameId = requestAnimationFrame(smoothUpdate);
  } else {
    modelRotation.yaw = targetYaw;
    modelRotation.pitch = targetPitch;
    modelSize.value = targetScale;
    syncSlidersFromState();
    animationFrameId = null;
  }
};

/**
 * Start smooth animation if not running
 */
const startSmoothUpdate = () => {
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(smoothUpdate);
  }
};

/**
 * Handle touch move on viewport (pinch only)
 * @param {TouchEvent} e
 */
const onViewportTouchMove = (e) => {
  if (!isEnabled) return;
  
  if (isPinching && e.touches.length === 2) {
    const currentDistance = getPinchDistance(e.touches[0], e.touches[1]);
    const delta = currentDistance - lastPinchDistance;
    
    targetScale += delta * SCALE_SENSITIVITY;
    targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
    
    lastPinchDistance = currentDistance;
    
    startSmoothUpdate();
  }
};

/**
 * Handle touch move on rotation cube
 * @param {TouchEvent} e
 */
const onCubeTouchMove = (e) => {
  if (!isEnabled || !isCubeDragging) return;
  e.stopPropagation();
  
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    const deltaX = touch.clientX - lastTouchX;
    const deltaY = touch.clientY - lastTouchY;
    
    targetYaw += deltaX * ROTATION_SENSITIVITY;
    targetPitch -= deltaY * ROTATION_SENSITIVITY;
    
    targetYaw = ((targetYaw % 360) + 360) % 360 - 180;
    targetPitch = Math.max(-90, Math.min(90, targetPitch));
    
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    
    updateCubeVisual();
    startSmoothUpdate();
  }
};

/**
 * Update the cube visual rotation to match model
 */
const updateCubeVisual = () => {
  if (!rotationCube) return;
  const inner = rotationCube.querySelector('.rotation-cube-inner');
  if (inner) {
    inner.style.transform = `rotateX(${-targetPitch}deg) rotateY(${targetYaw}deg)`;
  }
};

/**
 * Handle touch end on viewport
 * @param {TouchEvent} e
 */
const onViewportTouchEnd = (e) => {
  if (e.touches.length < 2) {
    if (isPinching) {
      debugLog("P1:touch:gesture-end", {
        type: "pinch",
        scale: modelSize.value.toFixed(2),
      });
    }
    isPinching = false;
  }
};

/**
 * Handle touch end on cube
 * @param {TouchEvent} e
 */
const onCubeTouchEnd = (e) => {
  if (e.touches.length === 0) {
    if (isCubeDragging) {
      debugLog("P1:touch:gesture-end", {
        type: "rotate",
        rotation: `(${modelRotation.pitch.toFixed(1)}, ${modelRotation.yaw.toFixed(1)}, ${modelRotation.roll.toFixed(1)})`,
      });
    }
    isCubeDragging = false;
  }
};

/**
 * Create the 3D rotation cube widget
 */
const createRotationCube = () => {
  const cube = document.createElement("div");
  cube.id = "rotation-cube";
  cube.className = "rotation-cube";
  cube.innerHTML = `
    <div class="rotation-cube-inner">
      <div class="cube-face cube-front">F</div>
      <div class="cube-face cube-back">B</div>
      <div class="cube-face cube-right">R</div>
      <div class="cube-face cube-left">L</div>
      <div class="cube-face cube-top">T</div>
      <div class="cube-face cube-bottom">B</div>
    </div>
  `;
  
  const style = document.createElement("style");
  style.textContent = `
    .rotation-cube {
      position: fixed;
      bottom: 120px;
      right: 20px;
      width: 80px;
      height: 80px;
      perspective: 200px;
      z-index: 2000;
      touch-action: none;
      user-select: none;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.3);
      padding: 10px;
      box-sizing: content-box;
    }
    .rotation-cube-inner {
      width: 100%;
      height: 100%;
      position: relative;
      transform-style: preserve-3d;
      transition: transform 0.05s ease-out;
    }
    .cube-face {
      position: absolute;
      width: 80px;
      height: 80px;
      border: 2px solid rgba(255, 185, 0, 0.6);
      background: rgba(15, 15, 20, 0.7);
      color: #ffb900;
      font-family: "Roboto Mono", monospace;
      font-size: 16px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      backface-visibility: visible;
      box-sizing: border-box;
    }
    .cube-front  { transform: translateZ(40px); }
    .cube-back   { transform: rotateY(180deg) translateZ(40px); }
    .cube-right  { transform: rotateY(90deg) translateZ(40px); }
    .cube-left   { transform: rotateY(-90deg) translateZ(40px); }
    .cube-top    { transform: rotateX(90deg) translateZ(40px); }
    .cube-bottom { transform: rotateX(-90deg) translateZ(40px); }
    .rotation-cube:active .cube-face {
      border-color: rgba(0, 255, 136, 0.8);
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(cube);
  
  return cube;
};

/**
 * Setup touch event listeners on the AR viewport
 */
export const setupTouchGestures = () => {
  const viewport = document.getElementById("ar-viewport");
  if (!viewport) {
    debugLog("P1:touch:setup:error", "ar-viewport not found");
    return;
  }
  
  // Create rotation cube widget
  rotationCube = createRotationCube();
  
  // Viewport: pinch to scale only
  viewport.addEventListener("touchstart", onViewportTouchStart, { passive: true });
  viewport.addEventListener("touchmove", onViewportTouchMove, { passive: true });
  viewport.addEventListener("touchend", onViewportTouchEnd, { passive: true });
  viewport.addEventListener("touchcancel", onViewportTouchEnd, { passive: true });
  
  // Rotation cube: drag to rotate
  rotationCube.addEventListener("touchstart", onCubeTouchStart, { passive: false });
  rotationCube.addEventListener("touchmove", onCubeTouchMove, { passive: false });
  rotationCube.addEventListener("touchend", onCubeTouchEnd, { passive: true });
  rotationCube.addEventListener("touchcancel", onCubeTouchEnd, { passive: true });
  
  // Initialize cube visual
  targetYaw = modelRotation.yaw;
  targetPitch = modelRotation.pitch;
  updateCubeVisual();
  
  debugLog("P1:touch:setup", "Touch gestures with rotation cube initialized");
};
