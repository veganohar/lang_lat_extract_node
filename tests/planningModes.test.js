import {createTripService} from '../services/multipleTrips.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {autoSplitTrips,autoRequest,parseAutoResponse,compareVerifiedCandidates} from '../helpers/autoSplitTrips.js';
import {riderSlot,resolvePlanningStart} from '../helpers/planningSchedule.js';
import {fixtureAutoOptimize} from './autoSplitFixtureProvider.js';
const depot='17.4,78.4',start='2026-11-28T02:30:00.000Z';
const options={maxHours:10,maxDistanceKm:100,maxCurd:40,serviceMinutes:7,riderCount:2,departureTime:start};
const rows=n=>Array.from({length:n},(_,i)=>({rowId:i+2,name:'Synthetic '+i,latLng:(17.4+i/10000)+',78.4',curd:1,cc:2,amount:130}));

test('single-cap modes impose only their corresponding cap, Hybrid/Best impose all three',()=>{
  for(const strategy of ['time','distance','capacity','hybrid','best']){
    const request=autoRequest(rows(5),{...options,strategy},depot,2),vehicle=request.model.vehicles[0],all=['hybrid','best'].includes(strategy);
    assert.equal(Boolean(vehicle.routeDurationLimit),strategy==='time'||all);assert.equal(Boolean(vehicle.routeDistanceLimit),strategy==='distance'||all);assert.equal(Boolean(vehicle.loadLimits?.curd),strategy==='capacity'||all);
    assert.equal(vehicle.loadLimits?.icecream,undefined);assert.equal(request.model.shipments[0].loadDemands?.icecream,undefined);
  }
});
test('Best plan uses one shared sequence and genuinely distinct jointly capped objectives',async()=>{
  const calls=[];const result=await autoSplitTrips(rows(77),{...options,strategy:'best'},depot,async request=>{calls.push(request);return fixtureAutoOptimize(request);});
  assert.equal(calls.filter(r=>r.label==='frostie-sequence').length,1);assert.equal(calls.length,4);assert.equal(result.providerCalls,4);
  const joint=calls.slice(1);assert.equal(new Set(joint.map(r=>r.label)).size,3);
  assert.equal(new Set(joint.map(r=>JSON.stringify([r.model.vehicles[0].costPerHour,r.model.vehicles[0].costPerKilometer,r.model.vehicles[0].fixedCost]))).size,3);
  joint.forEach(request=>request.model.vehicles.forEach(vehicle=>{assert.equal(vehicle.routeDurationLimit.maxDuration,'36000s');assert.equal(vehicle.routeDistanceLimit.maxMeters,'100000');assert.equal(vehicle.loadLimits.curd.maxLoad,'40000');}));
  assert.equal(result.assignedCount,77);assert.equal(result.comparison.length,3);assert.ok(result.comparison.every(c=>c.status==='complete'));assert.ok(result.winner);
});
test('candidate ranking prioritizes complete coverage then lowest road distance, trips and time',()=>{
  const base={status:'complete',fullCoverage:true,assignedCount:10,tripCount:2,combinedMeters:20000,totalSeconds:10000};
  const candidates=[{...base,objective:'partial',status:'incomplete',fullCoverage:false,assignedCount:9,tripCount:1,combinedMeters:1,totalSeconds:1},{...base,objective:'more-trips',tripCount:3,combinedMeters:1,totalSeconds:1},{...base,objective:'more-road',combinedMeters:30000,totalSeconds:1},{...base,objective:'slower',totalSeconds:20000},{...base,objective:'winner'},{objective:'outage',status:'unavailable'}];
  candidates.sort(compareVerifiedCandidates);assert.equal(candidates[0].objective,'more-trips');assert.equal(candidates.at(-1).objective,'outage');
});
test('all caps reject violations in a verified provider result, including curd capacity',()=>{
  const input=rows(3),request=autoRequest(input,{...options,strategy:'hybrid'},depot,1),valid=fixtureAutoOptimize(request);
  for(const mutate of [r=>{r.routes[0].transitions[0].travelDistanceMeters=100001;},r=>{r.routes[0].vehicleEndTime='2026-11-28T13:00:00Z';}]){const response=structuredClone(valid);mutate(response);assert.throws(()=>parseAutoResponse(response,input,{...options,strategy:'hybrid'},depot,1));}
  assert.throws(()=>parseAutoResponse(valid,input.map(r=>({...r,curd:100})),{...options,strategy:'hybrid'},depot,1),/curd-box/);
});
test('two riders and four trips cross Saturday/Sunday with true provider time windows',async()=>{
  const calls=[];const result=await autoSplitTrips(rows(8),{...options,strategy:'capacity',maxCurd:2},depot,async request=>{calls.push(request);return fixtureAutoOptimize(request);});
  assert.equal(result.trips.length,4);
  assert.deepEqual(result.trips.map(t=>t.departureTime),[start,start,'2026-11-29T02:30:00.000Z','2026-11-29T02:30:00.000Z']);
  assert.deepEqual(result.trips.map(t=>t.riderSlot),[1,2,1,2]);
  assert.equal(new Set(result.trips.map(t=>t.dayIndex+':'+t.riderSlot)).size,4);
  assert.deepEqual(calls[1].model.vehicles.map(v=>v.startTimeWindows[0].startTime),result.trips.map(t=>t.departureTime));
});
test('unused day gaps trigger a new Google solve at compacted dates, never display relabeling',async()=>{
  const calls=[];const result=await autoSplitTrips(rows(4),{...options,strategy:'time',maxHours:.5},depot,async request=>{
    calls.push(request);const response=fixtureAutoOptimize(request);
    if(request.label!=='frostie-sequence'&&request.model.vehicles.length===4&&response.routes.length===2){
      const moved=response.routes[1];moved.vehicleIndex=2;
      for(const key of ['vehicleStartTime','vehicleEndTime'])moved[key]=new Date(Date.parse(moved[key])+86400000).toISOString();
      moved.visits.forEach(v=>{v.startTime=new Date(Date.parse(v.startTime)+86400000).toISOString();});
    }
    return response;
  });
  assert.equal(result.assignedCount,4);assert.equal(calls.length,4);assert.deepEqual(result.trips.map(t=>t.departureTime),[start,start]);assert.equal(result.scheduleCompactions,1);
  assert.equal(calls.at(-1).model.vehicles[1].startTimeWindows[0].startTime,start);
});
test('Best Plan provider failure stops further outbound attempts and marks comparisons unavailable',async()=>{
  let calls=0;const result=await autoSplitTrips(rows(10),{...options,strategy:'best'},depot,async request=>{calls++;if(request.label!=='frostie-sequence')throw Error('fixture provider down');return fixtureAutoOptimize(request);});
  assert.equal(calls,2);assert.equal(result.providerCalls,2);assert.equal(result.winner,null);assert.equal(result.assignedCount,0);assert.equal(result.unassigned.length,10);
  assert.equal(result.comparison.length,3);assert.ok(result.comparison.every(c=>c.status==='unavailable'));assert.ok(result.comparison.some(c=>c.reason.includes('Not attempted')));
});
test('explicit India date and rider schedule validation include month rollover',()=>{
  assert.equal(resolvePlanningStart({date:'2026-11-28',hour:'08',minute:'15',ampm:'AM'},Date.parse('2026-11-26T22:00Z')),'2026-11-28T02:45:00.000Z');
  assert.equal(riderSlot('2026-11-30T02:30:00Z',2,2).departureTime,'2026-12-01T02:30:00.000Z');assert.throws(()=>riderSlot(start,0,0));
});

