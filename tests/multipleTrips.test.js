import test from 'node:test';
import assert from 'node:assert/strict';
import { planConfiguredTrips, mapsSegments } from '../helpers/multipleTrips.js';
import { resolveDeparture } from '../helpers/tripDeparture.js';
import { createTripService, googleRoadSeconds } from '../services/multipleTrips.js';
const departure = { day: 'Saturday', hour: '08', minute: '15', ampm: 'AM' };
const time = '2026-11-28T02:45:00.000Z';
const now = () => Date.parse('2026-11-26T20:00:00Z');
const limits = { serviceMinutes: 5, maxHours: 1, maxDistanceKm: 36 };
const depot = '17,78';
// Existing boundary regressions allow enough identical configured trips; new
// tests below exercise the exact configured-count production contract.
async function planTrips(orders, limits, depot, road, departureTime) {
 const result = await planConfiguredTrips(orders, Array.from({ length: Math.max(1, orders.length) }, () => ({ limits, departureTime })), depot, road);
 return { ...result, trips: result.trips.filter(trip => trip.stops.length) };
}
const road = async () => ({ seconds: 60, meters: 1000, trafficAware: true });
const stop = (rowId, curd = 10) => ({ rowId, name: 'Same Name', address: `Fixture ${rowId}`, status: 1, latLng: `17.0${rowId},78`, curd, cc: 2 });

