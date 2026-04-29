# AR Flow and Logic Guide

This document explains how the current AR scene works end-to-end, including marker setup, consensus tracking, model placement, scaling, smoothing, and tuning controls.

---

## 1) High-Level Runtime Flow

🐬 **Step 1: Scene boot**
- `frontend/ar/index.html` loads A-Frame + AR.js.
- `<a-scene>` is configured for barcode detection:
  - `detectionMode: mono_and_matrix`
  - `matrixCodeType: 3x3`
  - `sourceWidth: 1920`, `sourceHeight: 1080`

🐬 **Step 2: Marker tracking starts**
- Four barcode markers are declared (corners):
  - top-left: value `1`
  - top-right: value `6`
  - bottom-left: value `12`
  - bottom-right: value `18`
- Each marker has `size="0.065"` (6.5 cm).

🐬 **Step 3: Consensus anchor updates**
- `multi-marker-stabilizer` component in `frontend/ar/app.js` reads visible markers every frame.
- It estimates a board-center pose from each visible marker.
- It averages those estimates and applies smoothing/deadband.
- The model root (`#stable-model-root`) follows this stabilized center.

🐬 **Step 4: Model transform applies**
- Model size, offset, and rotation are applied in `app.js`.
- Offset/rotation sliders update model transform live.
- Scale remains marker-unit based (`markerSize` as base unit, then multipliers).

---

## 2) Physical Calibration (Fixed Numbers)

🐬 **Known physical measurements**
- Marker square size: `0.065 m` (6.5 cm)
- Chart width: `0.6 m` (60 cm)
- Chart height: `0.45 m` (45 cm)

🐬 **Derived center offsets**
- `MARKER_CENTER_HALF_SPAN_X_M = (0.6 - 0.065) / 2 = 0.2675`
- `MARKER_CENTER_HALF_SPAN_Y_M = (0.45 - 0.065) / 2 = 0.1925`

These are used to map each corner marker to the expected chart center.

---

## 3) Marker Layout Mapping

Defined in `app.js` as `MARKER_LAYOUT`:
- `marker-tl` -> barcode `1` -> `barcode-3x3-id1-top-left.png`
- `marker-tr` -> barcode `6` -> `barcode-3x3-id6-top-right.png`
- `marker-bl` -> barcode `12` -> `barcode-3x3-id12-bottom-left.png`
- `marker-br` -> barcode `18` -> `barcode-3x3-id18-bottom-right.png`

🐬 This mapping is used for:
- selecting tracked elements
- assigning per-corner offsets
- startup mismatch logging

---

## 4) Consensus Center Logic (Core Stabilizer)

Implemented in A-Frame component: `multi-marker-stabilizer` (`app.js`).

Per tick:
1. Collect visible marker world pose (position + quaternion).
2. Convert each marker pose into a predicted chart-center pose using corner offset.
3. Average center positions.
4. Average quaternions (with sign correction to avoid flip artifacts).
5. Apply context bias based on visible marker count (1/2/3/4).
6. Apply deadband checks (ignore tiny changes).
7. Lerp/slerp model root toward averaged pose.

🐬 **Result:** stable center-following behavior even when only subset of markers are visible.

---

## 5) Jitter Control Logic

There are multiple anti-jitter layers:

🐬 **AR.js marker smoothing (HTML attributes)**
- `smooth="true"`
- `smooth-count`
- `smooth-tolerance`
- `smooth-threshold`

🐬 **Consensus smoothing (JS)**
- Lerp factor in `multi-marker-stabilizer`
- Quaternion sign alignment before averaging

🐬 **Deadband suppression (JS)**
- `POSITION_DEADBAND`
- `ROTATION_DEADBAND_DEG`
- If movement is below both thresholds, no update is applied for that frame.

---

## 6) Scale and Units

Scale is calculated in marker-space units in `fitLayersModelToMarker()`:

`target = markerSize * MODEL_SIZE_RELATIVE_TO_TAG * MODEL_DEVICE_CALIBRATION.size`

Where:
- `markerSize` comes from marker `size` attribute (`0.065` here)
- `MODEL_SIZE_RELATIVE_TO_TAG` is user/system multiplier
- `MODEL_DEVICE_CALIBRATION.size` is optional device correction

🐬 Base unit remains marker size; other terms are multiplicative tuning.

---

## 7) Model Transform Logic

Applied in `placeLayersModelInFrontOfMarker()`:
- Position:
  - `MODEL_POSITION_RELATIVE_TO_TAG.{x,y,z} * markerSize`
- Rotation:
  - `MODEL_ROTATION.{pitch,yaw,roll}` + device calibration rotation offsets

Transform writes are scheduled via `requestAnimationFrame` to avoid update storms:
- `scheduleModelTransform(...)`
- `applyModelTransformNow()`

---

## 8) UI Tuning Controls (Current)

Available in settings drawer:
- Offset sliders: `X`, `Y`, `Z`
- Rotation sliders: `Pitch`, `Yaw`, `Roll`

These update the corresponding model variables in real time.

---

## 9) Camera/Focus Pipeline

Camera request logic in `app.js`:
- Prefers high-res stream (`1920x1080`, frame-rate hints)
- Uses `focusMode: "continuous"` / `exposureMode: "continuous"` hints
- Falls back safely if constraints are unsupported

Manual autofocus button/tap-to-focus were removed per current requirements.

---

## 10) Where to Edit What

🐬 **Marker IDs / corner mapping**
- `MARKER_LAYOUT` in `frontend/ar/app.js`
- marker tags in `frontend/ar/index.html`

🐬 **Physical geometry**
- `MARKER_SIZE_M`, `CHART_WIDTH_M`, `CHART_HEIGHT_M` in `app.js`

🐬 **Center behavior with partial visibility**
- `VISIBILITY_CONTEXT_BIAS` in `app.js`

🐬 **Model visual fit**
- `MODEL_SIZE_RELATIVE_TO_TAG`
- `MODEL_POSITION_RELATIVE_TO_TAG`
- `MODEL_ROTATION`
- all in `app.js`

🐬 **Stability knobs**
- marker smooth attributes in `index.html`
- stabilizer lerp/deadbands in `app.js`

---

## 11) Quick Debug Checklist

1. Confirm correct corner marker printouts are used (IDs 1/6/12/18).
2. Confirm marker orientation/placement matches intended corner map.
3. Check debug log for marker config mismatches at startup.
4. Validate lighting (low light increases jitter significantly).
5. If drift appears with fewer visible markers, tune context biases.

---

If you want, a second doc can be added with a "recommended default values" table for phone vs desktop profiles.