test('traffic-flagged seed remains sequence only; final stage must verify every dispatched route',async()=>{
  let calls=0;const result=await autoSplitTrips(rows(4),options,depot,async request=>{calls++;const r=fixtureAutoOptimize(request);if(request.label==='frostie-sequence'){r.routes[0].hasTrafficInfeasibilities=true;r.routes[0].visits[1].startTime=r.routes[0].visits[0].startTime;}return r;});
  assert.equal(calls,2);assert.equal(result.assignedCount,4);assert.ok(result.trips.every(t=>t.verificationStatus==='verified'));
});
test('traffic failure isolated, new real-date slots recover without retrying identical request',async()=>{
  const calls=[];const result=await autoSplitTrips(rows(4),{...options,strategy:'capacity',maxCurd:2},depot,async request=>{calls.push(request);const r=fixtureAutoOptimize(request);if(calls.length===2)r.routes[0].hasTrafficInfeasibilities=true;return r;});
  assert.equal(result.assignedCount,4);assert.equal(calls.length,3);assert.equal(new Set(calls.map(r=>JSON.stringify(r))).size,calls.length);assert.ok(result.trips.every(t=>t.verificationStatus==='verified'));
});
test('persistent traffic failure is finite and preserves dense verified trips with explicit unassigned',async()=>{
  let calls=0;const result=await autoSplitTrips(rows(4),{...options,strategy:'capacity',maxCurd:2},depot,async request=>{calls++;const r=fixtureAutoOptimize(request);if(request.label!=='frostie-sequence')r.routes.at(-1).hasTrafficInfeasibilities=true;return r;});
  assert.equal(calls,6);assert.equal(result.assignedCount+result.unassigned.length,4);assert.ok(result.unassigned.length>0);assert.ok(result.unassigned.some(r=>/traffic/.test(r.reason)));assert.ok(result.trips.every((t,i)=>t.configurationIndex===i));
});
test('provider failure during recovery preserves earlier dense verified trips and stops',async()=>{
  let calls=0;const result=await autoSplitTrips(rows(4),{...options,strategy:'capacity',maxCurd:2},depot,async request=>{calls++;if(calls===3)throw Error('fixture outage');const r=fixtureAutoOptimize(request);if(calls===2)r.routes.at(-1).hasTrafficInfeasibilities=true;return r;});
  assert.equal(calls,3);assert.equal(result.assignedCount,2);assert.equal(result.unassigned.length,2);assert.ok(result.notes.some(n=>/previously verified/.test(n)));
});

