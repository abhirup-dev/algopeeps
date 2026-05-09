export function smokeChatPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Algopeeps Pi Smoke Chat</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f8;
        color: #17191c;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      header, form {
        padding: 14px 18px;
        border-color: #d9dde3;
        background: #ffffff;
      }
      header {
        border-bottom: 1px solid #d9dde3;
        font-weight: 650;
      }
      main {
        padding: 18px;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      form {
        border-top: 1px solid #d9dde3;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
      }
      textarea {
        min-height: 44px;
        max-height: 160px;
        resize: vertical;
        padding: 10px 12px;
        border: 1px solid #b9c0ca;
        border-radius: 8px;
        font: inherit;
      }
      button {
        min-width: 88px;
        border: 0;
        border-radius: 8px;
        background: #1f6feb;
        color: white;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .msg {
        max-width: 860px;
        padding: 10px 12px;
        border-radius: 8px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .user {
        align-self: flex-end;
        background: #dfefff;
      }
      .assistant {
        align-self: flex-start;
        background: #ffffff;
        border: 1px solid #d9dde3;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          background: #111318;
          color: #eceff4;
        }
        header, form, .assistant {
          background: #181b21;
          border-color: #303541;
        }
        textarea {
          background: #101218;
          color: #eceff4;
          border-color: #3a414f;
        }
        .user {
          background: #15345c;
        }
      }
    </style>
  </head>
  <body>
    <header>Algopeeps Pi Smoke Chat</header>
    <main id="messages">
      <div class="msg assistant">Smoke chat is ready. Send a message to exercise the local Pi agent loop.</div>
    </main>
    <form id="chat-form">
      <textarea id="prompt" autofocus placeholder="Send a message"></textarea>
      <button id="send" type="submit">Send</button>
    </form>
    <script>
      const form = document.getElementById("chat-form");
      const prompt = document.getElementById("prompt");
      const send = document.getElementById("send");
      const messages = document.getElementById("messages");

      function append(role, text) {
        const node = document.createElement("div");
        node.className = "msg " + role;
        node.textContent = text;
        messages.appendChild(node);
        messages.scrollTop = messages.scrollHeight;
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = prompt.value.trim();
        if (!text) return;

        append("user", text);
        prompt.value = "";
        send.disabled = true;

        try {
          const response = await fetch("/api/pi/codex", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt: text }),
          });
          const body = await response.json();
          append("assistant", body.finalText ?? body.response ?? body.message ?? JSON.stringify(body));
        } catch (error) {
          append("assistant", error instanceof Error ? error.message : String(error));
        } finally {
          send.disabled = false;
          prompt.focus();
        }
      });
    </script>
  </body>
</html>`;
}