test('India departure includes future today and rolls over past or equal time', () => {
  assert.equal(resolveDeparture(departure, now()), time);
  assert.equal(resolveDeparture(departure, Date.parse('2026-11-28T02:44:59Z')), time);
  assert.equal(resolveDeparture(departure, Date.parse(time)), '2026-12-05T02:45:00.000Z');
  assert.equal(resolveDeparture({ day: 'Friday', hour: '12', minute: '00', ampm: 'AM' }, Date.parse('2026-12-31T17:00:00Z')), '2026-12-31T18:30:00.000Z');
  assert.equal(resolveDeparture({ day: 'Friday', hour: '12', minute: '00', ampm: 'PM' }, Date.parse('2026-12-31T20:00:00Z')), '2027-01-01T06:30:00.000Z');
  assert.throws(() => resolveDeparture({ ...departure, minute: '16' }, now()));
});
test('all rows accounted once, road distance and service plus depot return included', async () => {
  const rows = [stop(2,18), stop(3,18), stop(4,1), stop(5,40), { ...stop(6), latLng: '' }];
  const p = await planTrips(rows, limits, depot, road, time);
  assert.equal(p.trips.length, 1);
  assert.equal(p.assignedCount, 4);
  assert.equal(p.unassigned.length, 1);
  assert.deepEqual(p.trips.flatMap(t => t.stops).concat(p.unassigned).map(s => s.rowId).sort(), [2,3,4,5,6]);
  for (const trip of p.trips) {
    assert.ok(trip.totalMeters <= 36000);
    assert.equal(trip.totalSeconds, (trip.stops.length + 1) * 60 + trip.stops.length * 300);
    assert.equal(trip.totalMeters, (trip.stops.length + 1) * 1000);
    assert.equal(trip.totalIcecream, trip.stops.length * 2);
  }
});
test('return to depot makes singleton infeasible and boundary is inclusive', async () => {
  const p = await planTrips([stop(2)], { ...limits, maxHours: 7/60 }, depot, road, time);
  assert.equal(p.assignedCount, 1);
  const q = await planTrips([stop(2)], { ...limits, maxHours: 6.99/60 }, depot, road, time);
  assert.equal(q.assignedCount, 0);
});
test('icecream has no capacity constraint, invalid and missing roads remain accounted', async () => {
  const p = await planTrips([{ ...stop(2,0), cc: 10000 }, { ...stop(3), curd: -1 }], limits, depot, road, time);
  assert.equal(p.trips[0].totalIcecream, 10000);
  assert.equal(p.unassigned.length, 1);
  const unavailable=await planTrips([stop(2)], limits, depot, async () => { throw Error('no route'); }, time);
  assert.equal(unavailable.assignedCount,0);assert.equal(unavailable.unassigned.length,1);assert.equal(unavailable.verificationStatus,'partial-provider-failure');
});
test('four-customer loop segments preserve order and every edge, within mobile limits', () => {
  const stops = [2,3,4,5].map(n => stop(n));
  const links = mapsSegments(depot, stops);
  assert.equal(links.length, 2);
  const reconstructed = [];
  links.forEach((link, i) => {
    assert.ok(link.url.length <= 2048);
    const p = new URL(link.url).searchParams;
    const intermediates = p.get('waypoints')?.split('|') ?? [];
    assert.ok(intermediates.length <= 3);
    const points = [p.get('origin'), ...intermediates, p.get('destination')];
    if (i) assert.equal(reconstructed.at(-1), points.shift());
    reconstructed.push(...points);
    assert.equal(p.get('travelmode'), 'two-wheeler');
    assert.equal(p.has('departureTime'), false);
  });
  assert.deepEqual(reconstructed, [depot, ...stops.map(s => s.latLng), depot]);
});
test('traffic request carries chosen time; fallback keeps TWO_WHEELER and labels static', async () => {
  const calls = [];
  const result = await googleRoadSeconds(depot, '17.1,78.1', time, async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) return { status:400, ok:false };
    return { ok:true, json:async () => ({ routes:[{ duration:'61.5s', distanceMeters:1234 }] }) };
  });
  assert.deepEqual(result, { seconds:61.5, meters:1234, trafficAware:false, encodedPolyline:'' });
  assert.equal(calls[0].departureTime, time);
  assert.equal(calls[0].routingPreference, 'TRAFFIC_AWARE');
  assert.ok(calls.every(c => c.travelMode === 'TWO_WHEELER'));
  assert.equal(calls[1].departureTime, undefined);
});
test('road leg departures advance with travel and service, mixed fallback labels trip', async () => {
  const times = [];
  const result = await planTrips([stop(2)], limits, depot, async (from,to,at) => { times.push(at); return { seconds:60, meters:1000, trafficAware:from === depot }; }, time);
  assert.ok(times.includes('2026-11-28T02:51:00.000Z'));
  assert.equal(result.trips[0].trafficAware, false);
});
function serviceFixture(rowsInput = [stop(2),stop(3)]) {
  let rows = structuredClone(rowsInput), writes = [];
  const service = createTripService({ depot, route:road, now, read: async ids => ids.map(id => structuredClone(rows.find(r => r.rowId === id))), write:async body => { writes.push(body); rows.forEach(r => { if (body.rowIds.includes(r.rowId)) r.status = body.statusValue; }); } });
  return { service, writes, setRows: value => { rows=value; }, body:{ orders:structuredClone(rows), trips:[{limits,departure},{limits,departure}] } };
}
test('planning writes nothing; same-name rows retain identities; explicit reservation targets only trip', async () => {
  const f = serviceFixture([stop(2,30),stop(3,30)]);
  f.body.trips.forEach(t=>t.limits={...t.limits,maxDistanceKm:2});
  const p = await f.service.plan(f.body);
  assert.equal(f.writes.length, 0);
  assert.equal(p.trips.length, 2);
  const result = await f.service.reserve({ planId:p.planId, tripIndex:0, statusValue:4 });
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(f.writes[0].rowIds, [2]);
  await assert.rejects(f.service.reserve({ planId:p.planId, tripIndex:0, statusValue:5 }));
});
test('same-name reorder or edited row refuses reservation without a write', async () => {
  for (const changed of [[{...stop(3),rowId:2},{...stop(2),rowId:3}], [{...stop(2),curd:11},stop(3)]]) {
    const f=serviceFixture(); const p=await f.service.plan(f.body); f.setRows(changed);
    await assert.rejects(f.service.reserve({planId:p.planId,tripIndex:0,statusValue:4}), /changed or moved/);
    assert.equal(f.writes.length,0);
  }
});
test('stale status snapshot and invalid requested status values refuse safely', async () => {
  const f=serviceFixture(); f.setRows([{...stop(2),status:3},stop(3)]);
  await assert.rejects(f.service.plan(f.body));
  assert.equal(f.writes.length,0);
  await assert.rejects(f.service.reserve({planId:'unknown',tripIndex:0,statusValue:10}));
});
test('partial write is individually verified; no automatic retry', async () => {
  let rows=[stop(2),stop(3)]; let writes=0;
  const s=createTripService({depot,route:road,now,read:async ids=>ids.map(id=>({...rows.find(r=>r.rowId===id)})),write:async()=>{writes++;rows[0].status=4;throw Error('connection lost');}});
  const p=await s.plan({orders:rows.map(r=>({...r})),trips:[{limits,departure}]});
  const result=await s.reserve({planId:p.planId,tripIndex:0,statusValue:4});
  assert.equal(result.outcome,'partial-or-unknown');
  assert.deepEqual(result.results.map(r=>r.outcome),['updated','not-confirmed']);
  await assert.rejects(s.reserve({planId:p.planId,tripIndex:0,statusValue:4}));
  assert.equal(writes,1);
});

