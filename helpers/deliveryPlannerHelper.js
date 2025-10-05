
import { readFile } from "fs/promises";

const config = JSON.parse(
    await readFile(new URL("../config/config.json", import.meta.url))
);
const flavorKeys = ["cc", "ce", "eb", "em", "ev", "gc", "lc", "mc", "ss"];
const prices = {
    curd: 130,
    cc: 270,
    ce: 290,
    eb: 220,
    em: 220,
    ev: 210,
    gc: 290,
    lc: 240,
    mc: 270,
    ss: 220
};

// ---- Helpers ----
export function cleanAddress(address = "") {
    return address
        .replace(/\n/g, ", ")
        .replace(/,\s*,/g, ", ")
        .replace(/\s+/g, " ")
        .replace(/,\s*$/, "")
        .trim();
}

function formatTime(date) {
    const hh = date.getHours();
    const mm = String(date.getMinutes()).padStart(2, "0");
    const suffix = hh >= 12 ? "PM" : "AM";
    const displayHour = hh % 12 === 0 ? 12 : hh % 12;
    return `${displayHour}:${mm} ${suffix}`;
}

function formatTotalTime(totalMins) {
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs} hrs ${mins} mins`;
}

// ---- Core functions ----
export async function optimizeRoute(waypoints) {
    const { optimizedIndexes, legs } = await routesAPI(waypoints);
    const waypointsPath = optimizedIndexes.map(i => `/${waypoints[i]}`).join("");
    const optimizedLocationsMapUrl = `${config.allLocationsMapUrl}/${config.baseCoords}${waypointsPath}/${config.baseCoords}`;
    return { optimizedIndexes, optimizedLocationsMapUrl, legs };
}

// Using Directions API
async function directionsAPI(waypoints) {
    const url = config.directionsUrl
        .replace("{origin}", config.baseCoords)
        .replace("{destination}", config.baseCoords)
        .replace("{waypoints}", waypoints.join("|"))
        .replace("{key}", config.googleMapAPIKey);

    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes?.length) {
        console.error("Route optimization failed:", data);
        return { optimizedIndexes: [], optimizedLocationsMapUrl: "", legs: [] };
    }
    const route = data.routes[0];
    const optimizedIndexes = route.waypoint_order;
    const legs = route.legs.map((leg, i) => ({
        from: i === 0 ? "Origin" : waypoints[optimizedIndexes[i - 1]],
        to: i < optimizedIndexes.length ? waypoints[optimizedIndexes[i]] : "Destination",
        distance: leg.distance.text,
        duration: leg.duration.text
    }));
    return { optimizedIndexes, legs }
}

// Using Routes API
// Back up for future if Directions API deprecated
async function routesAPI(waypoints) {
    const origin = {
        location: { latLng: { latitude: config.baseLat, longitude: config.baseLng } }
    };
    const intermediates = waypoints.map(c => {
        const [latitude, longitude] = c.split(",").map(Number);
        return { location: { latLng: { latitude, longitude } } };
    });
    const destination = origin;
    const body = {
        origin, destination, intermediates, travelMode: "TWO_WHEELER", optimizeWaypointOrder: true, polylineEncoding: "ENCODED_POLYLINE"
    };
    const url = config.routesUrl
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": "AIzaSyBBopPrVuLCInXqDd8JZe1GVv3amV7peqI",
            "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration,routes.legs.startLocation,routes.legs.endLocation,routes.legs.distanceMeters,routes.legs.duration"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        console.error("Route optimization failed:", await response.text());
        return { optimizedIndexes: [], optimizedLocationsMapUrl: "", legs: [] };
    }
    const data = await response.json();
    const route = data.routes[0];
    const optimizedIndexes = route.optimizedIntermediateWaypointIndex;
    const legs = route.legs.map((leg, i) => ({
        from: i === 0 ? "Origin" : waypoints[optimizedIndexes[i - 1]],
        to: i < optimizedIndexes.length ? waypoints[optimizedIndexes[i]] : "Destination",
        duration: Math.floor(Number(leg.duration.replace(/s$/, "")) / 60),
        distance: (leg.distanceMeters / 1000).toFixed(1)
    }));
    return { optimizedIndexes, legs }
}

export function calculateTripSchedule(legs, startTime, bufferMinutes) {
    const stops = [];
    let totalDistance = 0;
    let totalTime = 0;

    // Parse start time
    const today = new Date();
    let [time, meridian] = startTime.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (meridian.toLowerCase() === "pm" && hours !== 12) hours += 12;
    if (meridian.toLowerCase() === "am" && hours === 12) hours = 0;

    let currentTime = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        hours,
        minutes
    );
    const tripStartTime = new Date(currentTime);


    legs.forEach((leg, idx) => {
        const startTimeObj = new Date(currentTime);

        const legMinutes = parseInt(leg.duration, 10) || 0;
        const distance = parseFloat(leg.distance) || 0;
        totalDistance += distance;

        currentTime.setMinutes(currentTime.getMinutes() + legMinutes);
        totalTime += legMinutes;
        const endTimeObj = new Date(currentTime);
        // Add buffer (not after last leg)
        if (idx < legs.length - 1) {
            currentTime.setMinutes(currentTime.getMinutes() + bufferMinutes);
            totalTime += Number(bufferMinutes);
        }

        stops.push({
            stop: idx + 1,
            from: leg.from,
            to: leg.to,
            distance: leg.distance,
            duration: leg.duration,
            etaStart: formatTime(startTimeObj),
            etaEnd: formatTime(endTimeObj)
        });
    });

    return {
        stops,
        tripStart: formatTime(tripStartTime),
        tripEnd: formatTime(currentTime),
        totalDistance: `${totalDistance.toFixed(1)} km`,
        totalTime: formatTotalTime(totalTime)
    };
}

export function parseRows(data) {
    const rows = data.map(v => v.values?.[0] || []);
    return rows.map(row => {
        const [
            name, phone, address, location, coords, curd,
            ...rest // remaining columns (flavors + comments, etc.)
        ] = row;
        // Map flavor values dynamically
        const flavorValues = {};
        flavorKeys.forEach((key, idx) => {
            flavorValues[key] = rest[idx] || ""; // safe fallback
        });
        const comments = rest[flavorKeys.length+1] || ""; // last one after flavors
        // calculate amount
        let amount = 0;
        if (curd) {
            amount += Number(curd) * prices["curd"];
        }
        // icecream prices
        flavorKeys.forEach(key => {
            if (flavorValues[key]) {
                amount += Number(flavorValues[key]) * (prices[key] || 0);
            }
        });
        return {
            name, phone, address, location, coords, curd,
            ...flavorValues, // spread flavors dynamically
            amount, comments
        };
    });
}

export function buildWaypoints(formattedData) {
    return formattedData.map(c => c.coords);
}

function buildOrderMessage(c, i, eta) {
    const lines = [
        `🔢 *${i + 1})*`,
        `👤 *Name*: ${c.name}`,
        `📞 *Phone*: ${c.phone}`,
        `🏠 *Address*: ${cleanAddress(c.address)}`,
        `📍 *Location*: ${c.location}`,
        `⏱ ETA Start: *${eta.etaStart || "-"}*`,
        `⏱ ETA End: *${eta.etaEnd || "-"}*`,
        `📏 *Distance*: *${eta.distance} km*`,
        `⏰ *Duration*: *${eta.duration} mins*`
    ];

    if (c.curd) {
        lines.push(`🥛 *Curd*: *${c.curd}*`);
    }
    // build icecream dynamically
    const icecreamFlavors = flavorKeys
        .filter(key => c[key] && Number(c[key]) > 0)
        .map(key => `${key.toUpperCase()}-${c[key]}`);
    if (icecreamFlavors.length > 0) {
        lines.push(`🍨 *Icecream*: *${icecreamFlavors.join(", ")}*`);
    }
    if (c.amount) {
        lines.push(`💰 *Amount*: *${c.amount}*`);
    }
    if (c.comments) {
        lines.push(`📝 *Note*: *${c.comments}*`);
    }
    return lines.join("\n");
}

// export function buildOrdersMessage(orderedData, etas) {
//     return orderedData.map((c, i) => {
//         const eta = etas.stops[i] || {};
//         return buildOrderMessage(c, i, eta);
//     }).join("\n\n");
// }

export function buildOrdersMessage(orderedData, etas, chunkSize = 10) {
  const messages = orderedData.map((c, i) => {
    const eta = etas.stops[i] || {};
    return buildOrderMessage(c, i, eta);
  });
  // Split into chunks of `chunkSize`
  const ordersMessage = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    ordersMessage.push(messages.slice(i, i + chunkSize).join("\n\n"));
  }
  return ordersMessage; // array of message chunks
}


export function buildSummary(etas, orderedData) {
    let totalCurd = 0;
    let totalAmount = 0;
    const flavorTotals = {};
    flavorKeys.forEach(k => (flavorTotals[k] = 0));
    orderedData.forEach(c => {
        if (c.curd) totalCurd += Number(c.curd);
        totalAmount += c.amount || 0;
        flavorKeys.forEach(k => {
            if (c[k]) flavorTotals[k] += Number(c[k]);
        });
    });
    const flavorsLine = Object.entries(flavorTotals)
        .filter(([_, qty]) => qty > 0)
        .map(([k, qty]) => `${k.toUpperCase()}-${qty}`)
        .join(", ");
    const summaryText = `📏 *Total Distance*: *${etas.totalDistance}*
⏰ *Total Time*: *${etas.totalTime}*
🥛 *Total Curd*: *${totalCurd}*
🍨 *Icecreams*: *${flavorsLine || "-"}*
💰 *Total Amount*: *${totalAmount}*`;
    const summaryObject = {
        totalDistance: etas.totalDistance,
        totalTime: etas.totalTime,
        totalCurd,
        icecreams: flavorsLine,
        totalAmount
    }
    return {summaryText,summaryObject};
}






