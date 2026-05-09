import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  type Context,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
  registerFauxProvider,
  Type,
  type Model,
} from "@earendil-works/pi-ai";

export interface PiSmokeResult {
  sessionId: string;
  events: string[];
  finalText: string;
  toolCalls: number;
}

export interface PiPromptResult extends PiSmokeResult {
  model: string;
  provider: string;
  stopReason?: string;
  errorMessage?: string;
  contentTypes?: string[];
}

export interface PiChatResult {
  sessionId: string;
  response: string;
}

export type PiTokenEvent =
  | { type: "agent.message.start"; id: string }
  | { type: "agent.message.token"; id: string; delta: string }
  | { type: "agent.message.end"; id: string };

const readBufferParameters = Type.Object({
  path: Type.String(),
});

function createEchoTool(): AgentTool<typeof readBufferParameters> {
  return {
    name: "buddy_buffer_read",
    label: "Read Buddy buffer",
    description: "Mock Buddy MCP buffer read used by the Phase-0 Pi smoke test.",
    parameters: readBufferParameters,
    async execute(_toolCallId, params) {
      return {
        content: [
          {
            type: "text",
            text: `mock buffer ${params.path}: function twoSum(nums, target) { return []; }`,
          },
        ],
        details: {
          source: "mock-buddy",
          path: params.path,
        },
      };
    },
    executionMode: "sequential",
  };
}

function eventName(event: AgentEvent): string {
  if (event.type === "message_update") {
    return `${event.type}:${event.assistantMessageEvent.type}`;
  }
  if (event.type === "tool_execution_end") {
    return `${event.type}:${event.toolName}`;
  }
  return event.type;
}

export async function runPiSmoke(): Promise<PiSmokeResult> {
  const sessionId = `pi-smoke-${Date.now()}`;
  const faux = registerFauxProvider({ tokensPerSecond: 0 });
  const events: string[] = [];
  let toolCalls = 0;

  try {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxThinking("Need the active editor buffer first."),
          fauxToolCall("buddy_buffer_read", { path: "test/hello.go" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([
        fauxText("Pi smoke complete. I read the mocked Buddy buffer and can continue the Socratic turn."),
      ]),
    ]);

    const agent = new Agent({
      initialState: {
        systemPrompt:
          "You are the Algopeeps Socratic coding agent. Ask questions before revealing solutions.",
        model: faux.getModel(),
        tools: [createEchoTool()],
        messages: [],
      },
      sessionId,
      toolExecution: "sequential",
      beforeToolCall: async ({ toolCall }) => {
        if (toolCall.name === "hint.reveal_solution") {
          return { block: true, reason: "solution reveal is disabled in Phase 0" };
        }
        return { block: false };
      },
    });

    agent.subscribe((event) => {
      events.push(eventName(event));
      if (event.type === "tool_execution_start") {
        toolCalls += 1;
      }
    });

    await agent.prompt("Inspect the current buffer and give the student a Socratic next step.");
    await agent.waitForIdle();

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const finalText =
      lastAssistant?.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "";

    return { sessionId, events, finalText, toolCalls };
  } finally {
    faux.unregister();
  }
}

function lastUserText(context: Context): string {
  const lastUser = [...context.messages].reverse().find((message) => message.role === "user");
  if (!lastUser || lastUser.role !== "user") {
    return "";
  }

  return typeof lastUser.content === "string"
    ? lastUser.content
    : lastUser.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}

export async function runPiSmokeChat(prompt: string): Promise<PiChatResult> {
  const sessionId = `pi-smoke-chat-${Date.now()}`;
  const faux = registerFauxProvider({ tokensPerSecond: 0 });

  try {
    faux.setResponses([
      (context) => {
        const text = lastUserText(context).trim();
        return fauxAssistantMessage(
          fauxText(
            text
              ? `Smoke chat received: "${text}". This is the local Pi chat loop; wire Codex or Buddy MCP when you want a real model/tool response.`
              : "Smoke chat is ready. Send a message to exercise the local Pi agent loop.",
          ),
        );
      },
    ]);

    const agent = new Agent({
      initialState: {
        systemPrompt: "You are the local Algopeeps smoke chat agent.",
        model: faux.getModel(),
        messages: [],
      },
      sessionId,
    });

    await agent.prompt(prompt);
    await agent.waitForIdle();

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const response =
      lastAssistant?.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "";

    return { sessionId, response };
  } finally {
    faux.unregister();
  }
}

export async function runPiCodexPrompt(options: {
  prompt: string;
  model: Model<any>;
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
}): Promise<PiPromptResult> {
  const sessionId = `pi-codex-${Date.now()}`;
  const events: string[] = [];
  let toolCalls = 0;

  const agent = new Agent({
    initialState: {
      systemPrompt:
        "You are the Algopeeps Socratic coding agent. Ask targeted questions, inspect code before giving advice, and do not reveal full solutions early.",
      model: options.model,
      tools: [createEchoTool()],
      messages: [],
      thinkingLevel: "low",
    },
    sessionId,
    transport: "auto",
    toolExecution: "sequential",
    getApiKey: options.getApiKey,
    beforeToolCall: async ({ toolCall }) => {
      if (toolCall.name === "hint.reveal_solution") {
        return { block: true, reason: "solution reveal is disabled in Phase 0" };
      }
      return { block: false };
    },
  });

  agent.subscribe((event) => {
    events.push(eventName(event));
    if (event.type === "tool_execution_start") {
      toolCalls += 1;
    }
  });

  await agent.prompt(options.prompt);
  await agent.waitForIdle();

  const lastAssistant = [...agent.state.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const finalText =
    lastAssistant?.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("") ?? "";

  return {
    sessionId,
    events,
    finalText,
    toolCalls,
    model: options.model.id,
    provider: options.model.provider,
    stopReason: lastAssistant?.stopReason,
    errorMessage: lastAssistant?.errorMessage,
    contentTypes: lastAssistant?.content.map((block) => block.type),
  };
}

export async function streamPiCodexPrompt(options: {
  prompt: string;
  model: Model<any>;
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
  emit: (event: PiTokenEvent) => void;
}): Promise<void> {
  const sessionId = `msg_${Date.now()}`;
  let started = false;
  let ended = false;
  let emittedText = "";

  const start = () => {
    if (!started) {
      options.emit({ type: "agent.message.start", id: sessionId });
      started = true;
    }
  };

  const end = () => {
    if (started && !ended) {
      options.emit({ type: "agent.message.end", id: sessionId });
      ended = true;
    }
  };

  const agent = new Agent({
    initialState: {
      systemPrompt:
        "You are the Algopeeps Test-Demo agent. Reply conversationally and keep responses concise unless the user asks for depth.",
      model: options.model,
      messages: [],
      thinkingLevel: "low",
    },
    sessionId,
    transport: "auto",
    getApiKey: options.getApiKey,
  });

  agent.subscribe((event) => {
    if (event.type !== "message_update") {
      return;
    }

    const update = event.assistantMessageEvent;
    if (update.type === "text_start") {
      start();
    }
    if (update.type === "text_delta") {
      start();
      emittedText += update.delta;
      options.emit({ type: "agent.message.token", id: sessionId, delta: update.delta });
    }
    if (update.type === "text_end") {
      end();
    }
  });

  await agent.prompt(options.prompt);
  await agent.waitForIdle();

  const lastAssistant = [...agent.state.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!emittedText && lastAssistant?.errorMessage) {
    start();
    options.emit({
      type: "agent.message.token",
      id: sessionId,
      delta: `Pi agent error: ${lastAssistant.errorMessage}`,
    });
  }
  end();
}