test('every existing order status is accepted only on explicit submission', async () => {
  for (let statusValue=1;statusValue<=9;statusValue++) {
    const f=serviceFixture([stop(2)]);const p=await f.service.plan(f.body);
    assert.equal(f.writes.length,0);
    const result=await f.service.reserve({planId:p.planId,tripIndex:0,statusValue});
    assert.equal(result.outcome,'updated');assert.equal(f.writes[0].statusValue,statusValue);
  }
});
test('original row snapshot survives coordinate normalization in route results', async () => {
  const f=serviceFixture([{...stop(2),latLng:'17.0200, 78.0000'}]);
  const p=await f.service.plan(f.body);
  assert.equal(p.trips[0].stops[0].latLng,'17.02,78');
  assert.equal((await f.service.reserve({planId:p.planId,tripIndex:0,statusValue:3})).outcome,'updated');
});
test('invalid limits and duplicate row identities are rejected', async () => {
  await assert.rejects(planTrips([stop(2)],{...limits,maxDistanceKm:0},depot,road,time));
  const f=serviceFixture();await assert.rejects(f.service.plan({...f.body,orders:[stop(2),stop(2)]}));
});

test('exact configured count: one trip never auto-creates overflow trips', async () => {
  const rows=[stop(2,8),stop(3,8),stop(4,8),stop(5,8)];
  const configs=[{limits:{...limits,maxDistanceKm:3},departureTime:time}];
  const one=await planConfiguredTrips(rows,configs,depot,road);
  assert.equal(one.trips.length,1);assert.equal(one.assignedCount,2);assert.equal(one.unassigned.length,2);
  const two=await planConfiguredTrips(rows,[...configs,...configs],depot,road);
  assert.equal(two.trips.length,2);assert.equal(two.assignedCount,4);assert.equal(two.unassigned.length,0);
  assert.deepEqual(two.trips.map(t=>t.totalCurd),[16,16]);
  assert.equal(new Set(two.trips.flatMap(t=>t.stops.map(s=>s.rowId))).size,4);
});
test('heterogeneous trips use independent road-distance, service, hours and departure dates', async () => {
  const configs=[
    {limits:{serviceMinutes:2,maxHours:0.1,maxDistanceKm:2},departureTime:time},
    {limits:{serviceMinutes:10,maxHours:1,maxDistanceKm:3},departureTime:'2026-11-29T13:00:00.000Z'}
  ];
  const calls=[];
  const result=await planConfiguredTrips([stop(2,20),stop(3,8),stop(4,8)],configs,depot,async(from,to,departure)=>{calls.push(departure);return {seconds:60,meters:1000,trafficAware:true};});
  assert.equal(result.trips.length,2);
  assert.equal(result.assignedCount,3);
  assert.equal(result.trips[0].stops.length,1);
  assert.equal(result.trips[0].totalMeters,2000);
  assert.equal(new Set(result.trips.flatMap(t=>t.stops.map(s=>s.rowId))).size,3);
  assert.equal(result.trips[0].totalSeconds,240);
  assert.equal(result.trips[1].stops.length,2);
  assert.equal(result.trips[1].totalSeconds,1380);
  assert.equal(result.trips[1].totalMeters,3000);
  assert.equal(result.trips[1].departureTime,configs[1].departureTime);
  assert.ok(calls.includes('2026-11-29T13:11:00.000Z'));
  result.trips.forEach(t=>assert.ok(t.totalSeconds<=t.limits.maxHours*3600 && t.totalMeters<=t.limits.maxDistanceKm*1000));
});
test('empty configured trips remain visible, and no orders are duplicated or dropped', async()=>{
  const configs=Array.from({length:3},()=>({limits,departureTime:time}));
  const result=await planConfiguredTrips([stop(2),{...stop(3),latLng:''}],configs,depot,road);
  assert.equal(result.trips.length,3);assert.equal(result.trips.filter(t=>!t.stops.length).length,2);
  result.trips.filter(t=>!t.stops.length).forEach(t=>{assert.equal(t.totalSeconds,0);assert.deepEqual(t.mapsLinks,[]);});
  assert.equal(result.assignedCount+result.unassigned.length,2);
  await assert.rejects(planConfiguredTrips([stop(2)],[],depot,road),/at least one trip/);
});
test('service resolves each configured weekday separately and empty trips cannot write',async()=>{
  const f=serviceFixture([stop(2)]);
  const p=await f.service.plan({...f.body,trips:[{limits,departure},{limits,departure:{day:'Sunday',hour:'06',minute:'30',ampm:'PM'}}]});
  assert.equal(p.trips.length,2);
  assert.equal(p.trips[0].departureTime,time);
  assert.equal(p.trips[1].departureTime,'2026-11-29T13:00:00.000Z');
  await assert.rejects(f.service.reserve({planId:p.planId,tripIndex:1,statusValue:4}),/no assigned orders/);
  assert.equal(f.writes.length,0);
});

