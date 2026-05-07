import type { ApiError } from "../../../lib/api";

// codes mirror II1302-8/.github docs/mqtt-contract.yml provision/resp enum
const ADOPT_ERROR_MESSAGES: Record<string, string> = {
  busy: "Gateway is busy provisioning another node. Wait ~30s and retry.",
  "bad-uuid": "QR contained an invalid mesh UUID. Re-scan the node sticker.",
  "bad-oob":
    "QR contained an invalid out-of-band key. Re-scan the node sticker.",
  "cfg-fail":
    "BLE-mesh handshake failed. Hit retry — the node self-resets after 90s if cfg never completes, so retry should land cleanly.",
  "appkey-send":
    "Gateway couldn't send the app-key step. Check gateway logs and retry.",
  "bind-send":
    "Gateway couldn't send the model-bind step. Check gateway logs and retry.",
  "pubset-send":
    "Gateway couldn't send the publish-set step. Check gateway logs and retry.",
  "link-close":
    "BLE link closed before configuration finished. Confirm range and retry.",
  "start-fail": "Gateway mesh stack refused to start. Power-cycle the gateway.",
  timeout:
    "Node didn't broadcast an unprovisioned beacon within 180s. Most often it's already in another mesh — factory-reset the node, confirm range, then retry.",
  "already-provisioned":
    "Node is already part of a mesh. Decommission it first, or factory-reset the node, then retry.",
  cancelled: "Adoption cancelled.",
  unknown:
    "Provisioning failed for an unknown reason. Retry, then check gateway logs.",
};

export function humanizeAdoptError(
  code: string | null | undefined,
  msg: string | null | undefined,
): string {
  if (!code) return msg ?? "Provisioning failed.";
  const friendly = ADOPT_ERROR_MESSAGES[code];
  if (friendly) return msg ? `${friendly} (${msg})` : friendly;
  // unknown code, surface raw values so support has something to grep
  return msg ? `${code} — ${msg}` : code;
}

export function mapAdoptError(err: ApiError): string {
  if (err.status === 401) return "Sign in as harbormaster to adopt nodes";
  if (err.status === 403) return "Harbormaster role required";
  if (err.status === 404) return err.message;
  if (err.status === 409) return err.message;
  if (err.status === 400) return err.message;
  return err.message;
}
