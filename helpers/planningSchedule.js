import {DateTime} from 'luxon';
import {resolveDeparture} from './tripDeparture.js';
export function resolvePlanningStart(departure,now=Date.now()) {
  if(!departure?.date)return resolveDeparture(departure,now);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(departure.date)||!/^(0?[1-9]|1[0-2])$/.test(String(departure.hour))||!['00','15','30','45'].includes(String(departure.minute))||!['AM','PM'].includes(departure.ampm))throw Error('Choose a valid start date and quarter-hour departure.');
  const date=DateTime.fromISO(departure.date,{zone:'Asia/Kolkata'}).set({hour:Number(departure.hour)%12+(departure.ampm==='PM'?12:0),minute:Number(departure.minute)});
  if(!date.isValid||date.toISODate()!==departure.date||date.toMillis()<=now)throw Error('The start date and time must be valid and in the future (Asia/Kolkata).');
  return date.toUTC().toISO();
}
export function riderSlot(start,index,riderCount=1) {
  if(!Number.isInteger(riderCount)||riderCount<1)throw Error('Rider count must be a positive integer.');
  return {departureTime:DateTime.fromISO(start).setZone('Asia/Kolkata').plus({days:Math.floor(index/riderCount)}).toUTC().toISO(),riderSlot:index%riderCount+1,dayIndex:Math.floor(index/riderCount)};
}
