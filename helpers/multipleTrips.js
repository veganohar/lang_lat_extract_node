import { FLAVOUR_KEYS } from '../data/flavourKeys.js';

export function coordinates(value) {
  const parts = String(value ?? '').split(',');
  const nums = parts.map(s => s.trim() === '' ? NaN : Number(s));
  if (parts.length !== 2 || !nums.every(Number.isFinite) || Math.abs(nums[0]) > 90 || Math.abs(nums[1]) > 180) return null;
  return nums.join(',');
}

// Three intermediate waypoints is the mobile-browser limit. Overlap endpoints
// between segments so the entire depot-to-depot sequence is preserved.
export function mapsSegments(depot, stops) {
  const points = [depot, ...stops.map(s => s.latLng), depot];
  const labels = ['Depot', ...stops.map((s, i) => `${i + 1}. ${s.name}`), 'Depot'];
  const segments = [];
  for (let start = 0; start < points.length - 1;) {
    let end = Math.min(start + 4, points.length - 1);
    let url;
    do {
      const params = new URLSearchParams({ api: '1', origin: points[start], destination: points[end], travelmode: 'two-wheeler' });
      if (end > start + 1) params.set('waypoints', points.slice(start + 1, end).join('|'));
      url = `https://www.google.com/maps/dir/?${params}`;
      if (url.length <= 2048) break;
      end--;
    } while (end > start);
    if (end === start) throw new Error('Location exceeds Google Maps URL limit');
    segments.push({ url, label: `${labels[start]} → ${labels[end]}` });
    start = end;
  }
  return segments;
}

export function validateLimits({ serviceMinutes, maxHours, maxDistanceKm }) {
  const values = [serviceMinutes, maxHours, maxDistanceKm];
  if (!values.every(v => typeof v === 'number' && Number.isFinite(v)) || serviceMinutes < 0 || maxHours <= 0 || maxDistanceKm <= 0) {
    throw new Error('Enter non-negative service minutes, positive working hours and positive road distance in kilometres.');
  }
}

