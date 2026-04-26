The frontend dashboard has been updated to use Server-Sent Events (SSE) for real-time berth updates.

This document specifies:

1. What the frontend currently uses and

2. What the backend must implement to be compatible

Existing Backend Endpoints: 

The frontend currently relies on:

- Get all berths: GET /api/berths

This endpoint is used: 

- on initial dashboard load

- After SSE reconnects(to prevent stale data)

Expected response format: 

Each berth should follow the existing schema: 

example: 

{ "berth_id": "ksss-saltsjobaden-pier-1-l1", "dock_id": "dock-id", "label": "L1", "status": "free", "sensor_raw": 123, "battery_pct": 80, "last_updated": "2026-04-26T12:00:00Z" }

New required Endpoint (SSE)

Route: 

GET /api/berths/events

Response Headers: 

Content-Type: text/event-stream Cache-Control: no-cache Connection: keep-alive

SSE Message Format: 

Each event must send one berth update in this format:

data: {"berth_id":"ksss-saltsjobaden-pier-1-l1","status":"occupied","last_updated":"2026-04-26T12:00:00Z","sensor_raw":250,"battery_pct":78}

Important

- The data: prefix is required

- There must be a blank line after each message

- Messages must be valid JSON

Minimum required for frontend updates: 

{ "berth_id": "ksss-saltsjobaden-pier-1-l1", "status": "occupied" }

Valid status values: 

- free

- occupied

Backend Event Flow

When a berth state changes via MQTT

MQTT message received

- processor_sensor_reading updates database

- if status changed

- backend emits SSE event to all connected clients

Only emit events when the state actually changes (already handled in process_sensor_reading).

Frontend Behaviour

The frontend: 

1. Fetches all berths (GET /api/berths).

2. Opens SSE connection: GET /api/berths/events

3. Updates UI instantly when receiving events

4. On connection drop: 
    - Browser automatically reconnects
    - Frontend refetches /api/berths to ensure consistency

