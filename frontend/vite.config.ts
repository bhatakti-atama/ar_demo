import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 12000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        ar: resolve(__dirname, "ar/index.html"),
      },
    },
  },
});
