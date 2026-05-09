import { runPiSmoke } from "./agent/pi-orchestrator.js";

const result = await runPiSmoke();

console.log(JSON.stringify(result, null, 2));
