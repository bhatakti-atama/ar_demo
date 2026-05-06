/**
 * One-Euro Filter implementation for smooth AR tracking.
 * 
 * The One-Euro Filter is an adaptive low-pass filter that provides:
 * - Low jitter at low speeds (heavy smoothing when stable)
 * - Low lag at high speeds (light smoothing when moving fast)
 * 
 * Based on: "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input"
 * by Géry Casiez, Nicolas Roussel, and Daniel Vogel (CHI 2012)
 * 
 * @file one-euro-filter.js
 */

/**
 * Low-pass filter with exponential smoothing
 */
class LowPassFilter {
  constructor(alpha = 1.0) {
    this.alpha = alpha;
    this.initialized = false;
    this.raw = 0;
    this.filtered = 0;
  }

  /**
   * @param {number} value - Raw input value
   * @param {number} [alpha] - Optional override for smoothing factor
   * @returns {number} Filtered value
   */
  filter(value, alpha) {
    if (alpha !== undefined) {
      this.alpha = alpha;
    }
    
    if (!this.initialized) {
      this.initialized = true;
      this.raw = value;
      this.filtered = value;
      return value;
    }
    
    this.raw = value;
    this.filtered = this.alpha * value + (1 - this.alpha) * this.filtered;
    return this.filtered;
  }

  /**
   * @returns {number} Last filtered value
   */
  lastValue() {
    return this.filtered;
  }

  reset() {
    this.initialized = false;
    this.raw = 0;
    this.filtered = 0;
  }
}

/**
 * Compute alpha for low-pass filter based on cutoff frequency
 * @param {number} rate - Sampling rate (Hz)
 * @param {number} cutoff - Cutoff frequency (Hz)
 * @returns {number} Alpha value for exponential smoothing
 */
function computeAlpha(rate, cutoff) {
  const tau = 1.0 / (2.0 * Math.PI * cutoff);
  const te = 1.0 / rate;
  return 1.0 / (1.0 + tau / te);
}

/**
 * One-Euro Filter for scalar values
 */
export class OneEuroFilter {
  /**
   * @param {number} frequency - Sampling frequency in Hz (e.g., 60 for 60fps)
   * @param {number} minCutoff - Minimum cutoff frequency (lower = more smoothing)
   * @param {number} beta - Speed coefficient (higher = less lag when moving)
   * @param {number} dCutoff - Derivative cutoff frequency
   */
  constructor(frequency = 60, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.frequency = frequency;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter(computeAlpha(frequency, dCutoff));
    this.lastTime = null;
  }

  /**
   * @param {number} x - Raw input value
   * @param {number} [timestamp] - Optional timestamp in seconds (uses internal clock if omitted)
   * @returns {number} Filtered value
   */
  filter(x, timestamp) {
    // Compute dt
    let dt;
    if (timestamp !== undefined && this.lastTime !== null) {
      dt = timestamp - this.lastTime;
      if (dt <= 0) dt = 1.0 / this.frequency;
    } else {
      dt = 1.0 / this.frequency;
    }
    this.lastTime = timestamp ?? (this.lastTime ?? 0) + dt;
    
    const rate = 1.0 / dt;
    
    // Estimate derivative
    const dx = this.xFilter.initialized 
      ? (x - this.xFilter.lastValue()) * rate 
      : 0;
    
    // Filter derivative
    const edx = this.dxFilter.filter(dx, computeAlpha(rate, this.dCutoff));
    
    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    
    // Filter position
    return this.xFilter.filter(x, computeAlpha(rate, cutoff));
  }

  /**
   * Reset filter state
   */
  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }

  /**
   * Update filter parameters
   * @param {Object} params
   * @param {number} [params.minCutoff]
   * @param {number} [params.beta]
   * @param {number} [params.dCutoff]
   */
  setParams({ minCutoff, beta, dCutoff }) {
    if (minCutoff !== undefined) this.minCutoff = minCutoff;
    if (beta !== undefined) this.beta = beta;
    if (dCutoff !== undefined) this.dCutoff = dCutoff;
  }
}

/**
 * One-Euro Filter for 3D vectors (THREE.Vector3)
 */
