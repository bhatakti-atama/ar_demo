/**
 * Touch gesture controls — three axis-locked virtual joysticks + pinch scale.
 * - Left third: YAW (horizontal ↔)
 * - Center third: PITCH (vertical ↕)
 * - Right third: ROLL (horizontal ↔)
 * UI mounts under #hud-root so WebXR dom-overlay shows it. Touches use document listeners (layer is pointer-events: none).
 * @file touch-gestures.js
 */

import { modelRotation, modelSize, syncSlidersFromState } from "./slider-bindings.js";
import { scheduleModelTransform } from "./model-transform.js";

/** @typedef {(tag: string, ...parts: unknown[]) => void} DebugLogFn */

/** @type {DebugLogFn} */
let debugLog = () => {};

let isEnabled = true;

const JOYSTICK_RADIUS = 48;
const JOYSTICK_KNOB_RADIUS = 20;
const JOYSTICK_DEAD_ZONE = 0.12;
const YAW_SENSITIVITY = 1.5;
const PITCH_SENSITIVITY = 1.2;
const ROLL_SENSITIVITY = 1.2;
const SCALE_SENSITIVITY = 0.01;
const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const SMOOTHING = 0.25;

/**
 * @param {"yaw" | "pitch" | "roll"} name
 * @param {"x" | "y"} axis
 */
const makeJoystick = (name, axis) => ({
  name,
  axis,
  active: false,
  touchId: null,
  originX: 0,
  originY: 0,
  currentX: 0,
  currentY: 0,
  element: null,
  knobElement: null,
});

const yawJoystick = makeJoystick("yaw", "x");
const pitchJoystick = makeJoystick("pitch", "y");
const rollJoystick = makeJoystick("roll", "x");

/** @type {readonly [typeof yawJoystick, typeof pitchJoystick, typeof rollJoystick]} */
const ZONE_JOYSTICKS = [yawJoystick, pitchJoystick, rollJoystick];

// Pinch state
let isPinching = false;
let pinchTouchIds = [];
let lastPinchDistance = 0;

/** When true, quick taps defer joystick start so app can treat them as AR placement. */
let arTapPlacementMode = false;

/** @type {((clientX: number, clientY: number) => void) | null} */
let onArQuickTap = null;

const pendingArTouches = new Map();

const AR_QUICK_TAP_MOVE_PX = 16;
const AR_QUICK_TAP_MAX_MS = 420;

let animationFrameId = null;
let targetYaw = 0;
let targetPitch = 0;
let targetRoll = 0;
let targetScale = 1;

/**
 * @param {number} clientX
 * @returns {0 | 1 | 2}
 */
const zoneIndexFromX = (clientX) => {
  const w = window.innerWidth;
  const t = w / 3;
  if (clientX < t) return 0;
  if (clientX < t * 2) return 1;
  return 2;
};

export const initTouchGestures = (logger) => {
  debugLog = logger;
};

export const setTouchGesturesEnabled = (enabled) => {
  isEnabled = enabled;
  debugLog("P1:joystick:enabled", { enabled });
};

export const setArTapPlacementMode = (on) => {
  arTapPlacementMode = on;
  if (!on) pendingArTouches.clear();
};

export const registerArQuickTapHandler = (fn) => {
  onArQuickTap = fn;
};

/** Dimmed zone labels in non-AR; stronger when .hud-root--ar-session is set from app. */
export const setJoystickArSession = (active) => {
  const hud = document.getElementById("hud-root");
  if (!hud) return;
  hud.classList.toggle("hud-root--ar-session", Boolean(active));
};

export const syncTouchTargetsFromModel = () => {
  targetYaw = modelRotation.yaw;
  targetPitch = modelRotation.pitch;
  targetRoll = modelRotation.roll;
  targetScale = modelSize.value;
};

const createJoystickElement = (kind) => {
  const container = document.createElement("div");
  container.className = `joystick joystick-${kind}`;
  container.innerHTML = `
    <div class="joystick-ring"></div>
    <div class="joystick-knob"></div>
  `;
  return container;
};

