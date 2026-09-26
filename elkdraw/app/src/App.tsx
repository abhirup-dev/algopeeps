import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";
import { toScene, toWire } from "./excalidraw.ts";
import type { ServerMessage } from "./protocol.ts";
import {
  type Baseline,
  type ConnectionState,
  baselineOf,
  connect,
  diff,
  merge,
} from "./sync.ts";

const SEND_DEBOUNCE_MS = 200;

export function App({ url }: { url: string }) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [branch, setBranch] = useState("");
  const baseline = useRef<Baseline>(new Map());
  const rev = useRef(0);
  const flush = useRef<() => void>(() => undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!api) return;
    const apply = (msg: ServerMessage) => {
      switch (msg.type) {
        case "hello":
          setBranch(msg.branch);
          return;
        case "snapshot": {
          const elements = toScene(msg.elements);
          api.updateScene({
            elements,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          baseline.current = baselineOf(elements);
          rev.current = msg.rev;
          return;
        }
        case "delta": {
          const upserts = toScene(msg.upserts);
          api.updateScene({
            elements: merge(
              api.getSceneElementsIncludingDeleted(),
              upserts,
              msg.deletes,
            ),
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          // Only touched ids: unsent local edits elsewhere stay pending.
          for (const el of upserts) baseline.current.set(el.id, el.version);
          for (const id of msg.deletes) baseline.current.delete(id);
          rev.current = msg.rev;
          return;
        }
        case "ack":
          rev.current = msg.rev;
          return;
      }
    };
    const sync = connect(url, {
      onState: setState,
      onMessage: apply,
      onBadMessage: (error) => {
        // eslint-disable-next-line no-console -- a dropped server message is a bug worth seeing in devtools
        console.error("elkdraw: bad server message", error);
      },
    });
    flush.current = () => {
      const elements = api.getSceneElementsIncludingDeleted();
      const { upserts, deletes } = diff(baseline.current, elements);
      if (!upserts.length && !deletes.length) return;
      const sent = sync.send({
        type: "delta",
        rev: rev.current,
        upserts: toWire(upserts),
        deletes,
        author: "human",
      });
      if (sent) baseline.current = baselineOf(elements);
    };
    return () => {
      clearTimeout(timer.current);
      sync.close();
    };
  }, [api, url]);

  const onChange = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flush.current();
    }, SEND_DEBOUNCE_MS);
  };

  return (
    <>
      <Excalidraw excalidrawAPI={setApi} onChange={onChange} />
      <div className={`elkdraw-pill elkdraw-pill-${state}`}>
        {branch || "?"} · {state} · {url}
      </div>
    </>
  );
}