export class OneEuroFilterVector3 {
  /**
   * @param {number} frequency - Sampling frequency in Hz
   * @param {number} minCutoff - Minimum cutoff frequency
   * @param {number} beta - Speed coefficient
   * @param {number} dCutoff - Derivative cutoff frequency
   */
  constructor(frequency = 60, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.xFilter = new OneEuroFilter(frequency, minCutoff, beta, dCutoff);
    this.yFilter = new OneEuroFilter(frequency, minCutoff, beta, dCutoff);
    this.zFilter = new OneEuroFilter(frequency, minCutoff, beta, dCutoff);
  }

  /**
   * @param {THREE.Vector3} vec - Input vector
   * @param {THREE.Vector3} out - Output vector (modified in place)
   * @param {number} [timestamp] - Optional timestamp in seconds
   * @returns {THREE.Vector3} Filtered vector (same as out)
   */
  filter(vec, out, timestamp) {
    out.x = this.xFilter.filter(vec.x, timestamp);
    out.y = this.yFilter.filter(vec.y, timestamp);
    out.z = this.zFilter.filter(vec.z, timestamp);
    return out;
  }

  reset() {
    this.xFilter.reset();
    this.yFilter.reset();
    this.zFilter.reset();
  }

  setParams(params) {
    this.xFilter.setParams(params);
    this.yFilter.setParams(params);
    this.zFilter.setParams(params);
  }
}

/**
 * One-Euro Filter for Quaternions (THREE.Quaternion)
 * Uses the axis-angle representation for filtering
 */
export class OneEuroFilterQuaternion {
  /**
   * @param {typeof THREE} THREERef - THREE.js reference
   * @param {number} frequency - Sampling frequency in Hz
   * @param {number} minCutoff - Minimum cutoff frequency
   * @param {number} beta - Speed coefficient
   * @param {number} dCutoff - Derivative cutoff frequency
   */
  constructor(THREERef, frequency = 60, minCutoff = 1.5, beta = 0.5, dCutoff = 1.0) {
    this.THREE = THREERef;
    this.xFilter = new OneEuroFilter(frequency, minCutoff, beta, dCutoff);
    this.yFilter = new OneEuroFilter(frequency, minCutoff, beta, dCutoff);
    this.zFilter = new OneEuroFilter(frequency, minCutoff, beta, dCutoff);
    this.wFilter = new OneEuroFilter(frequency, minCutoff, beta, dCutoff);
    this.lastQuat = new THREERef.Quaternion();
    this.initialized = false;
  }

  /**
   * @param {THREE.Quaternion} quat - Input quaternion
   * @param {THREE.Quaternion} out - Output quaternion (modified in place)
   * @param {number} [timestamp] - Optional timestamp in seconds
   * @returns {THREE.Quaternion} Filtered quaternion (same as out)
   */
  filter(quat, out, timestamp) {
    // Ensure quaternion continuity (avoid flipping)
    if (this.initialized && quat.dot(this.lastQuat) < 0) {
      quat = quat.clone().set(-quat.x, -quat.y, -quat.z, -quat.w);
    }
    
    out.x = this.xFilter.filter(quat.x, timestamp);
    out.y = this.yFilter.filter(quat.y, timestamp);
    out.z = this.zFilter.filter(quat.z, timestamp);
    out.w = this.wFilter.filter(quat.w, timestamp);
    out.normalize();
    
    this.lastQuat.copy(out);
    this.initialized = true;
    
    return out;
  }

  reset() {
    this.xFilter.reset();
    this.yFilter.reset();
    this.zFilter.reset();
    this.wFilter.reset();
    this.initialized = false;
  }

  setParams(params) {
    this.xFilter.setParams(params);
    this.yFilter.setParams(params);
    this.zFilter.setParams(params);
    this.wFilter.setParams(params);
  }
}

/**
 * Presets for common use cases
 */
export const OneEuroPresets = {
  // Very smooth, good for slow/precise movements (more lag)
  ultraSmooth: { minCutoff: 0.5, beta: 0.001, dCutoff: 1.0 },
  
  // Balanced smoothing for AR marker tracking
  arTracking: { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 },
  
  // Responsive but still smooth (default)
  balanced: { minCutoff: 1.5, beta: 0.05, dCutoff: 1.0 },
  
  // Fast response, minimal smoothing (more jitter)
  responsive: { minCutoff: 3.0, beta: 0.5, dCutoff: 1.0 },
  
  // Optimized for quaternion rotation
  rotation: { minCutoff: 2.0, beta: 0.3, dCutoff: 1.0 },
};
