// import { exec } from "child_process";

// export function clusterWaypointsPython(inputData) {
//   return new Promise((resolve, reject) => {
//     const command = `python3 cluster_service.py '${JSON.stringify(inputData)}'`;
    
//     exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
//       if (error) {
//         console.error("Python Error:", stderr);
//         return reject(error);
//       }
//       try {
//         const result = JSON.parse(stdout);
//         resolve(result);
//       } catch (err) {
//         reject(err);
//       }
//     });
//   });
// }

// Example usage
// (async () => {
//   const input = {
//     depot: "12.9716,77.5946",
//     waypoints: [
//       "12.9352,77.6245", "12.9970,77.6593", "12.9538,77.4903",
//       "13.0352,77.5970", "12.8798,77.6408", "12.9488,77.5806"
//     ],
//     distances: [5.3, 7.1, 8.4, 6.5, 9.2, 4.8],
//     num_clusters: 2,
//     min_per_cluster: 2,
//     max_per_cluster: 4
//   };

//   const result = await clusterWaypointsPython(input);
//   console.log(result);
// })();



import { execFile } from "child_process";
import path from "path";

export function clusterWaypointsPython(inputData) {
  return new Promise((resolve, reject) => {
    // Detect the correct Python command or use absolute path on Windows

    const pythonPath = 'C:\\Users\\mi\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
    const pyFile = path.join('./helpers', 'droc_cluster.py');

    // Run Python with arguments (no need to wrap JSON in quotes here)
    execFile(
      pythonPath,
      [pyFile, JSON.stringify(inputData)],
      { maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Python execution error:", stderr || error.message);
          return reject(error);
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          console.error("JSON parse error:", stdout);
          reject(err);
        }
      }
    );
  });
}
