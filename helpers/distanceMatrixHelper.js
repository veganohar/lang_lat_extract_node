import fs from "fs";
import { execFile } from "child_process";
import { readFile } from "fs/promises";
import path from "path";

const config = JSON.parse(
  await readFile(new URL("../config/config.json", import.meta.url))
);

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function optimizeDeliveries(locations, numVehicles) {
  const n = locations.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  const batchSize = 10; // adjust to stay under Google API limits
  const originBatches = chunkArray([...Array(n).keys()], batchSize);
  const destBatches = chunkArray([...Array(n).keys()], batchSize);

  // Build Distance Matrix
  for (const origins of originBatches) {
    for (const destinations of destBatches) {
      const originsStr = origins.map(i => `${locations[i][0]},${locations[i][1]}`).join('|');
      const destStr = destinations.map(i => `${locations[i][0]},${locations[i][1]}`).join('|');
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsStr}&destinations=${destStr}&key=${process.env.GOOGLE_MAP_API_KEY}&mode=bycycling`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.rows || data.rows.length === 0) {
        throw new Error('Distance Matrix API returned empty rows. Check API key or limits.');
      }

      origins.forEach((o, i) => {
        destinations.forEach((d, j) => {
          const element = data.rows[i].elements[j];
          matrix[o][d] = element.status === 'OK' ? element.distance.value : 999999;
        });
      });
    }
  }


  // Save matrix for Python
  fs.writeFileSync(path.join('.', 'distance_matrix.json'), JSON.stringify(matrix));
  // Call Python OR-Tools
  return new Promise((resolve, reject) => {
    const pythonPath = 'C:\\Users\\mi\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
    const pyFile = path.join('./helpers', 'vrp_solver.py');
    execFile(pythonPath, [pyFile, numVehicles], (err, stdout, stderr) => {
      if (err) return reject(err);
      try {
        const trips = JSON.parse(stdout);
        const tripLinks = trips.map(trip => {
          if (trip.length <= 1) return "";
          const origin = `${locations[trip[0]][0]},${locations[trip[0]][1]}`;
          const waypoints = trip.slice(1, -1).map(i => `${locations[i][0]},${locations[i][1]}`);
          return `https://www.google.com/maps/dir/${origin}/${waypoints.join('/')}/${origin}`;
        });

        resolve({ trips,tripLinks });
      } catch (e) {
        reject(e);
      }
    });
  });
}