const getPinchDistance = (touches) => {
  const t1 = [...touches].find((t) => t.identifier === pinchTouchIds[0]);
  const t2 = [...touches].find((t) => t.identifier === pinchTouchIds[1]);
  if (!t1 || !t2) return lastPinchDistance;
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

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
 * @param {{ axis: "x" | "y" }} joystick
 */
const updateJoystickKnobAxis = (joystick, x, y) => {
  let dx = x - joystick.originX;
  let dy = y - joystick.originY;
  const maxDistance = JOYSTICK_RADIUS - JOYSTICK_KNOB_RADIUS;
  if (joystick.axis === "x") {
    dy = 0;
    dx = Math.max(-maxDistance, Math.min(maxDistance, dx));
  } else {
    dx = 0;
    dy = Math.max(-maxDistance, Math.min(maxDistance, dy));
  }
  joystick.currentX = joystick.originX + dx;
  joystick.currentY = joystick.originY + dy;
  joystick.knobElement.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
};

/**
 * @returns {number} -1..1
 */
const getJoystickAxisValue = (joystick) => {
  if (!joystick.active) return 0;
  const dx = joystick.currentX - joystick.originX;
  const dy = joystick.currentY - joystick.originY;
  const maxDistance = JOYSTICK_RADIUS - JOYSTICK_KNOB_RADIUS;
  const v = joystick.axis === "x" ? dx / maxDistance : dy / maxDistance;
  const magnitude = Math.abs(v);
  if (magnitude < JOYSTICK_DEAD_ZONE) return 0;
  const rescaled = (magnitude - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);
  const sign = v >= 0 ? 1 : -1;
  return Math.max(-1, Math.min(1, sign * rescaled));
};

const hideJoystick = (joystick) => {
  joystick.active = false;
  joystick.touchId = null;
  joystick.element.classList.remove("active");
};

const hideAllJoysticks = () => {
  for (const j of ZONE_JOYSTICKS) hideJoystick(j);
};

/**
 * @param {Touch} touch
 * @param {{ x0: number, y0: number }} pending
 */
const promotePendingToJoystick = (touch, pending) => {
  if (isPinching) return;
  const zi = zoneIndexFromX(pending.x0);
  const joystick = ZONE_JOYSTICKS[zi];
  if (joystick.active) return;
  joystick.active = true;
  joystick.touchId = touch.identifier;
  positionJoystick(joystick, pending.x0, pending.y0);
  document.getElementById(`zone-${joystick.name}`)?.classList.add("active");
  updateJoystickKnobAxis(joystick, touch.clientX, touch.clientY);
  debugLog("P1:joystick:start-promoted", { zone: joystick.name, x: touch.clientX, y: touch.clientY });
};

const lerp = (current, target, factor) => current + (target - current) * factor;

const updateLoop = () => {
  const yv = getJoystickAxisValue(yawJoystick);
  const pv = getJoystickAxisValue(pitchJoystick);
  const rv = getJoystickAxisValue(rollJoystick);

  const hasInput = yv !== 0 || pv !== 0 || rv !== 0 || isPinching;

  if (yv !== 0) {
    targetYaw += yv * YAW_SENSITIVITY;
    targetYaw = ((targetYaw % 360) + 360) % 360 - 180;
  }
  if (pv !== 0) {
    targetPitch -= pv * PITCH_SENSITIVITY;
    targetPitch = Math.max(-90, Math.min(90, targetPitch));
  }
  if (rv !== 0) {
    targetRoll += rv * ROLL_SENSITIVITY;
    targetRoll = Math.max(-180, Math.min(180, targetRoll));
  }

  const yawDiff = Math.abs(modelRotation.yaw - targetYaw);
  const pitchDiff = Math.abs(modelRotation.pitch - targetPitch);
  const rollDiff = Math.abs(modelRotation.roll - targetRoll);
  const scaleDiff = Math.abs(modelSize.value - targetScale);

  const needsUpdate =
    yawDiff > 0.05 || pitchDiff > 0.05 || rollDiff > 0.05 || scaleDiff > 0.001 || hasInput;

  if (needsUpdate) {
    modelRotation.yaw = lerp(modelRotation.yaw, targetYaw, SMOOTHING);
    modelRotation.pitch = lerp(modelRotation.pitch, targetPitch, SMOOTHING);
    modelRotation.roll = lerp(modelRotation.roll, targetRoll, SMOOTHING);
    modelSize.value = lerp(modelSize.value, targetScale, SMOOTHING);

    scheduleModelTransform({ recomputeScale: scaleDiff > 0.001 });
    animationFrameId = requestAnimationFrame(updateLoop);
  } else {
    modelRotation.yaw = targetYaw;
    modelRotation.pitch = targetPitch;
    modelRotation.roll = targetRoll;
    modelSize.value = targetScale;
    syncSlidersFromState();
    animationFrameId = null;
  }
};

const startUpdateLoop = () => {
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(updateLoop);
  }
};

