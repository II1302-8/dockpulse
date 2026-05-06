// stream endpoint is unauthenticated, request_id is the secret
import { useEffect, useState } from "react";
import type { components } from "../api-types";

type AdoptionRequest = components["schemas"]["AdoptionRequestOut"];
type AdoptionUpdateEvent = components["schemas"]["AdoptionUpdateEvent"];
type AdoptionStateEvent = components["schemas"]["AdoptionStateEvent"];

type StreamState = "connecting" | "open" | "closed" | "error";

interface UseAdoptionStreamResult {
  request: AdoptionRequest | null;
  state: StreamState;
  // last advisory phase pushed by the gateway (e.g. "link-open"), null until first state event
  phase: string | null;
}

export function useAdoptionStream(
  requestId: string | null,
): UseAdoptionStreamResult {
  const [request, setRequest] = useState<AdoptionRequest | null>(null);
  const [state, setState] = useState<StreamState>("closed");
  const [phase, setPhase] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setRequest(null);
      setPhase(null);
      setState("closed");
      return;
    }
    setState("connecting");
    setRequest(null);
    setPhase(null);
    const url = `/api/adoptions/${encodeURIComponent(requestId)}/stream`;
    const es = new EventSource(url);
    es.onopen = () => setState("open");
    es.onerror = () => {
      // EventSource fires error on close too, treat as closed if readyState=2
      setState(es.readyState === EventSource.CLOSED ? "closed" : "error");
    };
    es.addEventListener("adoption.update", (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as AdoptionUpdateEvent;
        setRequest(payload.request);
        if (payload.request.status !== "pending") {
          es.close();
          setState("closed");
        }
      } catch {
        setState("error");
      }
    });
    es.addEventListener("adoption.state", (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as AdoptionStateEvent;
        setPhase(payload.state);
      } catch {
        // advisory; bad payload is non-fatal
      }
    });
    return () => es.close();
  }, [requestId]);

  return { request, state, phase };
}
