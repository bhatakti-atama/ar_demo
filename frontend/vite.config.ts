import { defineConfig } from "vite";
import { resolve } from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  base: "./",
  plugins: [basicSsl()],
  server: {
    host: true,
    https: true,
    proxy: {
      "/api/log": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
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