const onTouchStart = (e) => {
  if (!isEnabled) return;

  const bottomZone = window.innerHeight * 0.85;

  if (e.touches.length === 2 && !isPinching) {
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    if (t0.clientY <= bottomZone && t1.clientY <= bottomZone) {
      for (const t of e.touches) pendingArTouches.delete(t.identifier);
      isPinching = true;
      pinchTouchIds = [t0.identifier, t1.identifier];
      lastPinchDistance = getPinchDistance(e.touches);
      targetScale = modelSize.value;
      hideAllJoysticks();
      document.getElementById("zone-yaw")?.classList.remove("active");
      document.getElementById("zone-pitch")?.classList.remove("active");
      document.getElementById("zone-roll")?.classList.remove("active");
      document.getElementById("scale-indicator")?.classList.add("active");
      debugLog("P1:joystick:pinch-start", { distance: lastPinchDistance });
      startUpdateLoop();
      return;
    }
  }

  if (isPinching) return;

  for (const touch of e.changedTouches) {
    if (touch.clientY > bottomZone) continue;

    const zi = zoneIndexFromX(touch.clientX);
    const joystick = ZONE_JOYSTICKS[zi];

    if (arTapPlacementMode) {
      pendingArTouches.set(touch.identifier, { x0: touch.clientX, y0: touch.clientY, t0: performance.now() });
      continue;
    }

    if (!joystick.active) {
      joystick.active = true;
      joystick.touchId = touch.identifier;
      positionJoystick(joystick, touch.clientX, touch.clientY);
      document.getElementById(`zone-${joystick.name}`)?.classList.add("active");
      debugLog("P1:joystick:start", { zone: joystick.name, x: touch.clientX, y: touch.clientY });
    }
  }

  startUpdateLoop();
};

const onTouchMove = (e) => {
  if (!isEnabled) return;

  if (isPinching && e.touches.length >= 2) {
    const currentDistance = getPinchDistance(e.touches);
    const delta = currentDistance - lastPinchDistance;

    targetScale += delta * SCALE_SENSITIVITY;
    targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));

    lastPinchDistance = currentDistance;

    const indicator = document.getElementById("scale-indicator");
    if (indicator) {
      indicator.textContent = `${targetScale.toFixed(1)}x`;
    }

    startUpdateLoop();
    return;
  }

  for (const touch of e.changedTouches) {
    const pending = pendingArTouches.get(touch.identifier);
    if (pending) {
      const dx = touch.clientX - pending.x0;
      const dy = touch.clientY - pending.y0;
      if (dx * dx + dy * dy > AR_QUICK_TAP_MOVE_PX * AR_QUICK_TAP_MOVE_PX) {
        pendingArTouches.delete(touch.identifier);
        promotePendingToJoystick(touch, pending);
      }
    }
  }

  for (const touch of e.changedTouches) {
    for (const j of ZONE_JOYSTICKS) {
      if (j.active && touch.identifier === j.touchId) {
        updateJoystickKnobAxis(j, touch.clientX, touch.clientY);
      }
    }
  }

  startUpdateLoop();
};

