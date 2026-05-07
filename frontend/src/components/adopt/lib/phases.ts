// mirrors dp_mesh_provisioner.c emit_state ordering, "started" is
// implicit before any state event arrives
export const PHASE_ORDER = [
  "started",
  "link-open",
  "pb-adv-done",
  "cfg-app-key",
  "cfg-bind",
  "cfg-pub-set",
  "complete",
] as const;

export type PhaseName = (typeof PHASE_ORDER)[number];

// codes mirror the provisioner state machine in dp_mesh_provisioner.c.
// labels are end-user facing and stay short so they fit one row; the
// technical reality is exposed via PROV_PHASE_DETAIL on hover so support
// staff can still see what's actually happening.
const PROV_PHASES: Record<string, string> = {
  started: "Searching",
  "link-open": "Connecting",
  "pb-adv-done": "Securing",
  "cfg-app-key": "Sharing key",
  "cfg-bind": "Linking",
  "cfg-pub-set": "Routing",
  complete: "Finishing",
};

const PROV_PHASE_DETAIL: Record<string, string> = {
  started: "Gateway armed, listening for the sensor's pairing beacons",
  "link-open": "Bluetooth link to the sensor is open",
  "pb-adv-done": "Encryption keys exchanged with the sensor",
  "cfg-app-key": "Sending the harbor key so the sensor can decrypt traffic",
  "cfg-bind": "Binding the sensor's reading model to the harbor key",
  "cfg-pub-set": "Pointing the sensor at the gateway for uplinks",
  complete: "Configuration done, awaiting final acknowledgement",
};

export function humanizePhase(state: string): string {
  return PROV_PHASES[state] ?? state;
}

export function describePhase(state: string): string {
  return PROV_PHASE_DETAIL[state] ?? humanizePhase(state);
}