test('77 shuffled orders fit three 100km trips, with curd totals informational only',async()=>{
  const depot='17.4,78.4';
  const rows=Array.from({length:77},(_,i)=>{const angle=(i%2===0?i%8:(i%8)+4)*Math.PI/4;return {rowId:i+2,name:`Synthetic ${i+1}`,curd:i<27?2:1,latLng:`${17.4+.09*Math.cos(angle)},${78.4+.094*Math.sin(angle)}`};});
  const configs=Array.from({length:3},(_,i)=>({limits:{serviceMinutes:7,maxHours:9,maxDistanceKm:100},departureTime:i===2?'2026-11-29T02:30:00.000Z':'2026-11-28T02:30:00.000Z'}));
  const road=async(from,to)=>{const a=from.split(',').map(Number),b=to.split(',').map(Number);const km=Math.hypot((a[0]-b[0])*111,(a[1]-b[1])*106)*1.3;return {seconds:km/25*3600,meters:km*1000,trafficAware:false};};
  let baseline;
  for(let seed=0;seed<5;seed++){
    const shuffled=[...rows].sort((a,b)=>((a.rowId*37+seed*13)%79)-((b.rowId*37+seed*13)%79));
    const result=await planConfiguredTrips(shuffled,configs,depot,road);
    assert.equal(result.assignedCount,77);assert.equal(result.unassigned.length,0);
    assert.equal(new Set(result.trips.flatMap(t=>t.stops.map(s=>s.rowId))).size,77);
    result.trips.forEach(t=>{assert.ok(t.totalMeters<=100000);assert.ok(t.totalSeconds<=9*3600);assert.ok(Math.abs(t.stops.length*7*60-(t.totalSeconds-t.roadSeconds))<0.00001);});
    const signature=result.trips.map(t=>t.stops.map(s=>s.rowId));
    if(baseline)assert.deepEqual(signature,baseline);else baseline=signature;
  }
});

test('Google omitted default distanceMeters is a valid zero-distance route',async()=>{
  const result=await googleRoadSeconds('17,78','17.00001,78',time,async()=>({ok:true,json:async()=>({routes:[{duration:'0s'}]})}));
  assert.equal(result.seconds,0);assert.equal(result.meters,0);
});
test('co-located distinct orders do not call provider for their zero road leg',async()=>{
  let calls=0;
  const zero=await googleRoadSeconds('17.000, 78','17,78',time,async()=>{calls++;throw Error('should not call');});
  assert.equal(calls,0);assert.equal(zero.seconds,0);assert.equal(zero.meters,0);
  const result=await planConfiguredTrips([{...stop(2),latLng:depot},{...stop(3),latLng:depot}],[{limits,departureTime:time}],depot,(a,b,t)=>googleRoadSeconds(a,b,t,async()=>{throw Error('should not call');}));
  assert.equal(result.assignedCount,2);assert.equal(result.trips[0].totalSeconds,600);assert.equal(result.trips[0].totalMeters,0);
});
test('no route and invalid response are classified separately',async()=>{
  await assert.rejects(googleRoadSeconds(depot,'17.1,78',time,async()=>({ok:true,json:async()=>({routes:[]})})),error=>error.code==='NO_ROAD_ROUTE');
  await assert.rejects(googleRoadSeconds(depot,'17.1,78',time,async()=>({ok:true,json:async()=>({routes:[{duration:'bad',distanceMeters:10}]})})),error=>error.code==='ROAD_RESPONSE_INVALID');
});
test('isolated unreachable stop leaves other fully verified trips usable',async()=>{
  const rows=[stop(2),stop(3),stop(4)];const bad=rows[2].latLng;
  const result=await planConfiguredTrips(rows,Array.from({length:3},()=>({limits:{...limits,maxDistanceKm:2},departureTime:time})),depot,async(from,to)=>{if(from===bad||to===bad)throw Object.assign(Error('No road route'),{code:'NO_ROAD_ROUTE'});return road();});
  assert.equal(result.assignedCount,2);assert.equal(result.unassigned.length,1);assert.equal(result.unassigned[0].rowId,4);
  assert.ok(result.unassigned[0].reason.includes('No two-wheeler road route'));
  assert.equal(new Set(result.trips.flatMap(t=>t.stops.map(s=>s.rowId))).size,2);
});
test('later provider failure preserves verified trips and labels remaining orders unverified',async()=>{
  let calls=0;const result=await planConfiguredTrips([stop(2,30),stop(3,30)],[{limits:{...limits,maxDistanceKm:2,maxHours:7/60},departureTime:time},{limits:{...limits,maxDistanceKm:2,maxHours:7/60},departureTime:time}],depot,async()=>{if(++calls>2)throw Object.assign(Error('Google road request failed (HTTP 429)'),{code:'ROAD_PROVIDER_HTTP'});return road();});
  assert.equal(result.assignedCount,1);assert.equal(result.unassigned.length,1);assert.equal(result.verificationStatus,'partial-provider-failure');
  assert.ok(result.unassigned[0].reason.includes('not proven infeasible'));
  assert.ok(result.verificationWarnings.join(' ').includes('429'));
});

