import { getModel, getModels, type Model } from "@earendil-works/pi-ai";

export const CODEX_PROVIDER = "openai-codex";
export const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";

export function getConfiguredCodexModel(env: NodeJS.ProcessEnv = process.env): Model<any> {
  const modelId = env.ALGOPEEPS_CODEX_MODEL ?? DEFAULT_CODEX_MODEL;
  const model = getModels(CODEX_PROVIDER).find((candidate) => candidate.id === modelId);
  if (!model) {
    const available = getModels(CODEX_PROVIDER)
      .map((candidate) => candidate.id)
      .join(", ");
    throw new Error(`Unknown OpenAI Codex model "${modelId}". Available: ${available}`);
  }

  return getModel(CODEX_PROVIDER, model.id as never);
}
