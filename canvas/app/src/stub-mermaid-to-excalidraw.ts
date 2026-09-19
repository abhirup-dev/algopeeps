// Mermaid diagram import is out of scope for the canvas and its dependency
// tree (mermaid, cytoscape, katex, …) alone busts the 5 MB single-file budget.
// ponytail: if mermaid paste support is ever needed, drop the vite alias.
// eslint-disable-next-line @typescript-eslint/require-await -- stub is aliased as a Promise-returning tool surface (mermaid out of scope)
const unsupported = async () => {
  throw new Error("mermaid import is disabled in this build");
};

export const parseMermaidToExcalidraw = unsupported;
export const convertMermaidToExcalidraw = unsupported;
export default { parseMermaidToExcalidraw, convertMermaidToExcalidraw };
