/**
 * Touch gesture controls with dual dynamic virtual joysticks.
 * - Left side: Yaw rotation (horizontal spin)
 * - Right side: Pitch & Roll rotation (tilt & bank)
 * - Two finger pinch: Scale
 * @file touch-gestures.js
 */

import { modelRotation, modelSize, syncSlidersFromState } from "./slider-bindings.js";
import { scheduleModelTransform } from "./model-transform.js";

/** @typedef {(tag: string, ...parts: unknown[]) => void} DebugLogFn */

/** @type {DebugLogFn} */
let debugLog = () => {};

let isEnabled = true;

// Joystick configuration
const JOYSTICK_RADIUS = 50; // Outer ring radius
const JOYSTICK_KNOB_RADIUS = 22; // Inner knob radius
const JOYSTICK_DEAD_ZONE = 0.12; // Ignore input below this threshold (0-1)
const YAW_SENSITIVITY = 1.5; // Yaw rotation speed (degrees per frame)
const PITCH_SENSITIVITY = 1.2; // Pitch rotation speed
const ROLL_SENSITIVITY = 1.2; // Roll rotation speed
const SCALE_SENSITIVITY = 0.01;
const MIN_SCALE = 0.5;
const MAX_SCALE = 15;
const SMOOTHING = 0.25;

// Joystick state
const leftJoystick = {
  active: false,
  touchId: null,
  originX: 0,
  originY: 0,
  currentX: 0,
  currentY: 0,
  element: null,
  knobElement: null,
};

const rightJoystick = {
  active: false,
  touchId: null,
  originX: 0,
  originY: 0,
  currentX: 0,
  currentY: 0,
  element: null,
  knobElement: null,
};

// Pinch state
let isPinching = false;
let pinchTouchIds = [];
let lastPinchDistance = 0;

// Animation
let animationFrameId = null;
let targetYaw = 0;
let targetPitch = 0;
let targetRoll = 0;
let targetScale = 4;

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
  debugLog("P1:joystick:enabled", { enabled });
};

/**
 * Sync touch gesture targets from model state
 */
export const syncTouchTargetsFromModel = () => {
  targetYaw = modelRotation.yaw;
  targetPitch = modelRotation.pitch;
  targetRoll = modelRotation.roll;
  targetScale = modelSize.value;
};

/**
 * Create joystick DOM elements
 */
const createJoystickElement = (side) => {
  const container = document.createElement("div");
  container.className = `joystick joystick-${side}`;
  container.innerHTML = `
    <div class="joystick-ring"></div>
    <div class="joystick-knob"></div>
  `;
  return container;
};

/**
 * Inject joystick styles
 */