test('actual planning service handles traffic-flagged seed and final recovery read-only',async()=>{
 const input=rows(4),calls=[];let writes=0;
 const service=createTripService({read:async()=>input,write:async()=>{writes++;},depot,now:()=>Date.parse('2026-11-27T00:00Z'),autoOptimize:async request=>{calls.push(request);const response=fixtureAutoOptimize(request);if(calls.length<=2)response.routes.at(-1).hasTrafficInfeasibilities=true;return response;}});
 const result=await service.plan({mode:'auto',orders:input,auto:{...options,strategy:'capacity',maxCurd:2,departure:{date:'2026-11-28',hour:8,minute:'00',ampm:'AM'}}});
 assert.equal(result.assignedCount,4);assert.equal(writes,0);assert.equal(calls.length,3);assert.ok(result.planId);assert.ok(result.trips.every(t=>t.verificationStatus==='verified'));
});

test('Best returns three actual independently guarded candidates without recomputation on selection',async()=>{
 const input=rows(4);let calls=0,writes=0;const service=createTripService({read:async ids=>ids.map(id=>input.find(r=>r.rowId===id)),write:async()=>{writes++;},depot,now:()=>Date.parse('2026-11-27T00:00Z'),autoOptimize:async request=>{calls++;return fixtureAutoOptimize(request);}});
 const result=await service.plan({mode:'auto',orders:input,auto:{...options,strategy:'best',departure:{date:'2026-11-28',hour:8,minute:'00',ampm:'AM'}}});
 assert.equal(result.candidates.length,3);assert.equal(new Set(result.candidates.map(c=>c.planId)).size,3);assert.equal(calls,4);assert.equal(writes,0);
 for(const candidate of result.candidates){assert.equal(candidate.assignedCount,4);assert.equal(candidate.trips.flatMap(t=>t.stops).length,4);assert.ok(candidate.trips.every(t=>t.verificationStatus==='verified'));}assert.equal(calls,4);
 await service.reserve({planId:result.candidates[0].planId,tripIndex:0,statusValue:2});
 await assert.rejects(service.reserve({planId:result.candidates[1].planId,tripIndex:0,statusValue:2}),/Another candidate/);assert.equal(writes,1);
});

