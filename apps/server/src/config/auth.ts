import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { OAuthCredentials } from "@earendil-works/pi-ai/oauth";
import { getOAuthApiKey } from "@earendil-works/pi-ai/oauth";

const CODEX_PROVIDER = "openai-codex";

type AuthFile = Record<string, OAuthCredentials>;

export function authFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.ALGOPEEPS_AUTH_FILE ?? ".algopeeps/auth.json");
}

export async function readAuth(path = authFilePath()): Promise<AuthFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as AuthFile;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function writeAuth(auth: AuthFile, path = authFilePath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
}

export async function saveCodexCredentials(credentials: OAuthCredentials): Promise<void> {
  const auth = await readAuth();
  auth[CODEX_PROVIDER] = credentials;
  await writeAuth(auth);
}

export async function getCodexApiKey(): Promise<string | undefined> {
  const auth = await readAuth();
  const result = await getOAuthApiKey(CODEX_PROVIDER, auth);
  if (!result) {
    return undefined;
  }

  auth[CODEX_PROVIDER] = result.newCredentials;
  await writeAuth(auth);

  return result.apiKey;
}
