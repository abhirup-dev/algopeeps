export interface ServerConfig {
  host: string;
  port: number;
}

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.ALGOPEEPS_HOST ?? "127.0.0.1",
    port: Number.parseInt(env.ALGOPEEPS_PORT ?? "4173", 10),
  };
}
