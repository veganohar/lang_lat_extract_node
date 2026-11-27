import { resolvePlanningStart } from '../helpers/planningSchedule.js';
import { autoSplitTrips, validateAutoLimits } from '../helpers/autoSplitTrips.js';
import { googleAutoOptimize } from './autoTripProvider.js';
import { resolveDeparture } from '../helpers/tripDeparture.js';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { ORDER_SHEET, getSheetRange, mapSheetRow } from '../data/sheetSchema.js';
import { planConfiguredTrips, validateLimits } from '../helpers/multipleTrips.js';
const config = JSON.parse(await readFile(new URL('../config/config.json', import.meta.url)));

export function fingerprint(order, omitStatus = false) {
  return createHash('sha256').update(JSON.stringify(ORDER_SHEET.fields.filter(f => !omitStatus || f.key !== 'status').map(f => [f.key, order[f.key] ?? (f.type === 'number' ? 0 : '')]))).digest('hex');
}
export async function readRows(rowIds) {
  const { readSheetinRanges } = await import('../utils/readWriteSheetsUtil.js');
  const data = await readSheetinRanges(rowIds.map(row => getSheetRange(ORDER_SHEET, { startRow: row, endRow: row })), config.customersSheetId);
  return rowIds.map((rowId, i) => ({ rowId, ...mapSheetRow(data[i]?.values?.[0] || [], ORDER_SHEET) }));
}
export async function googleRoadSeconds(from, to, departureTime, fetcher = fetch) {
  // Co-located orders remain distinct service stops, but require no road leg.
  if (from.split(',').map(Number).join(',') === to.split(',').map(Number).join(',')) return { seconds: 0, meters: 0, trafficAware: true, encodedPolyline: '' };
  const failure = (code, message) => Object.assign(new Error(message), { code });
  const point = value => {
    const [latitude, longitude] = value.split(',').map(Number);
    return { location: { latLng: { latitude, longitude } } };
  };
  const request = async trafficAware => {
    const body = { origin: point(from), destination: point(to), travelMode: 'TWO_WHEELER', routingPreference: trafficAware ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE' };
    if (trafficAware) body.departureTime = departureTime;
    return fetcher(config.routesUrl, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAP_API_KEY, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
      body: JSON.stringify(body)
    });
  };
  let trafficAware = true;
  let response = await request(true);
  // Unsupported traffic options are INVALID_ARGUMENT. Other provider failures
  // remain failures; never silently switch to car routes or estimated straight lines.
  if (response.status === 400) { trafficAware = false; response = await request(false); }
  if (!response.ok) throw failure('ROAD_PROVIDER_HTTP', 'Google road request failed (HTTP ' + response.status + ')');
  const data = await response.json(), route = data.routes?.[0];
  if (!route) throw failure('NO_ROAD_ROUTE', 'Google returned no two-wheeler road route for this leg');
  const meters = route.distanceMeters ?? 0; // Proto3 omits default numeric zero.
  if (!/^\d+(\.\d+)?s$/.test(route.duration ?? '') || !Number.isFinite(meters) || meters < 0) throw failure('ROAD_RESPONSE_INVALID', 'Google road response had invalid duration or distance');
  return { seconds: Number(route.duration.slice(0, -1)), meters, trafficAware, encodedPolyline: route.polyline?.encodedPolyline || "" };
}

async function writeStatus(body) {
  const { updateOrderStatus } = await import('./orders.js');
  return updateOrderStatus(body);
}

