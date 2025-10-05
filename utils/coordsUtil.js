export async function expandUrlAndGetCoords(shortUrl) {
  try {
    const response = await fetch(shortUrl, { redirect: "manual" });
    const location = response.headers.get("location");
    if (!location) return { error: "Could not expand URL" };

    // Try !3d/!4d pattern
    let match = location.match(/!3d([-.\d]+)!4d([-.\d]+)/);
    if (match) return { coords: `${match[1]},${match[2]}` };

    // Try @lat,lng pattern
    match = location.match(/@([-.\d]+),([-.\d]+)/);
    if (match) return { coords: `${match[1]},${match[2]}` };

    return { error: "Lat/Lng not found in expanded URL" };
  } catch {
    return { error: "Failed to fetch URL" };
  }
}
