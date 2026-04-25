This is the "Foundation" phase. In WebAR, Phase 1 is often the most frustrating because of **camera permissions** and **HTTPS requirements**. If the foundation is shaky, the 3D models won't render, and you'll waste time debugging the scene when the issue is actually the browser security policy.

Here is the high-granularity `.md` plan for Phase 1. You can drop this directly into **Cursor**.

---

# Phase 1: Environment Architecture & AR Scaffolding

## 1. Objectives
* Establish a clean, professional directory structure.
* Configure the **WebXR-compatible** environment.
* Implement the "Secure Context" required for camera access.
* Verify library injection and baseline rendering.

---

## 2. Directory Architecture
Create the following structure to separate concerns. This prevents the AI from getting "confused" by large, monolithic files.

```text
/science-ar-prototype
├── /assets
│   ├── /models       # For future .glb files
│   ├── /textures     # For the Sun surface map
│   └── /markers      # For .patt files
├── index.html        # The AR Scene entry point
├── style.css         # UI Overlay & Camera view styling
└── app.js            # Hardware (Camera/Zoom) logic
```

---

## 3. Dependency Specification
We are using **CDN injection** for the prototype phase to eliminate `npm` build overhead. 

* **A-Frame v1.7.0:** The high-level framework for 3D/WebXR.
* **AR.js (A-Frame Version):** The tracking engine. Note: We use the version specifically bundled for A-Frame to ensure the `<a-marker>` and `<a-scene>` components are registered correctly.

---

## 4. The "Secure Context" Strategy (Critical)
The browser **will not** open the camera on an `http://` connection (except for `localhost`).
* **Local Dev:** Cursor usually handles this via its built-in terminal. You will need to run a local server (e.g., `python -m http.server` or the Live Server extension).
* **Remote Testing:** You **must** deploy to a service with SSL (GitHub Pages, Vercel, or Netlify) to test on a mobile device.

---

## 5. Detailed Step-by-Step Implementation

### Step 1.1: HTML Hard-Coding
Set up the metadata. In AR, the `viewport` meta tag is vital to prevent the browser from zooming the UI instead of the camera.

### Step 1.2: A-Frame Scene Configuration
The `<a-scene>` needs specific `arjs` parameters:
* `sourceType: webcam`: Tells the engine to grab the user's camera.
* `debugUIEnabled: false`: Removes the red/white tracking overlay.
* `trackingMethod: best`: Prioritizes accuracy for the science model.

### Step 1.3: CSS Reset & Overlay
AR views need a "Transparent UI" approach. The `video` injected by AR.js will be placed at the bottom of the DOM; our CSS must ensure the Canvas is responsive.

---

## 6. Cursor Composer Prompts (Copy-Paste)

### Prompt A: The Structure
> "Create a folder structure: /assets/models, /assets/textures, /assets/markers. Create three empty files: index.html, style.css, and app.js. In index.html, add a standard HTML5 boilerplate with a viewport meta tag optimized for mobile (initial-scale=1, maximum-scale=1, user-scalable=no)."

### Prompt B: Library & Scene Setup
> "In index.html, import A-Frame 1.7.0 and the AR.js for A-Frame library via CDN. In the body, create an <a-scene> with the 'embedded' and 'arjs' components enabled. Set 'sourceType' to 'webcam' and disable the 'debugUI'. Inside the scene, add a basic <a-entity camera></a-entity> and a simple <a-box> at position '0 0.5 0' to verify rendering before we move to markers."

### Prompt C: CSS & UI Scaffolding
> "In style.css, ensure the body and html have 0 margin/padding and are height 100%. Create a class '.ar-ui-overlay' that is fixed at the bottom of the screen with a z-index of 1000. This will eventually hold our zoom slider. Link this CSS file in index.html."

---

## 7. Verification Checklist
1.  [ ] **Live Server:** Does the project open in the browser?
2.  [ ] **Camera Prompt:** Does the browser ask "Allow camera access"?
3.  [ ] **The Placeholder:** Do you see a white 3D box floating on the screen? (If yes, the 3D engine is working).
4.  [ ] **Console Cleanliness:** Open DevTools (F12). There should be no "404 Not Found" errors for the JS libraries.

---

**Next Move:** Once you've run these prompts in Cursor and confirmed you see the camera feed and a placeholder box, let me know. We will then proceed to **Phase 2: The Sun & Marker Logic**.

How comfortable are you with managing the local server setup, or would you like a quick tip on the best way to preview this on your phone?