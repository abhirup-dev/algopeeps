import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { healthResponseSchema } from "@algopeeps/shared";

import {
  runPiCodexPrompt,
  runPiSmoke,
  runPiSmokeChat,
  streamPiCodexPrompt,
} from "../agent/pi-orchestrator.js";
import { getCodexApiKey } from "../config/auth.js";
import { getConfiguredCodexModel } from "../config/model.js";
import { smokeBuddyMcpDiff } from "../mcp/buddy.js";
import { smokeChatPage } from "./smoke-chat-page.js";

export function createServer() {
  const app = Fastify({ logger: true });

  void app.register(websocket);

  app.get("/health", async () => healthResponseSchema.parse({ ok: true, service: "algopeeps-server" }));

  app.get("/api/pi/smoke", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(smokeChatPage()),
  );

  app.get("/api/pi/smoke/events", async () => runPiSmoke());

  app.post<{ Body: { prompt?: string } }>("/api/pi/smoke/chat", async (request, reply) => {
    const prompt = request.body.prompt?.trim();
    if (!prompt) {
      return reply.code(400).send({ error: "prompt_required", message: "Request body must include prompt." });
    }

    return runPiSmokeChat(prompt);
  });

  app.post<{ Body: { toolName?: string; args?: Record<string, unknown> } }>(
    "/api/pi/smoke-buddy-mcp/diff",
    async (request, reply) => {
      try {
        return await smokeBuddyMcpDiff(request.body);
      } catch (error) {
        return reply.code(503).send({
          error: "buddy_mcp_unavailable",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.post<{ Body: { prompt?: string } }>("/api/pi/codex", async (request, reply) => {
    const apiKey = await getCodexApiKey();
    if (!apiKey) {
      return reply.code(401).send({
        error: "codex_auth_required",
        message: "Run `pnpm auth:codex` before using the ChatGPT subscription provider.",
      });
    }

    return runPiCodexPrompt({
      prompt: request.body.prompt ?? "Inspect the current buffer and give one Socratic next step.",
      model: getConfiguredCodexModel(),
      getApiKey: async (provider) => (provider === "openai-codex" ? getCodexApiKey() : undefined),
    });
  });

  void app.register(async (wsApp) => {
    wsApp.get("/ws/events", { websocket: true }, (socket) => {
      socket.send(JSON.stringify({ type: "connected" }));
    });

    wsApp.get("/ws/test-demo", { websocket: true }, (socket) => {
      socket.send(JSON.stringify({ type: "agent.message.start", id: "sys_connected" }));
      socket.send(
        JSON.stringify({
          type: "agent.message.token",
          id: "sys_connected",
          delta: "Connected to Algopeeps Pi.",
        }),
      );
      socket.send(JSON.stringify({ type: "agent.message.end", id: "sys_connected" }));

      socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
        void (async () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(String(raw));
          } catch {
            socket.send(
              JSON.stringify({
                type: "agent.message.token",
                id: `msg_${Date.now()}`,
                delta: "Invalid JSON message.",
              }),
            );
            return;
          }

          const prompt =
            parsed && typeof parsed === "object" && "text" in parsed && typeof parsed.text === "string"
              ? parsed.text
              : "";
          if (!prompt.trim()) {
            return;
          }

          await streamPiCodexPrompt({
            prompt,
            model: getConfiguredCodexModel(),
            getApiKey: async (provider) => (provider === "openai-codex" ? getCodexApiKey() : undefined),
            emit: (event) => socket.send(JSON.stringify(event)),
          });
        })().catch((error) => {
          const id = `msg_${Date.now()}`;
          socket.send(JSON.stringify({ type: "agent.message.start", id }));
          socket.send(
            JSON.stringify({
              type: "agent.message.token",
              id,
              delta: error instanceof Error ? error.message : String(error),
            }),
          );
          socket.send(JSON.stringify({ type: "agent.message.end", id }));
        });
      });
    });
  });

  return app;
}