const injectStyles = () => {
  const style = document.createElement("style");
  style.id = "joystick-styles";
  style.textContent = `
    .joystick {
      position: fixed;
      width: ${JOYSTICK_RADIUS * 2}px;
      height: ${JOYSTICK_RADIUS * 2}px;
      pointer-events: none;
      z-index: 2000;
      opacity: 0;
      transition: opacity 0.15s ease;
      transform: translate(-50%, -50%);
    }
    .joystick.active {
      opacity: 1;
    }
    .joystick-ring {
      position: absolute;
      inset: 0;
      border: 2px solid rgba(255, 185, 0, 0.5);
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.3);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(0, 0, 0, 0.3);
    }
    .joystick-left .joystick-ring {
      border-color: rgba(0, 255, 136, 0.5);
    }
    .joystick-knob {
      position: absolute;
      width: ${JOYSTICK_KNOB_RADIUS * 2}px;
      height: ${JOYSTICK_KNOB_RADIUS * 2}px;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, rgba(255, 185, 0, 0.9), rgba(255, 140, 0, 0.7));
      border: 2px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 15px rgba(255, 185, 0, 0.3);
      transition: transform 0.05s ease-out;
    }
    .joystick-left .joystick-knob {
      background: radial-gradient(circle at 30% 30%, rgba(0, 255, 136, 0.9), rgba(0, 200, 100, 0.7));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 255, 136, 0.3);
    }
    
    /* Touch zone indicators */
    .joystick-zones {
      position: fixed;
      inset: 0;
      z-index: 1999;
      pointer-events: none;
      display: flex;
    }
    .joystick-zone {
      flex: 1;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 140px;
      opacity: 0.4;
      transition: opacity 0.2s;
    }
    .joystick-zone.active {
      opacity: 0;
    }
    .zone-hint {
      font-family: "Roboto Mono", monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 6px 12px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .joystick-zone-left .zone-hint {
      color: rgba(0, 255, 136, 0.7);
      border-color: rgba(0, 255, 136, 0.3);
    }
    .joystick-zone-right .zone-hint {
      color: rgba(255, 185, 0, 0.7);
      border-color: rgba(255, 185, 0, 0.3);
    }
    .zone-hint-label {
      display: block;
      font-size: 11px;
      margin-bottom: 2px;
    }
    .zone-hint-sub {
      display: block;
      font-size: 8px;
      opacity: 0.7;
    }
    
    /* Scale indicator */
    .scale-indicator {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: "Roboto Mono", monospace;
      font-size: 14px;
      font-weight: 600;
      color: #ffb900;
      background: rgba(0, 0, 0, 0.6);
      padding: 8px 16px;
      border-radius: 4px;
      border: 1px solid rgba(255, 185, 0, 0.4);
      z-index: 2001;
      opacity: 0;
      transition: opacity 0.15s;
      pointer-events: none;
    }
    .scale-indicator.active {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
};

/**
 * Create the zone hints and scale indicator
 */
const createUI = () => {
  // Zone hints
  const zones = document.createElement("div");
  zones.className = "joystick-zones";
  zones.id = "joystick-zones";
  zones.innerHTML = `
    <div class="joystick-zone joystick-zone-left" id="zone-left">
      <div class="zone-hint">
        <span class="zone-hint-label">↺ YAW ↻</span>
        <span class="zone-hint-sub">Spin left/right</span>
      </div>
    </div>
    <div class="joystick-zone joystick-zone-right" id="zone-right">
      <div class="zone-hint">
        <span class="zone-hint-label">PITCH + ROLL</span>
        <span class="zone-hint-sub">↕ Tilt ↔ Bank</span>
      </div>
    </div>
  `;
  document.body.appendChild(zones);
  
  // Scale indicator
  const scaleIndicator = document.createElement("div");
  scaleIndicator.className = "scale-indicator";
  scaleIndicator.id = "scale-indicator";
  scaleIndicator.textContent = "1.0x";
  document.body.appendChild(scaleIndicator);
  
  // Joystick elements
  leftJoystick.element = createJoystickElement("left");
  rightJoystick.element = createJoystickElement("right");
  leftJoystick.knobElement = leftJoystick.element.querySelector(".joystick-knob");
  rightJoystick.knobElement = rightJoystick.element.querySelector(".joystick-knob");
  document.body.appendChild(leftJoystick.element);
  document.body.appendChild(rightJoystick.element);
};

/**
 * Get pinch distance between two touches
 */
const getPinchDistance = (touches) => {
  const t1 = [...touches].find(t => t.identifier === pinchTouchIds[0]);
  const t2 = [...touches].find(t => t.identifier === pinchTouchIds[1]);
  if (!t1 || !t2) return lastPinchDistance;
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Position joystick at touch origin
 */
const positionJoystick = (joystick, x, y) => {
  joystick.originX = x;
  joystick.originY = y;
  joystick.currentX = x;
  joystick.currentY = y;
  joystick.element.style.left = `${x}px`;
  joystick.element.style.top = `${y}px`;
  joystick.element.classList.add("active");
  joystick.knobElement.style.transform = "translate(-50%, -50%)";
};

/**
 * Update joystick knob position
 */
const updateJoystickKnob = (joystick, x, y) => {
  const dx = x - joystick.originX;
  const dy = y - joystick.originY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const maxDistance = JOYSTICK_RADIUS - JOYSTICK_KNOB_RADIUS;
  
  let clampedX = dx;
  let clampedY = dy;
  
  if (distance > maxDistance) {
    const scale = maxDistance / distance;
    clampedX = dx * scale;
    clampedY = dy * scale;
  }
  
  joystick.currentX = joystick.originX + clampedX;
  joystick.currentY = joystick.originY + clampedY;
  
  joystick.knobElement.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
};

/**
 * Get normalized joystick values (-1 to 1)
 */
const getJoystickValues = (joystick) => {
  if (!joystick.active) return { x: 0, y: 0 };
  
  const dx = joystick.currentX - joystick.originX;
  const dy = joystick.currentY - joystick.originY;
  const maxDistance = JOYSTICK_RADIUS - JOYSTICK_KNOB_RADIUS;
  
  let x = dx / maxDistance;
  let y = dy / maxDistance;
  
  // Apply dead zone
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude < JOYSTICK_DEAD_ZONE) {
    return { x: 0, y: 0 };
  }
  
  // Rescale to 0-1 range after dead zone
  const rescaled = (magnitude - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);
  const scale = rescaled / magnitude;
  
  return { 
    x: Math.max(-1, Math.min(1, x * scale)), 
    y: Math.max(-1, Math.min(1, y * scale)) 
  };
};

/**
 * Hide joystick
 */
const hideJoystick = (joystick) => {
  joystick.active = false;
  joystick.touchId = null;
  joystick.element.classList.remove("active");
};

/**
 * Lerp helper
 */
const lerp = (current, target, factor) => current + (target - current) * factor;

/**
 * Animation loop - applies joystick input to model rotation
 */
const updateLoop = () => {
  const leftValues = getJoystickValues(leftJoystick);
  const rightValues = getJoystickValues(rightJoystick);
  
  const hasInput = leftValues.x !== 0 || leftValues.y !== 0 || 
                   rightValues.x !== 0 || rightValues.y !== 0 ||
                   isPinching;
  
  // Left joystick: Yaw only (X axis controls horizontal spin)
  if (leftValues.x !== 0) {
    targetYaw += leftValues.x * YAW_SENSITIVITY;
    // Normalize yaw to -180 to 180
    targetYaw = ((targetYaw % 360) + 360) % 360 - 180;
  }
  
  // Right joystick: Pitch (Y axis) and Roll (X axis)
  if (rightValues.x !== 0 || rightValues.y !== 0) {
    // Y axis (up/down) controls pitch (tilt forward/back)
    targetPitch -= rightValues.y * PITCH_SENSITIVITY; // Inverted for intuitive control
    // X axis (left/right) controls roll (bank left/right)
    targetRoll += rightValues.x * ROLL_SENSITIVITY;
    
    // Clamp pitch and roll
    targetPitch = Math.max(-90, Math.min(90, targetPitch));
    targetRoll = Math.max(-180, Math.min(180, targetRoll));
  }
  
  // Smooth interpolation to targets
  const yawDiff = Math.abs(modelRotation.yaw - targetYaw);
  const pitchDiff = Math.abs(modelRotation.pitch - targetPitch);
  const rollDiff = Math.abs(modelRotation.roll - targetRoll);
  const scaleDiff = Math.abs(modelSize.value - targetScale);
  
  const needsUpdate = yawDiff > 0.05 || pitchDiff > 0.05 || rollDiff > 0.05 ||
                      scaleDiff > 0.001 || hasInput;
  
  if (needsUpdate) {
    modelRotation.yaw = lerp(modelRotation.yaw, targetYaw, SMOOTHING);
    modelRotation.pitch = lerp(modelRotation.pitch, targetPitch, SMOOTHING);
    modelRotation.roll = lerp(modelRotation.roll, targetRoll, SMOOTHING);
    modelSize.value = lerp(modelSize.value, targetScale, SMOOTHING);
    
    scheduleModelTransform({ recomputeScale: scaleDiff > 0.001 });
    animationFrameId = requestAnimationFrame(updateLoop);
  } else {
    // Snap to final values
    modelRotation.yaw = targetYaw;
    modelRotation.pitch = targetPitch;
    modelRotation.roll = targetRoll;
    modelSize.value = targetScale;
    syncSlidersFromState();
    animationFrameId = null;
  }
};

/**
 * Start the update loop if not running
 */
const startUpdateLoop = () => {
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(updateLoop);
  }
};

/**
 * Handle touch start
 */
const onTouchStart = (e) => {
  if (!isEnabled) return;
  
  const screenMidX = window.innerWidth / 2;
  const bottomZone = window.innerHeight * 0.85; // Ignore touches in bottom 15% (control bar)
  
  for (const touch of e.changedTouches) {
    // Skip if in bottom zone
    if (touch.clientY > bottomZone) continue;
    
    const isLeftSide = touch.clientX < screenMidX;
    
    // Check for pinch (two touches close in time)
    if (e.touches.length === 2 && !isPinching) {
      // Start pinch
      isPinching = true;
      pinchTouchIds = [e.touches[0].identifier, e.touches[1].identifier];
      lastPinchDistance = getPinchDistance(e.touches);
      targetScale = modelSize.value;
      
      // Hide joysticks during pinch
      hideJoystick(leftJoystick);
      hideJoystick(rightJoystick);
      
      document.getElementById("scale-indicator")?.classList.add("active");
      debugLog("P1:joystick:pinch-start", { distance: lastPinchDistance });
      startUpdateLoop();
      return;
    }
    
    // Skip if already pinching
    if (isPinching) continue;
    
    // Assign to joystick
    if (isLeftSide && !leftJoystick.active) {
      leftJoystick.active = true;
      leftJoystick.touchId = touch.identifier;
      positionJoystick(leftJoystick, touch.clientX, touch.clientY);
      document.getElementById("zone-left")?.classList.add("active");
      debugLog("P1:joystick:left-start", { x: touch.clientX, y: touch.clientY });
    } else if (!isLeftSide && !rightJoystick.active) {
      rightJoystick.active = true;
      rightJoystick.touchId = touch.identifier;
      positionJoystick(rightJoystick, touch.clientX, touch.clientY);
      document.getElementById("zone-right")?.classList.add("active");
      debugLog("P1:joystick:right-start", { x: touch.clientX, y: touch.clientY });
    }
  }
  
  startUpdateLoop();
};

/**
 * Handle touch move
 */
const onTouchMove = (e) => {
  if (!isEnabled) return;
  
  // Handle pinch
  if (isPinching && e.touches.length >= 2) {
    const currentDistance = getPinchDistance(e.touches);
    const delta = currentDistance - lastPinchDistance;
    
    targetScale += delta * SCALE_SENSITIVITY;
    targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
    
    lastPinchDistance = currentDistance;
    
    // Update scale indicator
    const indicator = document.getElementById("scale-indicator");
    if (indicator) {
      indicator.textContent = `${targetScale.toFixed(1)}x`;
    }
    
    startUpdateLoop();
    return;
  }
  
  // Handle joysticks
  for (const touch of e.changedTouches) {
    if (leftJoystick.active && touch.identifier === leftJoystick.touchId) {
      updateJoystickKnob(leftJoystick, touch.clientX, touch.clientY);
    }
    if (rightJoystick.active && touch.identifier === rightJoystick.touchId) {
      updateJoystickKnob(rightJoystick, touch.clientX, touch.clientY);
    }
  }
  
  startUpdateLoop();
};

/**
 * Handle touch end
 */
const onTouchEnd = (e) => {
  // Handle pinch end
  if (isPinching) {
    const remainingPinchTouches = [...e.touches].filter(t => 
      pinchTouchIds.includes(t.identifier)
    );
    
    if (remainingPinchTouches.length < 2) {
      isPinching = false;
      pinchTouchIds = [];
      document.getElementById("scale-indicator")?.classList.remove("active");
      debugLog("P1:joystick:pinch-end", { scale: modelSize.value.toFixed(2) });
    }
  }
  
  // Handle joystick end
  for (const touch of e.changedTouches) {
    if (leftJoystick.active && touch.identifier === leftJoystick.touchId) {
      hideJoystick(leftJoystick);
      document.getElementById("zone-left")?.classList.remove("active");
      debugLog("P1:joystick:left-end", { 
        yaw: modelRotation.yaw.toFixed(1)
      });
    }
    if (rightJoystick.active && touch.identifier === rightJoystick.touchId) {
      hideJoystick(rightJoystick);
      document.getElementById("zone-right")?.classList.remove("active");
      debugLog("P1:joystick:right-end", { 
        pitch: modelRotation.pitch.toFixed(1),
        roll: modelRotation.roll.toFixed(1)
      });
    }
  }
};

/**
 * Setup touch event listeners
 */
export const setupTouchGestures = () => {
  const viewport = document.getElementById("ar-viewport");
  if (!viewport) {
    debugLog("P1:joystick:setup:error", "ar-viewport not found");
    return;
  }
  
  // Inject styles and create UI
  injectStyles();
  createUI();
  
  // Touch events on the whole document for dynamic joysticks
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("touchcancel", onTouchEnd, { passive: true });
  
  // Initialize targets from current state
  syncTouchTargetsFromModel();
  
  debugLog("P1:joystick:setup", "Dual dynamic joystick controls initialized");
};
