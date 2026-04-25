import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="landing">
    <h1>AR Charts</h1>
    <p class="intro">Scan the QR code to open the Phase 1 page on your phone (A-Frame 1.7 + AR.js via CDN, Hiro marker + box).</p>
    <div class="actions">
      <a class="button primary" href="./ar/">Open AR scaffold</a>
      <a class="button secondary" href="https://bhatakti-atama.github.io/ar_demo/ar/">Open hosted page</a>
    </div>
    <p class="hint">Phase 1 (see frontend/plan.md): secure context, library injection, full-screen log panel.</p>
  </main>
`;
