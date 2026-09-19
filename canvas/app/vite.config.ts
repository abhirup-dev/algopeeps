import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: [
      {
        find: /^@excalidraw\/mermaid-to-excalidraw$/,
        replacement: fileURLToPath(
          new URL("./src/stub-mermaid-to-excalidraw.ts", import.meta.url),
        ),
      },
    ],
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: {
    rollupOptions: { input: "canvas.html" },
    outDir: "dist",
  },
});