test('diagnosed 3 to 6 to 2 pattern recovers only outstanding rows in next real rider slot',async()=>{
 const input=rows(6),calls=[];
 const result=await autoSplitTrips(input,{...options,strategy:'best',maxCurd:2},depot,async request=>{calls.push(request);const r=fixtureAutoOptimize(request);if(request.label==='frostie-distance-first'&&request.model.shipments.length===6&&request.model.vehicles.length>2)r.routes[1].hasTrafficInfeasibilities=true;return r;});
 const candidate=result.candidates.find(c=>c.objective==='distance-first'),requests=calls.filter(r=>r.label==='frostie-distance-first');
 assert.deepEqual(requests.map(r=>r.model.vehicles.length),[3,6,2,2]);assert.deepEqual(requests.map(r=>r.model.shipments.length),[6,6,6,2]);
 assert.equal(candidate.assignedCount,6);assert.equal(candidate.unassigned.length,0);assert.equal(candidate.trips.length,3);assert.equal(candidate.trips[2].departureTime,'2026-11-29T02:30:00.000Z');assert.equal(candidate.trips[2].riderSlot,1);
 assert.equal(new Set(candidate.trips.flatMap(t=>t.stops.map(s=>s.rowId))).size,6);assert.equal(new Set(calls.map(r=>JSON.stringify(r))).size,calls.length);
});
test('recovery uses spare rider slot today, retains original verified trip and stops on permanently infeasible row',async()=>{
 const input=rows(3),calls=[];const result=await autoSplitTrips(input,{...options,strategy:'capacity',maxCurd:2},depot,async request=>{calls.push(request);const r=fixtureAutoOptimize(request);if(request.model.shipments.length===3&&request.label!=='frostie-sequence')r.routes.at(-1).hasTrafficInfeasibilities=true;return r;});
 assert.equal(result.assignedCount,3);assert.equal(result.trips[1].riderSlot,2);assert.equal(result.trips[1].departureTime,start);assert.ok(calls.at(-1).model.shipments.length<3);
 const impossible=rows(2);impossible[0].curd=100;let count=0;const partial=await autoSplitTrips(impossible,{...options,strategy:'capacity',maxCurd:2},depot,async request=>{count++;return fixtureAutoOptimize(request);});assert.equal(partial.assignedCount,1);assert.equal(partial.unassigned.length,1);assert.match(partial.unassigned[0].reason,/alone exceeds maximum curd/);assert.equal(count,2);
});

test('provider error in subset recovery stops without losing verified trips or requesting other candidates',async()=>{
 const input=rows(6);let calls=0;const result=await autoSplitTrips(input,{...options,strategy:'best',maxCurd:2},depot,async request=>{calls++;if(request.model.shipments.length<6)throw Error('subset provider outage');const r=fixtureAutoOptimize(request);if(request.label!=='frostie-sequence'&&request.model.vehicles.length>2)r.routes[1].hasTrafficInfeasibilities=true;return r;});
 assert.equal(calls,5);assert.equal(result.assignedCount,4);assert.equal(result.unassigned.length,2);assert.ok(result.unassigned.every(r=>/could not assign/.test(r.reason)&&/outage/.test(r.reason)));assert.ok(result.comparison.filter(c=>c.status==='unavailable').every(c=>/Not attempted/.test(c.reason)));
});

// Deviation searches use synthetic routes only; no Google or Sheets access.
import { deviationVariants } from '../helpers/planningDeviation.js';

test('percentage search includes base and exact endpoints in all modes', () => {
  for (const strategy of ['time', 'distance', 'capacity', 'hybrid', 'best']) {
    const settings = { ...options, strategy, deviation: { percent: 20, stepPercent: 5 } };
    const variants = deviationVariants(settings);
    assert.equal(variants.length, 9);
    assert.deepEqual(variants.map(v => v.offset).sort((a,b) => a-b), [-20,-15,-10,-5,0,5,10,15,20]);
    if (strategy === 'distance') assert.deepEqual(variants.map(v => v.limits.maxDistanceKm).sort((a,b) => a-b), [80,85,90,95,100,105,110,115,120]);
  }
  assert.deepEqual(deviationVariants({...options, strategy:'distance', deviation:{percent:12,stepPercent:5}}).map(v=>v.offset),[0,-5,5,-10,10,-12,12]);
  assert.equal(deviationVariants({...options, strategy:'capacity',maxCurd:1,deviation:{percent:20,stepPercent:5}}).length,1);
  for (const deviation of [{percent:100,stepPercent:5},{percent:-1,stepPercent:5},{percent:20,stepPercent:0},{percent:20,stepPercent:.01}])
    assert.throws(()=>deviationVariants({...options,deviation}));
});

