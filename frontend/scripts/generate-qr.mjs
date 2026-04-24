import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const outputDir = path.resolve("public/qr");
const outputPath = path.join(outputDir, "qr-ar-entry.png");
const targetUrl = process.argv[2] ?? "https://example.com/ar/";

await fs.mkdir(outputDir, { recursive: true });
await QRCode.toFile(outputPath, targetUrl, {
  width: 640,
  margin: 2,
  color: {
    dark: "#0f172a",
    light: "#ffffff",
  },
});

console.log(`QR generated at ${outputPath}`);
console.log(`Target URL: ${targetUrl}`);
