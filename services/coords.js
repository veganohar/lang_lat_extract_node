import {expandUrlAndGetCoords} from '../utils/coordsUtil.js';

export async function getLatLng(shortUrl) {
  return await expandUrlAndGetCoords(shortUrl);
}


