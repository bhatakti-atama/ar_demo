import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="landing">
    <h1>AR Charts</h1>
    <p class="intro">Scan the QR code to open the AR page on your phone and point at a Hiro marker.</p>
    <div class="actions">
      <a class="button primary" href="./ar/">Open AR page</a>
      <a class="button secondary" href="https://bhatakti-atama.github.io/ar_demo/ar/">Open hosted AR page</a>
    </div>
    <p class="hint">Tip: Print or display the Hiro marker image to lock the chart in AR.</p>
    <a class="marker-link" href="https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png" target="_blank" rel="noreferrer">Open Hiro marker</a>
  </main>
`;
