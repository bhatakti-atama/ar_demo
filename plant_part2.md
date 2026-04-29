This plan moves your project from its current "Scaffolding" state into **Phase 2: Asset Integration**. Since you have a professional HUD and camera logic already implemented, the goal is to replace the verification box with a high-fidelity animated model to test the tracking stability and visual depth of your "Science Chart" concept.

---

## 🛠️ Phase 2: Dummy AR Asset Integration Plan

### 1. Asset Procurement (The "Dummy" Model)
To verify the science theme, we will use an **Animated Sun** as the dummy model. This allows us to test light-casting, textures, and skeletal animations.
* **Option A (Fastest):** High-resolution `<a-sphere>` with a solar texture URL.
* **Option B (Professional):** A `.glb` model (e.g., a pumping heart or solar system) placed in `ar/assets/models/`.

### 2. Implementation: Scene & Animation Logic
We will update the `<a-marker>` to handle a more complex entity.
* **Scaling:** Ensure the model fits within the marker's bounds ($1\times1$ unit in A-Frame).
* **Lighting:** Add a "Solar Glow" using a point light that affects the HUD and ground plane.
* **Animation Mixer:** Use the `animation-mixer` component to trigger baked `.glb` animations.

### 3. HUD-to-AR Wiring
Currently, your HUD is a separate layer. We need to wire the "Target Locked" state to the actual AR engine events.
* **Found State:** Change crosshair to green and play a "Data Linked" toast.
* **Lost State:** Change crosshair to red/pulsating and update status to "Searching...".

---

## 🤖 Cursor Composer Prompts

Use these prompts in order to update your codebase.

### Prompt 1: The Model & Animation
> "In `frontend/ar/index.html`, replace the current placeholder box inside the `<a-marker>` with a high-detail Sun model. Use an `<a-sphere>` with `segments-width: 64` and `segments-height: 64`. Apply a solar texture (use: `https://raw.githubusercontent.com/aframevr/sample-assets/master/assets/images/space/sun.jpg`). Add a continuous 360-degree rotation animation using the A-Frame `animation` component. Ensure it sits at `position="0 0.5 0"`."

### Prompt 2: HUD Integration (The "Lock-On" State)
> "In `ar/app.js`, add event listeners for `markerFound` and `markerLost`. 
> 1. On `markerFound`: Update the CSS class of the central crosshair to `.locked` (green), and trigger a toast notification saying 'STABLE LINK: SOLAR DATA ACQUIRED'.
> 2. On `markerLost`: Revert the crosshair to `.scanning` (red) and show a toast saying 'SIGNAL LOST: RE-SCANNING CHART'."

### Prompt 3: Lighting & Visual Depth
> "Add a `<a-light type="point" intensity="2" color="#FFCC00">` inside the Sun model. Also, add a subtle `<a-plane>` at `rotation="-90 0 0"` on the marker with a transparent shadow material so the Sun appears to cast a shadow on the physical chart."

---

## 📋 Validation Checklist
* [ ] **Marker Parity:** Does the model appear exactly on the Hiro marker center?
* [ ] **HUD Sync:** Does the "Target Locked" UI trigger *exactly* when the model appears?
* [ ] **Animation Loop:** Is the rotation smooth (no jitter) on both PC and Mobile?
* [ ] **Performance:** Check the debug log for any `THREE.WebGLRenderer` warnings regarding texture size.

---

### 💡 Recommendation for the "Chart"
Since your project is named `ar_charts`, your next logical step after this dummy test is to map the data in `public/data/chartData.json` to the scale of the AR model (e.g., using the Sun's size to represent a specific data point).

**Would you like me to draft the specific logic for connecting the `chartData.json` to the Sun's scale next?**