const onTouchEnd = (e) => {
  if (isPinching) {
    const remainingPinchTouches = [...e.touches].filter((t) => pinchTouchIds.includes(t.identifier));

    if (remainingPinchTouches.length < 2) {
      isPinching = false;
      pinchTouchIds = [];
      document.getElementById("scale-indicator")?.classList.remove("active");
      debugLog("P1:joystick:pinch-end", { scale: modelSize.value.toFixed(2) });
    }
  }

  for (const touch of e.changedTouches) {
    const pending = pendingArTouches.get(touch.identifier);
    if (pending) {
      pendingArTouches.delete(touch.identifier);
      const dt = performance.now() - pending.t0;
      if (dt <= AR_QUICK_TAP_MAX_MS && arTapPlacementMode && typeof onArQuickTap === "function") {
        onArQuickTap(pending.x0, pending.y0);
      }
      continue;
    }
    for (const j of ZONE_JOYSTICKS) {
      if (j.active && touch.identifier === j.touchId) {
        hideJoystick(j);
        document.getElementById(`zone-${j.name}`)?.classList.remove("active");
        debugLog("P1:joystick:end", {
          zone: j.name,
          yaw: modelRotation.yaw.toFixed(1),
          pitch: modelRotation.pitch.toFixed(1),
          roll: modelRotation.roll.toFixed(1),
        });
      }
    }
  }
};

const createUI = () => {
  const mount = document.getElementById("hud-root") || document.body;

  const layer = document.createElement("div");
  layer.className = "joystick-layer";
  layer.id = "joystick-layer";
  layer.setAttribute("aria-hidden", "true");

  layer.innerHTML = `
    <div class="joystick-zones" id="joystick-zones">
      <div class="joystick-zone joystick-zone-yaw" id="zone-yaw">
        <div class="zone-hint">
          <span class="zone-hint-label">YAW</span>
          <span class="zone-hint-sub">↔ drag sideways</span>
        </div>
      </div>
      <div class="joystick-zone joystick-zone-pitch" id="zone-pitch">
        <div class="zone-hint">
          <span class="zone-hint-label">PITCH</span>
          <span class="zone-hint-sub">↕ drag up / down</span>
        </div>
      </div>
      <div class="joystick-zone joystick-zone-roll" id="zone-roll">
        <div class="zone-hint">
          <span class="zone-hint-label">ROLL</span>
          <span class="zone-hint-sub">↔ drag sideways</span>
        </div>
      </div>
    </div>
  `;

  const scaleIndicator = document.createElement("div");
  scaleIndicator.className = "scale-indicator";
  scaleIndicator.id = "scale-indicator";
  scaleIndicator.textContent = "1.0x";

  yawJoystick.element = createJoystickElement("yaw");
  pitchJoystick.element = createJoystickElement("pitch");
  rollJoystick.element = createJoystickElement("roll");
  yawJoystick.knobElement = yawJoystick.element.querySelector(".joystick-knob");
  pitchJoystick.knobElement = pitchJoystick.element.querySelector(".joystick-knob");
  rollJoystick.knobElement = rollJoystick.element.querySelector(".joystick-knob");

  layer.appendChild(scaleIndicator);
  layer.appendChild(yawJoystick.element);
  layer.appendChild(pitchJoystick.element);
  layer.appendChild(rollJoystick.element);

  mount.appendChild(layer);
};

let documentTouchWired = false;

export const setupTouchGestures = () => {
  const viewport = document.getElementById("ar-viewport");
  if (!viewport) {
    debugLog("P1:joystick:setup:error", "ar-viewport not found");
    return;
  }

  if (!document.getElementById("joystick-layer")) {
    createUI();
  }

  if (!documentTouchWired) {
    documentTouchWired = true;
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
  }

  syncTouchTargetsFromModel();

  debugLog("P1:joystick:setup", "triple axis-locked joysticks (HUD mounted)");
};
