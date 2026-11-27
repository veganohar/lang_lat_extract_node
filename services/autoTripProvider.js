import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
export async function googleAutoOptimize(request) {
    const { getAccessToken } = await import("../utils/googleAuth.js");
    const token = await getAccessToken();
    const response = await fetch(
        config.routeOptimizationUrl.replace("{projectId}", process.env.GOOGLE_PROJECT_ID),
        {
            method: "POST",
            signal: AbortSignal.timeout(75000),
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "X-Server-Timeout": "70"
            },
            body: JSON.stringify(request)
        }
    );
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        const infeasible =
            body?.error?.status === "INVALID_ARGUMENT" &&
            /infeasib/i.test(body?.error?.message ?? "");
        throw Object.assign(
            new Error(
                `Google auto-split optimization failed (HTTP ${response.status}). No estimated plan was substituted.`
            ),
            { code: infeasible ? "AUTO_INFEASIBLE" : "AUTO_PROVIDER_FAILURE" }
        );
    }
    return response.json();
}
