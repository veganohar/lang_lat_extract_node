import { DateTime } from 'luxon';
export function resolveDeparture({ day, hour, minute, ampm }, now = Date.now()) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (!days.includes(day) || !/^(0?[1-9]|1[0-2])$/.test(String(hour)) || !['00','15','30','45'].includes(String(minute)) || !['AM','PM'].includes(ampm)) throw new Error('Choose a weekday and valid departure time');
  const localNow = DateTime.fromMillis(now, { zone: 'Asia/Kolkata' });
  let departure = localNow.startOf('day').plus({ days: (days.indexOf(day) + 1 - localNow.weekday + 7) % 7 }).set({ hour: Number(hour) % 12 + (ampm === 'PM' ? 12 : 0), minute: Number(minute) });
  if (departure.toMillis() <= now) departure = departure.plus({ weeks: 1 });
  return departure.toUTC().toISO();
}
