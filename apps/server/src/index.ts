import { readServerConfig } from "./config/env.js";
import { createServer } from "./http/server.js";

const config = readServerConfig();
const server = createServer();

try {
  await server.listen({ host: config.host, port: config.port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