test('road distance includes depot return, accepts exact bound and rejects one metre over',async()=>{
  const config={limits:{...limits,maxDistanceKm:2},departureTime:time};
  const exact=await planConfiguredTrips([stop(2,100000)],[config],depot,road);
  assert.equal(exact.assignedCount,1);assert.equal(exact.trips[0].totalMeters,2000);assert.equal(exact.trips[0].totalCurd,100000);
  const over=await planConfiguredTrips([stop(2,100000)],[{...config,limits:{...config.limits,maxDistanceKm:1.999}}],depot,road);
  assert.equal(over.assignedCount,0);assert.equal(over.unassigned.length,1);
  assert.ok(over.unassigned[0].reason.includes('maximum depot-to-depot road distance'));
  assert.ok(!over.unassigned[0].reason.includes('provider'));
});
test('distance and hours must both pass; curd quantity does not affect assignment',async()=>{
  const configs=[{limits:{serviceMinutes:5,maxHours:1,maxDistanceKm:2},departureTime:time},{limits:{serviceMinutes:5,maxHours:1,maxDistanceKm:4},departureTime:'2026-11-29T02:30:00Z'}];
  const low=await planConfiguredTrips([stop(2,1),stop(3,1),stop(4,1)],configs,depot,road);
  const high=await planConfiguredTrips([stop(2,9999),stop(3,9999),stop(4,9999)],configs,depot,road);
  assert.equal(high.assignedCount,3);assert.deepEqual(high.trips.map(t=>t.stops.map(s=>s.rowId)),low.trips.map(t=>t.stops.map(s=>s.rowId)));
  high.trips.forEach(t=>{assert.ok(t.totalMeters<=t.limits.maxDistanceKm*1000);assert.ok(t.totalSeconds<=t.limits.maxHours*3600);});
  const hours=await planConfiguredTrips([stop(2)],[{limits:{serviceMinutes:60,maxHours:1,maxDistanceKm:1000},departureTime:time}],depot,road);
  assert.equal(hours.assignedCount,0);assert.ok(hours.unassigned[0].reason.includes('maximum working hours'));
});

test('planning accepts every existing order status without writing status',async()=>{
  const rows=Array.from({length:9},(_,i)=>({...stop(i+2),status:i+1}));
  const f=serviceFixture(rows);const plan=await f.service.plan(f.body);
  assert.equal(plan.assignedCount,9);assert.equal(plan.unassigned.length,0);assert.equal(f.writes.length,0);
  assert.deepEqual(plan.trips.flatMap(t=>t.stops.map(s=>s.rowId)).sort((a,b)=>a-b),rows.map(r=>r.rowId));
});
test('non-Placed filtered subset stays exact and never expands to other sheet rows',async()=>{
  const sheet=[{...stop(2),status:1},{...stop(3),status:3},{...stop(4),status:4},{...stop(5),status:9}];
  const requested=[sheet[1],sheet[3]],reads=[];let writes=0;
  const service=createTripService({depot,route:road,now,read:async ids=>{reads.push([...ids]);return ids.map(id=>({...sheet.find(r=>r.rowId===id)}));},write:async()=>{writes++;}});
  const result=await service.plan({orders:requested,trips:[{limits,departure}]});
  assert.deepEqual(reads,[[3,5]]);assert.deepEqual(result.trips.flatMap(t=>t.stops.map(s=>s.rowId)).sort(),[3,5]);assert.equal(writes,0);
});
test('non-Placed status edits after planning still prevent stale writes',async()=>{
  const f=serviceFixture([{...stop(2),status:3}]);const result=await f.service.plan(f.body);
  f.setRows([{...stop(2),status:4}]);
  await assert.rejects(f.service.reserve({planId:result.planId,tripIndex:0,statusValue:5}),/changed or moved/);
  assert.equal(f.writes.length,0);
});