// Search geographic assignments across exactly the configured trips, then
// verify full road kilometres and travel-plus-service hours. Product quantities
// are totals only. This heuristic does not guarantee a global optimum.
export async function planConfiguredTrips(orders, configurations, depotInput, roadMetrics) {
  if (!Array.isArray(configurations) || !configurations.length) throw new Error('Add at least one trip');
  configurations.forEach(config => {
    validateLimits(config.limits);
    if (!Number.isFinite(Date.parse(config.departureTime))) throw new Error('Invalid trip departure');
  });
  const depot = coordinates(depotInput);
  if (!depot) throw new Error('Configured depot coordinates are invalid');
  const cache = new Map();
  const road = async (from, to, departure) => {
    const key = JSON.stringify([from, to, departure]);
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(() => roadMetrics(from, to, departure)).then(value => {
      if (!Number.isFinite(value.seconds) || value.seconds < 0 || !Number.isFinite(value.meters) || value.meters < 0) throw new Error('Road route unavailable');
      return value;
    }));
    return cache.get(key);
  };
  const emptyTrip = (config, index) => ({ ...config, configurationIndex: index, stops: [], totalCurd: 0, totalIcecream: 0, totalSeconds: 0, roadSeconds: 0, totalMeters: 0, trafficAware: true, mapsLinks: [] });
  const trips = configurations.map(emptyTrip);
  let lastLimitReasons=[];
  const evaluate = async (config, stops) => {
    lastLimitReasons=[];
    const totalCurd = stops.reduce((n, stop) => n + stop.curd, 0);
    const roadPolylines = [];
    let elapsed = 0, roadSeconds = 0, totalMeters = 0, trafficAware = true, current = depot;
    for (let i = 0; i <= stops.length; i++) {
      const next = stops[i]?.latLng ?? depot;
      const departure = new Date(Date.parse(config.departureTime) + elapsed * 1000).toISOString();
      let leg;
      try { leg = await road(current, next, departure); }
      catch (error) { error.stopRowId = stops[i]?.rowId ?? stops.at(-1)?.rowId; throw error; }
      if (leg.encodedPolyline) roadPolylines.push(leg.encodedPolyline);
      elapsed += leg.seconds;
      roadSeconds += leg.seconds;
      totalMeters += leg.meters;
      trafficAware &&= leg.trafficAware;
      if (i < stops.length) elapsed += config.limits.serviceMinutes * 60;
      current = next;
    }
    if(elapsed>config.limits.maxHours*3600)lastLimitReasons.push('maximum working hours including service and depot return');
    if(totalMeters>config.limits.maxDistanceKm*1000)lastLimitReasons.push('maximum depot-to-depot road distance');
    if(lastLimitReasons.length)return null;
    return { roadPolylines, stops, totalCurd, totalIcecream: stops.reduce((n, stop) => n + stop.icecream, 0), totalSeconds: elapsed, roadSeconds, totalMeters, trafficAware };
  };
  const pending = [], unassigned = [];
  const xy = value => value.split(',').map(Number);
  const distance = (a,b) => { const x=xy(a),y=xy(b);return Math.hypot((x[0]-y[0])*111,(x[1]-y[1])*106); };
  const bearing = stop => {const a=xy(stop.latLng),b=xy(depot);return Math.atan2(a[1]-b[1],a[0]-b[0]);};
  const insertion = (stops,stop) => {
    let best={position:0,cost:Infinity};
    for(let i=0;i<=stops.length;i++) {
      const before=stops[i-1]?.latLng??depot,after=stops[i]?.latLng??depot;
      const cost=distance(before,stop.latLng)+distance(stop.latLng,after)-distance(before,after);
      if(cost<best.cost)best={position:i,cost};
    }
    return best;
  };
  const ordered = stops => {
    const route=[];
    for(const stop of stops){const at=insertion(route,stop).position;route.splice(at,0,stop);}
    // Reorder earlier stops with 2-opt, rather than fixing sheet order forever.
    for(let pass=0;pass<4;pass++) {
      let improved=false;
      for(let a=0;a<route.length-1;a++)for(let b=a+1;b<route.length;b++) {
        const before=route[a-1]?.latLng??depot,after=route[b+1]?.latLng??depot;
        if(distance(before,route[b].latLng)+distance(route[a].latLng,after)+1e-8<distance(before,route[a].latLng)+distance(route[b].latLng,after)) {
          route.splice(a,b-a+1,...route.slice(a,b+1).reverse());improved=true;
        }
      }
      if(!improved)break;
    }
    return route;
  };
  for(const order of orders) {
    const quantities=FLAVOUR_KEYS.map(key=>Number(order[key]??0));
    const stop={...order,latLng:coordinates(order.latLng),curd:Number(order.curd??0),icecream:quantities.reduce((n,q)=>n+q,0)};
    const feasible=configurations.map((trip,index)=>({trip,index})).filter(({trip})=>trip.limits.serviceMinutes*60<=trip.limits.maxHours*3600).map(({index})=>index);
    const reason=!stop.latLng?'Missing or invalid coordinates':![stop.curd,...quantities].every(n=>Number.isFinite(n)&&n>=0)?'Invalid product quantities':!feasible.length?'No configured trip can fit this stop service time':null;
    if(reason)unassigned.push({...stop,reason});else pending.push({stop,feasible});
  }
  let best;
  // Eight deterministic joint geographic seeds. These are local search only:
  // no guessed road duration is used to accept or report a final trip.
  for(let seed=0;seed<8;seed++) {
    const bins=configurations.map(()=>[]),loads=configurations.map(()=>0),left=[];
    const rows=[...pending].sort((a,b)=>a.feasible.length-b.feasible.length || ((bearing(a.stop)+Math.PI+seed*Math.PI/4)%(2*Math.PI))-((bearing(b.stop)+Math.PI+seed*Math.PI/4)%(2*Math.PI)) || a.stop.rowId-b.stop.rowId);
    for(const entry of rows) {
      let choice;
      for(const index of entry.feasible) {
        const config=configurations[index];
        if((bins[index].length+1)*config.limits.serviceMinutes*60>config.limits.maxHours*3600)continue;
        const at=insertion(bins[index],entry.stop);
        const estimatedKm=loads[index]+at.cost;
        const serviceHours=(bins[index].length+1)*config.limits.serviceMinutes/60;
        // Geographic travel is only a seed preference, never reported as road
        // verification or used to reject an otherwise verifiable candidate.
        const pressure=Math.max(0,(serviceHours+estimatedKm/25)/config.limits.maxHours-0.85);
        const distancePressure=Math.max(0,estimatedKm/config.limits.maxDistanceKm-0.85);
        const score=at.cost+1000*(pressure*pressure+distancePressure*distancePressure);
        if(!choice||score<choice.score)choice={...at,index,score};
      }
      if(!choice)left.push(entry.stop);else{bins[choice.index].splice(choice.position,0,entry.stop);loads[choice.index]+=choice.cost;}
    }
    const optimized=bins.map(ordered);
    const score=optimized.reduce((n,bin)=>n+bin.reduce((d,stop,i)=>d+distance(bin[i-1]?.latLng??depot,stop.latLng),0)+(bin.length?distance(bin.at(-1).latLng,depot):0),0);
    if(!best||left.length<best.left.length||(left.length===best.left.length&&score<best.score))best={bins:optimized,left,score};
  }
  const repair=[...(best?.left??[])];
  const verificationWarnings=[];
  let providerUnavailable=false;
  for(let index=0;index<trips.length;index++) {
    const stops=[...(best?.bins[index]??[])];
    if(providerUnavailable){unassigned.push(...stops.map(stop=>({...stop,reason:'Road provider unavailable; this order was not verified or assigned'})));continue;}
    while(stops.length) {
      let candidate;
      try {candidate=await evaluate(trips[index],stops);}
      catch(error) {
        if(error.code==='NO_ROAD_ROUTE') {
          const failed=stops.findIndex(stop=>stop.rowId===error.stopRowId);
          repair.push(stops.splice(failed>=0?failed:stops.length-1,1)[0]);
          verificationWarnings.push('A two-wheeler leg had no route; affected orders were retried in other positions/trips.');
          continue;
        }
        providerUnavailable=true;
        verificationWarnings.push('Road verification interrupted: '+error.message+'. Only trips fully verified before the failure are assigned.');
        unassigned.push(...stops.splice(0).map(stop=>({...stop,reason:'Road verification unavailable; not proven infeasible and not assigned'})));
        break;
      }
      if(candidate){Object.assign(trips[index],candidate);break;}
      // Remove the largest detour, then try inserting it elsewhere below.
      let remove=0,detour=-Infinity;
      for(let i=0;i<stops.length;i++){
        const before=stops[i-1]?.latLng??depot,after=stops[i+1]?.latLng??depot;
        const cost=distance(before,stops[i].latLng)+distance(stops[i].latLng,after)-distance(before,after);
        if(cost>detour){detour=cost;remove=i;}
      }
      repair.push(stops.splice(remove,1)[0]);
    }
  }
  for(const stop of repair) {
    if(providerUnavailable){unassigned.push({...stop,reason:'Road provider unavailable; this order was not verified or assigned'});continue;}
    let placed=false,noRoute=false;
    const exceeded=new Set();
    const candidates=trips.map((trip,index)=>({index,...insertion(trip.stops,stop)})).sort((a,b)=>a.cost-b.cost);
    for(const {index,position} of candidates){
      const stops=[...trips[index].stops];stops.splice(position,0,stop);
      let candidate;
      try{candidate=await evaluate(trips[index],stops);}catch(error){
        if(error.code==='NO_ROAD_ROUTE'){noRoute=true;continue;}
        providerUnavailable=true;verificationWarnings.push('Road verification interrupted: '+error.message+'. Previously verified trips are preserved.');break;
      }
      if(candidate){Object.assign(trips[index],candidate);placed=true;break;}
      lastLimitReasons.forEach(reason=>exceeded.add(reason));
    }
    if(!placed)unassigned.push({...stop,reason:providerUnavailable?'Road provider unavailable; not verified or assigned':noRoute?'No two-wheeler road route could be verified in the attempted trip positions':'Verified attempted routes exceed '+([...exceeded].join(' and ')||'the configured trip limits')});
  }
  trips.forEach(trip=>{trip.depot=depot;if(trip.stops.length)trip.mapsLinks=mapsSegments(depot,trip.stops);});
  return {verificationWarnings:[...new Set(verificationWarnings)],verificationStatus:providerUnavailable?'partial-provider-failure':'complete',trips,unassigned,eligibleCount:orders.length,assignedCount:trips.reduce((n,trip)=>n+trip.stops.length,0),planner:'joint-geographic-search-with-road-verification'};
}
