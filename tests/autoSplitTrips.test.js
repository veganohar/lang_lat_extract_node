import test from 'node:test';
import assert from 'node:assert/strict';
import {autoSplitTrips,autoRequest,parseAutoResponse,validateAutoLimits} from '../helpers/autoSplitTrips.js';
import {fixtureAutoOptimize} from './autoSplitFixtureProvider.js';
import {createTripService} from '../services/multipleTrips.js';
const depot='17.4,78.4';
const options={maxHours:10,serviceMinutes:7,departureTime:'2026-11-28T02:30:00.000Z'};
const rows=(count)=>Array.from({length:count},(_,i)=>({rowId:i+2,name:`Synthetic ${i+1}`,status:i%9+1,curd:10000,cc:2,latLng:`${17.4+i/10000},78.4`}));

test('every auto-split runs all-order Google sequence then flexible joint optimization',async()=>{
  const calls=[];
  const result=await autoSplitTrips(rows(177),options,depot,async request=>{calls.push(structuredClone(request));return fixtureAutoOptimize(request);});
  assert.equal(calls.length,2);assert.equal(calls[0].model.vehicles.length,1);assert.equal(calls[0].model.shipments.length,177);
  assert.equal(calls[0].model.vehicles[0].routeDurationLimit,undefined);
  assert.ok(calls[1].model.vehicles.length>1);assert.ok(calls[1].injectedFirstSolutionRoutes.length>1);
  assert.equal(calls[1].injectedSolutionConstraint,undefined);
  for(const vehicle of calls[1].model.vehicles){assert.equal(vehicle.travelMode,'TWO_WHEELER');assert.equal(vehicle.routeDurationLimit.maxDuration,'36000s');assert.equal(vehicle.loadLimits,undefined);assert.equal(vehicle.routeDistanceLimit,undefined);assert.ok(vehicle.fixedCost>0);}
  calls[1].model.shipments.forEach(shipment=>{assert.equal(shipment.allowedVehicleIndices,undefined);assert.ok(shipment.penaltyCost>100000);});
  assert.equal(result.assignedCount,177);assert.equal(result.unassigned.length,0);assert.equal(result.trips.length,3);
  assert.deepEqual(result.trips.map(t=>Math.round(t.totalSeconds/60)),[593,593,233]);
  assert.equal(new Set(result.trips.flatMap(t=>t.stops.map(s=>s.rowId))).size,177);
  result.trips.forEach(trip=>{assert.ok(trip.totalSeconds<=36000);assert.ok(trip.totalSeconds>=trip.roadSeconds+trip.serviceSeconds);assert.ok(trip.totalCurd>10000);assert.equal(trip.limits.maxDistanceKm,undefined);});
  assert.notEqual(result.trips[0].stops[0].rowId,calls[1].injectedFirstSolutionRoutes[0].visits[0].shipmentIndex+2);
});
test('shuffled 77-order fixtures use canonical identities and complete verified coverage',async()=>{
  const input=rows(77),forward=await autoSplitTrips(input,options,depot,fixtureAutoOptimize),reverse=await autoSplitTrips([...input].reverse(),options,depot,fixtureAutoOptimize);
  assert.equal(forward.assignedCount,77);assert.deepEqual(forward.trips.map(t=>t.stops.map(s=>s.rowId)),reverse.trips.map(t=>t.stops.map(s=>s.rowId)));
});
test('incomplete first Google pass aborts without a fallback or second pass',async()=>{
  let calls=0;
  await assert.rejects(autoSplitTrips(rows(3),options,depot,async request=>{calls++;const result=fixtureAutoOptimize(request);result.routes[0].visits.pop();result.routes[0].transitions.pop();return result;}),/first Google sequence/);
  assert.equal(calls,1);
});
test('duplicate, missing road legs, over-cap or traffic-infeasible results are rejected',()=>{
  const input=rows(3),request=autoRequest(input,options,depot,1),valid=fixtureAutoOptimize(request);
  for(const mutate of [data=>{data.routes[0].visits[1].shipmentIndex=0;},data=>{data.routes[0].transitions.pop();},data=>{data.routes[0].vehicleEndTime='2026-11-28T13:00:00Z';},data=>{data.routes[0].routePolyline={};}]){
    const response=structuredClone(valid);mutate(response);assert.throws(()=>parseAutoResponse(response,input,options,depot,1));
  }
});
test('skipped orders remain explicit, never falsely counted as assigned',async()=>{
  let calls=0;
  const result=await autoSplitTrips(rows(2),options,depot,async request=>{const result=fixtureAutoOptimize(request);if(++calls>1){result.routes[0].visits.pop();result.routes[0].transitions.pop();result.skippedShipments=[{index:0}];}return result;});
  assert.equal(result.assignedCount,1);assert.equal(result.unassigned.length,1);assert.equal(result.assignedCount+result.unassigned.length,2);
});
test('provider errors remain errors; no local estimate substitute',async()=>{
  await assert.rejects(autoSplitTrips(rows(2),options,depot,async()=>{throw Error('fixture outage');}),/fixture outage/);
  assert.throws(()=>validateAutoLimits({maxHours:1.1,serviceMinutes:7}));
});
test('auto service mode reads only requested rows and writes nothing',async()=>{
  const input=rows(7),reads=[];let writes=0;
  const service=createTripService({depot,now:()=>Date.parse('2026-11-26T22:00:00Z'),read:async ids=>{reads.push(ids);return input;},write:async()=>{writes++;},autoOptimize:fixtureAutoOptimize});
  const result=await service.plan({mode:'auto',orders:input,auto:{maxHours:10,serviceMinutes:7,departure:{day:'Saturday',hour:'08',minute:'00',ampm:'AM'}}});
  assert.equal(result.assignedCount,7);assert.equal(writes,0);assert.deepEqual(reads,[input.map(r=>r.rowId)]);assert.equal(result.trips[0].departureTime,options.departureTime);
});

test('provider failure stops immediately without automatic retry',async()=>{
  const calls=[];
  await assert.rejects(autoSplitTrips(rows(10),{...options,maxHours:.5},depot,async request=>{calls.push(request);if(request.label!=='frostie-sequence')throw Object.assign(Error('infeasible hint'),{code:'AUTO_INFEASIBLE'});return fixtureAutoOptimize(request);}),/infeasible hint/);
  assert.equal(calls.length,2);
});
test('short far-out final trip gets an explicit soft-preference trade-off explanation',async()=>{
  const input=rows(80);input[0].latLng='18,79';
  const result=await autoSplitTrips(input,options,depot,fixtureAutoOptimize);
  assert.ok(result.notes.some(note=>note.includes('short final trip still contains a relatively distant stop')));
});
