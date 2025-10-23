
import { execFile } from "child_process";
import path from "path";

export function clusterWaypointsPython(inputData) {
  return new Promise((resolve, reject) => {
    // Detect the correct Python command or use absolute path on Windows
    const isWin = process.platform === "win32";
    const pythonPath = process.env.PYTHON_PATH || (isWin ? "python" : "python3");
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
