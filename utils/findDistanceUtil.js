import { readFile } from "fs/promises";

const config = JSON.parse(
    await readFile(new URL("../config/config.json", import.meta.url))
);

export async function getTwoWheelerDistances(coords) {
    const results = [];
    for (const coord of coords) {
        const [lat, lng] = coord.split(",").map(Number);
        const payload = {
            origin: { location: { latLng: { latitude: config.baseLat, longitude: config.baseLng } } },
            destination: { location: { latLng: { latitude: lat, longitude: lng } } },
            travelMode: 'TWO_WHEELER',
            routingPreference: 'TRAFFIC_UNAWARE',
            computeAlternativeRoutes: false
        };

        const response = await fetch(config.routesUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_MAP_API_KEY,
                            "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration,routes.legs.startLocation,routes.legs.endLocation,routes.legs.distanceMeters,routes.legs.duration"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        const leg = data.routes[0].legs[0];
        results.push({
            coord,
            distanceMeters: leg.distanceMeters,
            duration: leg.duration
        });
    }

    return results;
}