test('all dropdown modes test every limit setting, share a sequence, and select minimum complete road distance', async () => {
  for (const strategy of ['time','distance','capacity','hybrid','best']) {
    const calls=[];
    const settings={...options,strategy,deviation:{percent:20,stepPercent:5}};
    const result=await autoSplitTrips(rows(8),settings,depot,async request=>{
      calls.push(request);
      const response=fixtureAutoOptimize(request);
      if(request.label!=='frostie-sequence') {
        const vehicle=request.model.vehicles[0];
        const ratio=strategy==='time'||strategy==='hybrid'||strategy==='best'
          ? Number(vehicle.routeDurationLimit.maxDuration.slice(0,-1))/36000
          : strategy==='distance' ? Number(vehicle.routeDistanceLimit.maxMeters)/100000
          : Number(vehicle.loadLimits.curd.maxLoad)/40000;
        // The lower limit yields shorter verified roads, deliberately defeating "largest cap wins".
        for(const route of response.routes) for(const leg of route.transitions) leg.travelDistanceMeters=Math.round(1000*ratio);
      }
      return response;
    });
    assert.equal(calls.filter(r=>r.label==='frostie-sequence').length,1);
    assert.equal(result.candidates.length,strategy==='best'?27:9);
    assert.equal(result.assignedCount,8);
    assert.equal(result.unassigned.length,0);
    const complete=result.candidates.filter(c=>c.status==='complete');
    const winner=complete.find(c=>c.objective===result.winner);
    assert.equal(winner.combinedMeters,Math.min(...complete.map(c=>c.combinedMeters)));
    assert.equal(winner.deviationPercent,-20);
    assert.ok(winner.trips.every(t=>t.verificationStatus==='verified'));
  }
});

test('service rejects incomplete plans in every mode and never registers them for submission', async () => {
  for(const strategy of ['time','distance','capacity','hybrid','best']) {
    const input=rows(2); input[1].latLng='invalid'; let writes=0;
    const service=createTripService({read:async()=>input,write:async()=>{writes++;},depot,now:()=>Date.parse('2026-11-27T00:00Z'),autoOptimize:fixtureAutoOptimize});
    await assert.rejects(service.plan({mode:'auto',orders:input,auto:{...options,strategy,deviation:{percent:20,stepPercent:5},departure:{date:'2026-11-28',hour:'08',minute:'00',ampm:'AM'}}}),/No complete plan/);
    assert.equal(writes,0);
  }
});

test('deviation candidates have separate usable plan tokens and submitting one locks the alternatives', async () => {
  const input=rows(4), read=async ids=>ids.map(id=>({...input.find(row=>row.rowId===id)}));
  const service=createTripService({read,write:async({statusValue})=>input.forEach(row=>row.status=statusValue),depot,now:()=>Date.parse('2026-11-27T00:00Z'),autoOptimize:fixtureAutoOptimize});
  const result=await service.plan({mode:'auto',orders:input,auto:{...options,strategy:'distance',deviation:{percent:20,stepPercent:5},departure:{date:'2026-11-28',hour:'08',minute:'00',ampm:'AM'}}});
  assert.equal(new Set(result.candidates.map(c=>c.planId)).size,9);
  const first=result.candidates[0], second=result.candidates[1];
  assert.equal((await service.reserve({planId:first.planId,tripIndex:0,statusValue:1})).outcome,'updated');
  await assert.rejects(service.reserve({planId:second.planId,tripIndex:0,statusValue:1}),/Another candidate/);
});

