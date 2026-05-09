import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { loginOpenAICodex } from "@earendil-works/pi-ai/oauth";

import { authFilePath, saveCodexCredentials } from "./config/auth.js";

const rl = createInterface({ input, output });

try {
  const credentials = await loginOpenAICodex({
    onAuth: ({ url, instructions }) => {
      console.log(instructions ?? "Complete login in your browser.");
      console.log(url);
    },
    onPrompt: async (prompt) => rl.question(`${prompt.message} `),
    onManualCodeInput: async () =>
      rl.question("Paste the authorization code or full redirect URL, or press Enter after browser login: "),
    onProgress: (message) => console.log(message),
    originator: "pi",
  });

  await saveCodexCredentials(credentials);
  console.log(`Saved OpenAI Codex OAuth credentials to ${authFilePath()}`);
} finally {
  rl.close();
}
