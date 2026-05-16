// stream endpoint requires harbormaster auth on the originating harbor
// (backend enforces via require_harbormaster_for_adoption_request)
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
  // bumped to force a fresh EventSource after stream.stale
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!requestId) {
      setRequest(null);
      setPhase(null);
      setState("closed");
      return;
    }
    void generation;
    setState("connecting");
    setRequest(null);
    setPhase(null);
    const url = `/api/adoptions/${encodeURIComponent(requestId)}/stream`;
    const es = new EventSource(url);
    es.onopen = () => setState("open");
    es.onerror = () => {
      // EventSource fires error on close too, treat as closed if readyState=2.
      // an auth failure (401/403) also lands here without status visibility
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
        // advisory, bad payload is non-fatal
      }
    });
    // server signalled it had to drop an event for us, re-open for resync
    es.addEventListener("stream.stale", () => {
      es.close();
      setGeneration((g) => g + 1);
    });
    return () => es.close();
  }, [requestId, generation]);

  return { request, state, phase };
}
