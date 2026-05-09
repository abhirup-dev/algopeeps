import { getCodexApiKey } from "./config/auth.js";
import { getConfiguredCodexModel } from "./config/model.js";
import { runPiCodexPrompt } from "./agent/pi-orchestrator.js";

const prompt =
  process.argv.slice(2).join(" ") || "Inspect the current buffer and give one Socratic next step.";

const apiKey = await getCodexApiKey();
if (!apiKey) {
  throw new Error("OpenAI Codex auth is missing. Run `pnpm auth:codex` first.");
}

const result = await runPiCodexPrompt({
  prompt,
  model: getConfiguredCodexModel(),
  getApiKey: async (provider) => (provider === "openai-codex" ? getCodexApiKey() : undefined),
});

console.log(JSON.stringify(result, null, 2));
