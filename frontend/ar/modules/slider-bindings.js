/**
 * Data-driven slider bindings to eliminate repetitive if-blocks.
 * @file slider-bindings.js
 */

import {
  biasOneXSlider, biasOneXValue, biasOneYSlider, biasOneYValue, biasOneZSlider, biasOneZValue,
  biasThreeXSlider, biasThreeXValue, biasThreeYSlider, biasThreeYValue, biasThreeZSlider, biasThreeZValue,
  biasTwoXSlider, biasTwoXValue, biasTwoYSlider, biasTwoYValue, biasTwoZSlider, biasTwoZValue,
  offsetXSlider, offsetXValue, offsetYSlider, offsetYValue, offsetZSlider, offsetZValue,
  pitchSlider, pitchValue, positionDeadbandSlider, positionDeadbandValue,
  rollSlider, rollValue, rotationDeadbandSlider, rotationDeadbandValue,
  sizeSlider, sizeValue, stabilizerLerpSlider, stabilizerLerpValue,
  yawSlider, yawValue,
} from "./dom-elements.js";
import { VISIBILITY_CONTEXT_BIAS } from "./marker-config.js";

/**
 * @typedef {Object} SliderBinding
 * @property {HTMLInputElement|null} slider
 * @property {HTMLElement|null} display
 * @property {() => number} get
 * @property {(v: number) => void} set
 * @property {(v: number) => string} format
 */

/** @type {{ stabilizerLerp: number, positionDeadband: number, rotationDeadbandDeg: number }} */
export const stabilizerState = {
  stabilizerLerp: 0.18,
  positionDeadband: 0.002,
  rotationDeadbandDeg: 0.8,
};

/** @type {{ x: number, y: number, z: number }} */
export const modelPosition = { x: 0, y: 0, z: 0 };

/** @type {{ pitch: number, yaw: number, roll: number }} */
export const modelRotation = { pitch: -78, yaw: 0, roll: 3 };

/** @type {{ value: number }} */
export const modelSize = { value: 0 };

const fmt2 = (v) => v.toFixed(2);
const fmt3 = (v) => v.toFixed(3);
const fmtDeg = (v) => `${Math.round(v)}deg`;
const fmtDeg2 = (v) => `${v.toFixed(2)}deg`;
const fmtSize = (v) => `${v.toFixed(2)}x`;

