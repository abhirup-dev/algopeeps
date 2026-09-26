export { readScene } from "./read/read.ts";
export type { ExcalidrawScene, MeasureText } from "./read/read.ts";
export { render } from "./render/render.ts";
export type { RenderDeps } from "./render/render.ts";
// The sidecar stays behind the backend: the server reaches it through here.
export { APP_DIST, Sidecar } from "@elkdraw/sidecar";
