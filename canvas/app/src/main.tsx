import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import CanvasApp from "./CanvasApp";

/** toolinput arrives with the ui/initialize handshake — before CanvasApp
 * mounts. Capture it pre-connect (the library's own guidance) and replay it
 * to CanvasApp on mount. */
const lastToolInput: { current: any } = { current: null }; // eslint-disable-line @typescript-eslint/no-explicit-any -- toolinput payload ref captured pre-connect (library guidance)

function Root() {
  const { app, error } = useApp({
    appInfo: { name: "algopeeps-canvas", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onerror = (e: any) => console.error("canvas app error:", e); // eslint-disable-line @typescript-eslint/no-explicit-any -- ext-apps error payload is untyped
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- toolinput payload shape is host/tool-defined
      app.ontoolinput = (input: any) => {
        lastToolInput.current = input;
      };
    },
  });

  if (error)
    return (
      <div style={{ fontFamily: "sans-serif", padding: 16 }}>
        Canvas error: {error.message}
      </div>
    );
  if (!app)
    return (
      <div style={{ fontFamily: "sans-serif", padding: 16 }}>Connecting…</div>
    );

  return <CanvasApp app={app} lastToolInput={lastToolInput} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
