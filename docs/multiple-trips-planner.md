# Multiple Trips planner

Orders List > Multiple Trips plans every eligible row in the current filtered view. Selection checkboxes do not narrow the plan. Single Trip is unchanged.

## Planning modes

Working hours, Distance and Capacity use their respective common hard cap. Hybrid applies all three. Best plan compares time-first, distance-first and capacity-first preferences under the same three caps. It recommends complete coverage first, then assigned order count, fewer trips, combined verified road distance and total working time. This compares computed plans; it is not a global-optimum claim.

Hours include driving, waiting, service and depot return. Distance includes the full depot loop. Capacity uses the existing curd quantity convention: one kg per box. Ice cream remains informational. Rider count schedules one trip per rider per Asia/Kolkata calendar day at the chosen daily departure. Rider names selected when opening details affect copied messages only, without persistence or dispatch assignment.

## Routing and verification

One configured Google all-order sequence seeds the plan. Flexible joint optimization can move and reorder stops; Best plan shares the initial sequence. The sequence is only a hint and is never dispatched as a feasibility claim. Final routes require valid identities, complete road transitions and depot return, consistent traffic-adjusted timing, actual departures, geometry and selected hard caps. Traffic-infeasible routes are excluded. Invalid, skipped and unverified rows remain explicitly unassigned.

Expansion and dense-slot compaction use real departure windows. After compaction, recovery retains verified trips and requests only outstanding rows in subsequent rider slots. No-progress grouping opportunities are finite; provider errors stop further attempts. Equivalent requests are memoized per plan. There is no fixed total API quota or automatic frontend resubmission. Routing uses plain fetch with a 75-second network timeout, a 70-second server timeout header, and solver budgets of 30 seconds for the seed and 60 seconds for joint requests.

The overview uses stored road geometry and coordinates without additional routing requests. Missing geometry displays markers only. The external full-route URL preserves the depot/stop order, but Google Maps may limit stops or recalculate. Saved per-order map URLs remain distinct by verified row identity; missing or unsafe URLs are not fabricated.

## Status safety

Generation is read-only. Only explicit Apply and confirmation invoke the existing Sheets-backed order-status flow. Plans retain row snapshots, expire after 30 minutes, and refuse stale/moved/edited rows. Alternative Best plans have separate tokens and a shared submission guard. A lost or partial write response is reported without automatic retries. The existing shared Order Route Summary remains unchanged.

## Configuration

Reuse existing depot, Sheets schema, Google project/authentication and routing endpoint configuration. No credentials belong in this feature or its fixtures. Live provider permissions, API support and real-world route quality must be verified through the operator's authorized workflow.

Google reference: https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/ShipmentRoute

## Tests

Run `npm test` for mocked backend planning/status tests. They cover shuffled batches, independent caps, departure scheduling, traffic failures, partial coverage, finite recovery and stale-row safeguards. No live Sheets or routing calls are made.

For the frontend integration harness, clone the frontend and backend as sibling directories named `delivery_management_fe` and `lang_lat_extract_node`. Run the frontend's pure tests and optional planner render/browser commands described in its test README. All integration orders and provider results are synthetic; live APIs are not forwarded.