// In-memory tokens expire; no plan or rider information is written to Sheets.
export function createTripService({ read = readRows, route = googleRoadSeconds, write = writeStatus, depot = config.baseCoords, now = Date.now, autoOptimize = googleAutoOptimize } = {}) {
  const plans = new Map();
  return {
    async plan(body) {
      for (const [key, plan] of plans) if (plan.expires < now()) plans.delete(key);
      const requested = body.orders;
      if (!Array.isArray(requested) || !requested.length || requested.some(o => !Number.isInteger(o.rowId) || o.rowId < 2) || new Set(requested.map(o => o.rowId)).size !== requested.length) throw new Error('Invalid or duplicate sheet rows');
      const auto=body.mode==='auto';
      let configurations,autoOptions;
      if(auto){validateAutoLimits(body.auto??{});autoOptions={...body.auto,departureTime:resolvePlanningStart(body.auto.departure,now())};}
      else{
        if (!Array.isArray(body.trips) || !body.trips.length) throw new Error('Add at least one trip');
        configurations = body.trips.map(trip => ({ limits: trip.limits, departureTime: resolveDeparture(trip.departure, now()) }));
        configurations.forEach(trip => validateLimits(trip.limits));
      }
      const rows = await read(requested.map(o => o.rowId));
      if (rows.some((o, i) => fingerprint(o) !== fingerprint(requested[i]))) throw new Error('Orders changed or moved. Refresh the order list and plan again.');
      const result = auto ? await autoSplitTrips(rows,autoOptions,depot,autoOptimize) : await planConfiguredTrips(rows, configurations, depot, route);
      if (auto) {
        const complete = view => view.assignedCount === rows.length && view.unassigned.length === 0;
        if (!complete(result)) throw new Error('No complete plan could be verified within the allowed limits. No partial plan was saved. Increase the limits or deviation and plan again.');
        if (result.candidates) {
          result.candidates = result.candidates.map(candidate => candidate.status === 'unavailable' || complete(candidate) ? candidate : {
            ...candidate, status: 'unavailable', trips: [], assignedCount: 0,
            reason: 'No complete plan was verified: ' + candidate.assignedCount + '/' + rows.length + ' orders covered. ' +
              [...new Set(candidate.unassigned.map(row => row.reason))].join(' '),
            diagnostics: {
              uncoveredRows: candidate.unassigned.map(row => ({ rowId: row.rowId, reason: row.reason })),
              attemptedTripCount: candidate.trips.length,
              recoveryAttempts: candidate.outstandingRecoveryAttempts ?? 0
            }
          });
          result.comparison = result.comparison.map(candidate => result.candidates.find(view => view.objective === candidate.objective));
        }
      }
      const group={selected:null};
      const register=(view,key)=>{const planId=randomUUID();plans.set(planId,{expires:now()+30*60*1000,group,key,trips:view.trips.map(t=>({rows:t.stops.map(stop=>rows.find(row=>row.rowId===stop.rowId)),verified:t.verificationStatus==='verified'||!auto,state:'ready'}))});return {...view,planId};};
      const candidates=result.candidates?.map(candidate=>candidate.status==='unavailable'?candidate:register(candidate,candidate.objective));
      const selected=candidates?.find(candidate=>candidate.objective===result.winner);
      return candidates?{...result,candidates,planId:selected?.planId}:register(result,'default');
    },
    async reserve({ planId, tripIndex, statusValue }) {
      if (!Number.isInteger(statusValue) || statusValue < 1 || statusValue > 9) throw new Error('Choose an existing order status');
      const plan = plans.get(planId), trip = plan?.trips[tripIndex];
      if (!plan || plan.expires < now() || !trip || !Number.isInteger(tripIndex)) throw new Error('Plan expired. Generate a new plan.');
      if (!trip.verified) throw new Error('This trip has not been verified');
      if(plan.group.selected!==null&&plan.group.selected!==plan.key)throw new Error('Another candidate was already submitted. Refresh and plan again.');
      if (!trip.rows.length) throw new Error('This trip has no assigned orders');
      if (trip.state !== 'ready') throw new Error('Trip already submitted. Refresh before retrying.');
      plan.group.selected=plan.key;
      trip.state = 'checking';
      let rows;
      try { rows = await read(trip.rows.map(o => o.rowId)); }
      catch (error) { trip.state = 'ready'; throw error; }
      if (rows.some((o, i) => fingerprint(o) !== fingerprint(trip.rows[i]))) { trip.state = 'stale'; throw new Error('Trip rows changed or moved. Refresh and generate a new plan.'); }
      plan.group.selected=plan.key;
      trip.state = 'submitted';
      let writeError = false;
      try { await write({ statusType: 'order', rowIds: rows.map(o => o.rowId), statusValue }); }
      catch { writeError = true; }
      let after;
      try { after = await read(rows.map(o => o.rowId)); }
      catch { return { outcome: 'unknown', message: 'Write submitted, but verification failed. Refresh the list before taking further action.', results: rows.map(o => ({ rowId: o.rowId, name: o.name, outcome: 'unknown' })) }; }
      const results = after.map((o, i) => ({ rowId: o.rowId, name: rows[i].name, outcome: fingerprint(o, true) !== fingerprint(rows[i], true) ? 'unknown' : Number(o.status) === statusValue ? 'updated' : 'not-confirmed' }));
      const complete = results.every(r => r.outcome === 'updated');
      return { outcome: complete ? 'updated' : 'partial-or-unknown', results, message: complete ? 'All trip stops verified in the selected order status.' : `Status change was not fully confirmed${writeError ? ' after a write error' : ''}. Refresh the list; do not blindly retry.` };
    }
  };
}
export const multipleTrips = createTripService();