test('100 km is per trip: two riders can serve nine orders across five trips and three days', async () => {
  const input=rows(9);
  const service=createTripService({read:async ids=>ids.map(id=>({...input.find(row=>row.rowId===id)})),depot,now:()=>Date.parse('2026-11-27T00:00Z'),autoOptimize:async request=>{
    const scaled=structuredClone(request);
    for(const vehicle of scaled.model.vehicles) if(vehicle.routeDistanceLimit)
      vehicle.routeDistanceLimit.maxMeters=String(Math.floor(Number(vehicle.routeDistanceLimit.maxMeters)/30));
    const response=fixtureAutoOptimize(scaled);
    for(const route of response.routes) for(const leg of route.transitions) leg.travelDistanceMeters*=30;
    return response;
  }});
  const result=await service.plan({mode:'auto',orders:input,auto:{...options,strategy:'distance',maxDistanceKm:100,riderCount:2,departure:{date:'2026-11-28',hour:'08',minute:'00',ampm:'AM'}}});
  assert.equal(result.assignedCount,9); assert.equal(result.unassigned.length,0); assert.equal(result.trips.length,5);
  assert.deepEqual(result.trips.map(t=>t.dayIndex),[0,0,1,1,2]);
  assert.ok(result.trips.every(t=>t.totalMeters<=100000));
});

test('zero deviation accepts a zero step; positive deviation requires a positive step', () => {
  assert.equal(deviationVariants({...options, deviation:{percent:0,stepPercent:0}}).length,1);
  assert.throws(()=>deviationVariants({...options,deviation:{percent:10,stepPercent:0}}),/step must be positive/);
  assert.equal(deviationVariants({...options,deviation:{percent:2,stepPercent:1}}).length,5);
});

test('deviated hours and fractional service round to whole-second Google durations', () => {
  const request=autoRequest(rows(2),{...options,strategy:'time',maxHours:8.55,serviceMinutes:.123456},depot,1);
  assert.equal(request.model.vehicles[0].routeDurationLimit.maxDuration,'30780s');
  assert.equal(request.model.shipments[0].deliveries[0].duration,"7s");
  for(const value of [request.model.vehicles[0].routeDurationLimit.maxDuration,request.model.shipments[0].deliveries[0].duration])
    assert.match(value,/^\d+s$/);
});

test('one candidate HTTP 400 does not cancel other objectives or deviation settings', async () => {
  let rejected=false; const calls=[];
  const result=await autoSplitTrips(rows(8),{...options,strategy:'best',deviation:{percent:5,stepPercent:5}},depot,async request=>{
    calls.push(request);
    if(!rejected && request.label==='frostie-time-first' && request.model.vehicles[0].routeDurationLimit.maxDuration==='34200s') {
      rejected=true;throw Object.assign(Error('Synthetic Google candidate rejection'),{isCandidateError:true});
    }
    return fixtureAutoOptimize(request);
  });
  assert.ok(rejected);
  assert.equal(result.candidates.length,9);
  assert.equal(result.candidates.filter(c=>c.status==='unavailable').length,1);
  assert.equal(result.candidates.filter(c=>c.status==='complete').length,8);
  assert.ok(result.candidates.some(c=>c.deviationPercent===5 && c.status==='complete'));
  assert.equal(result.assignedCount,8);
});

test('unavailable Hybrid setting preserves uncovered-order diagnostics and has no submission token', async () => {
  const input=rows(3);input[0].curd=33;
  const service=createTripService({read:async ids=>ids.map(id=>({...input.find(row=>row.rowId===id)})),depot,now:()=>Date.parse('2026-11-27T00:00Z'),autoOptimize:fixtureAutoOptimize});
  const result=await service.plan({mode:'auto',orders:input,auto:{...options,strategy:'hybrid',deviation:{percent:20,stepPercent:5},departure:{date:'2026-11-28',hour:'08',minute:'00',ampm:'AM'}}});
  const failed=result.candidates.find(c=>c.deviationPercent===-20);
  assert.equal(failed.status,'unavailable');assert.equal(failed.planId,undefined);
  assert.match(failed.reason,/2\/3 orders covered/);
  assert.match(failed.reason,/Order alone exceeds maximum curd boxes/);
  assert.equal(failed.diagnostics.uncoveredRows[0].rowId,2);
  assert.equal(result.assignedCount,3);
});
