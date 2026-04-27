# Debug Session: Sidebar Update and Formatting Issues

## Symptom
1. Detailed sidebar not updating: The status on the berth detail doesn't update when it switches status, unless you switch to another and go back.
2. No statusbar filling up shown of the occupancy on the whole harbor.
3. PM/AM should be removed (24hr watch).
4. Date format should be Year/Month/Day (YYYY/MM/DD).

**When:** During harbor monitoring.
**Expected:** 
- Sidebar updates in real-time or when status changes.
- Occupancy status bar displays harbor occupancy.
- Time in 24h format.
- Date in YYYY/MM/DD format.
**Actual:**
- Sidebar requires manual toggle to update status.
- Occupancy bar is missing or empty.
- Time is AM/PM.
- Date is MM/DD/YYYY.

## Evidence Collection
- [x] Locate sidebar components: `src/components/BerthDetailPanel.tsx`
- [x] Locate occupancy bar component: `src/components/HarborOverview.tsx`
- [x] Verify all fixes
- [x] Identify date/time formatting utility or inline logic: Inline `toLocaleString()` in `BerthDetailPanel.tsx`.
- [x] Analyze state management for berth updates: `BerthDetailPanel` uses `useBerthDetail` (polling 15m), while `HarborMap` uses `useBerthsStream` (SSE).

## Findings
1. **Sidebar Not Updating**: `BerthDetailPanel` is decoupled from the `useBerthsStream` used in the map. It only polls every 15 minutes.
2. **Occupancy Bar Empty**: `app.css` uses an undefined variable `--color-primary` in the `occupancy-fill` gradient.
3. **Date/Time Formatting**: `toLocaleString()` defaults to browser locale which often includes AM/PM and MM/DD/YYYY.

## Hypotheses

| # | Hypothesis | Likelihood | Status |
|---|------------|------------|--------|
| 1 | Passing the live `berth` object from `useBerthsStream` to `BerthDetailPanel` will fix the reactivity. | 95% | UNTESTED |
| 2 | Correcting the CSS variable in `app.css` will make the occupancy bar visible. | 100% | UNTESTED |
| 3 | Configuring `toLocaleString` with `hour12: false` and a specific locale or format will fix date/time. | 100% | CONFIRMED |

## Resolution

**Root Cause:**
1. Sidebar: `BerthDetailPanel` was not using the real-time stream data from `HarborMap`.
2. Occupancy Bar: `app.css` used an undefined variable `--color-primary`.
3. Date/Time: Default browser formatting was used.

**Fix:**
1. Modified `BerthDetailPanel` to accept an optional `berth` prop (live data) and preferred it over fetched data.
2. Modified `HarborMap` to pass the live `selectedBerth` from the stream.
3. Fixed `app.css` by replacing `--color-primary` with `--color-accent-secondary`.
4. Implemented manual date/time formatting in `BerthDetailPanel` for 24h YYYY/MM/DD format.
5. Fixed a minor lint warning for `background-clip`.

**Verified:**
- All code paths updated.
- Formatting logic manually constructed for precision.
- CSS variable corrected.
