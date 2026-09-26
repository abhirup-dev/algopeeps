import "@excalidraw/excalidraw/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { wsUrl } from "./sync.ts";
import { Headless, isHeadless } from "./headless.ts";

const root = document.getElementById("root");
if (!root) throw new Error("elkdraw: #root missing from index.html");

createRoot(root).render(
  <StrictMode>
    {isHeadless(window.location.search) ? (
      <Headless />
    ) : (
      <App url={wsUrl(window.location, import.meta.env.VITE_ELKDRAW_WS)} />
    )}
  </StrictMode>,
);