/** @type {SliderBinding[]} */
const BINDINGS = [
  // Stabilizer controls
  {
    slider: stabilizerLerpSlider,
    display: stabilizerLerpValue,
    get: () => stabilizerState.stabilizerLerp,
    set: (v) => { stabilizerState.stabilizerLerp = v; },
    format: fmt2,
  },
  {
    slider: positionDeadbandSlider,
    display: positionDeadbandValue,
    get: () => stabilizerState.positionDeadband,
    set: (v) => { stabilizerState.positionDeadband = v; },
    format: fmt3,
  },
  {
    slider: rotationDeadbandSlider,
    display: rotationDeadbandValue,
    get: () => stabilizerState.rotationDeadbandDeg,
    set: (v) => { stabilizerState.rotationDeadbandDeg = v; },
    format: fmtDeg2,
  },
  // Bias one (x, y, z)
  {
    slider: biasOneXSlider,
    display: biasOneXValue,
    get: () => VISIBILITY_CONTEXT_BIAS.one.x,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.one.x = v; },
    format: fmt2,
  },
  {
    slider: biasOneYSlider,
    display: biasOneYValue,
    get: () => VISIBILITY_CONTEXT_BIAS.one.y,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.one.y = v; },
    format: fmt2,
  },
  {
    slider: biasOneZSlider,
    display: biasOneZValue,
    get: () => VISIBILITY_CONTEXT_BIAS.one.z,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.one.z = v; },
    format: fmt2,
  },
  // Bias two (x, y, z)
  {
    slider: biasTwoXSlider,
    display: biasTwoXValue,
    get: () => VISIBILITY_CONTEXT_BIAS.two.x,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.two.x = v; },
    format: fmt2,
  },
  {
    slider: biasTwoYSlider,
    display: biasTwoYValue,
    get: () => VISIBILITY_CONTEXT_BIAS.two.y,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.two.y = v; },
    format: fmt2,
  },
  {
    slider: biasTwoZSlider,
    display: biasTwoZValue,
    get: () => VISIBILITY_CONTEXT_BIAS.two.z,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.two.z = v; },
    format: fmt2,
  },
  // Bias three (x, y, z)
  {
    slider: biasThreeXSlider,
    display: biasThreeXValue,
    get: () => VISIBILITY_CONTEXT_BIAS.three.x,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.three.x = v; },
    format: fmt2,
  },
  {
    slider: biasThreeYSlider,
    display: biasThreeYValue,
    get: () => VISIBILITY_CONTEXT_BIAS.three.y,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.three.y = v; },
    format: fmt2,
  },
  {
    slider: biasThreeZSlider,
    display: biasThreeZValue,
    get: () => VISIBILITY_CONTEXT_BIAS.three.z,
    set: (v) => { VISIBILITY_CONTEXT_BIAS.three.z = v; },
    format: fmt2,
  },
  // Model size
  {
    slider: sizeSlider,
    display: sizeValue,
    get: () => modelSize.value,
    set: (v) => { modelSize.value = v; },
    format: fmtSize,
  },
  // Model position offsets
  {
    slider: offsetXSlider,
    display: offsetXValue,
    get: () => modelPosition.x,
    set: (v) => { modelPosition.x = v; },
    format: fmt2,
  },
  {
    slider: offsetYSlider,
    display: offsetYValue,
    get: () => modelPosition.y,
    set: (v) => { modelPosition.y = v; },
    format: fmt2,
  },
  {
    slider: offsetZSlider,
    display: offsetZValue,
    get: () => modelPosition.z,
    set: (v) => { modelPosition.z = v; },
    format: fmt2,
  },
  // Model rotation
  {
    slider: pitchSlider,
    display: pitchValue,
    get: () => modelRotation.pitch,
    set: (v) => { modelRotation.pitch = v; },
    format: fmtDeg,
  },
  {
    slider: yawSlider,
    display: yawValue,
    get: () => modelRotation.yaw,
    set: (v) => { modelRotation.yaw = v; },
    format: fmtDeg,
  },
  {
    slider: rollSlider,
    display: rollValue,
    get: () => modelRotation.roll,
    set: (v) => { modelRotation.roll = v; },
    format: fmtDeg,
  },
];

/** Update all display elements from current state */
export const syncDisplaysFromState = () => {
  for (const binding of BINDINGS) {
    if (binding.display) {
      binding.display.textContent = binding.format(binding.get());
    }
  }
};

/** Update all sliders and displays from current state */
export const syncSlidersFromState = () => {
  for (const binding of BINDINGS) {
    const val = binding.get();
    if (binding.slider) {
      binding.slider.value = String(val);
    }
    if (binding.display) {
      binding.display.textContent = binding.format(val);
    }
  }
};

/**
 * Wire up all slider input handlers
 * @param {Object} callbacks
 * @param {() => void} [callbacks.onStabilizerChange] - Called when stabilizer params change
 * @param {(opts: { recomputeScale?: boolean }) => void} [callbacks.onModelTransformChange] - Called when model params change
 */
export const initSliderBindings = ({ onStabilizerChange, onModelTransformChange }) => {
  const stabilizerSliders = new Set([stabilizerLerpSlider, positionDeadbandSlider, rotationDeadbandSlider]);
  const biasSliders = new Set([
    biasOneXSlider, biasOneYSlider, biasOneZSlider,
    biasTwoXSlider, biasTwoYSlider, biasTwoZSlider,
    biasThreeXSlider, biasThreeYSlider, biasThreeZSlider,
  ]);

  for (const binding of BINDINGS) {
    if (!binding.slider) continue;

    binding.slider.addEventListener("input", () => {
      const value = Number(binding.slider.value);
      binding.set(value);
      if (binding.display) {
        binding.display.textContent = binding.format(value);
      }

      if (stabilizerSliders.has(binding.slider)) {
        onStabilizerChange?.();
      } else if (biasSliders.has(binding.slider)) {
        syncDisplaysFromState();
      } else if (binding.slider === sizeSlider) {
        onModelTransformChange?.({ recomputeScale: true });
      } else {
        onModelTransformChange?.({});
      }
    });
  }
};
