import { cpSync, createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Excalidraw's font files, served at /fonts/ in dev and copied into dist/fonts
// on build, so the canvas works offline with EXCALIDRAW_ASSET_PATH = "/".
const fonts = join(
  dirname(createRequire(import.meta.url).resolve("@excalidraw/excalidraw")),
  "fonts",
);

const excalidrawFonts = {
  name: "elkdraw-excalidraw-fonts",
  configureServer(server) {
    server.middlewares.use("/fonts", (req, res, next) => {
      const file = join(fonts, decodeURIComponent(req.url ?? "").split("?")[0]);
      if (!file.startsWith(fonts)) return next();
      res.setHeader("Content-Type", "font/woff2");
      createReadStream(file)
        .on("error", () => next())
        .pipe(res);
    });
  },
  closeBundle() {
    cpSync(fonts, join(import.meta.dirname, "dist", "fonts"), {
      recursive: true,
    });
  },
};

export default defineConfig({
  plugins: [react(), excalidrawFonts],
  server: { host: "127.0.0.1" },
});
