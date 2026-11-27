// Synthetic provider only. No Sheets, auth or Google calls.
export function fixtureAutoOptimize(request) {
  const shipments=request.model.shipments,perStop=Number(shipments[0]?.deliveries[0].duration.replace('s','')??0);
  const pending=Array.from({length:shipments.length},(_,i)=>i);
  if(request.label!=='frostie-sequence')pending.reverse();
  const routes=[];
  for(let vehicleIndex=0;vehicleIndex<request.model.vehicles.length&&pending.length;vehicleIndex++){
    const vehicle=request.model.vehicles[vehicleIndex],start=vehicle.startTimeWindows[0].startTime;
    const windowSeconds=(Date.parse(vehicle.endTimeWindows[0].endTime)-Date.parse(start))/1000;
    const time=vehicle.routeDurationLimit?Math.min(windowSeconds,Number(vehicle.routeDurationLimit.maxDuration.replace('s',''))):windowSeconds;
    const meters=Number(vehicle.routeDistanceLimit?.maxMeters??Infinity),capacity=Number(vehicle.loadLimits?.curd?.maxLoad??Infinity);
    const selected=[];let load=0;
    for(let index=0;index<pending.length;){const shipmentIndex=pending[index],amount=Number(shipments[shipmentIndex].loadDemands?.curd?.amount??0),count=selected.length+1;
      if(count*(perStop+60)+60<=time&&(count+1)*1000<=meters&&load+amount<=capacity){selected.push(shipmentIndex);load+=amount;pending.splice(index,1);}else index++;
    }
    if(!selected.length)continue;
    const visits=[];let cursor=Date.parse(start);
    for(const shipmentIndex of selected){cursor+=60000;visits.push({shipmentIndex,startTime:new Date(cursor).toISOString()});cursor+=perStop*1000;}
    routes.push({vehicleIndex,vehicleStartTime:start,vehicleEndTime:new Date(cursor+60000).toISOString(),visits,transitions:Array.from({length:visits.length+1},()=>({travelDuration:'60s',travelDistanceMeters:1000})),routePolyline:{points:'_p~iF~ps|U_ulLnnqC_mqNvxq`@'}});
  }
  return {routes,skippedShipments:pending.map(index=>({index}))};
}
