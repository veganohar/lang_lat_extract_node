export function hardCaps(options) {
    const strategy = options.strategy ?? "time",
        all = ["hybrid", "best"].includes(strategy);
    return {
        maxHours: all || strategy === "time" ? options.maxHours : undefined,
        maxDistanceKm: all || strategy === "distance" ? options.maxDistanceKm : undefined,
        maxCurd: all || strategy === "capacity" ? options.maxCurd : undefined
    };
}

// Build percentages symmetrically and always include the exact base and endpoints.
export function deviationVariants(options) {
    const { percent = 0, stepPercent = 5 } = options.deviation ?? {};
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100)
        throw Error('Deviation must be from 0 up to, but below, 100 percent.');
    if (!Number.isFinite(stepPercent) || stepPercent < 0 || (percent > 0 && stepPercent === 0))
        throw Error('Deviation step must be positive.');
    if (percent > 0 && Math.ceil(percent / stepPercent) > 20)
        throw Error('Choose a larger deviation step: at most 41 limit settings per search.');
    const offsets = [0];
    for (let i = 1; i * stepPercent < percent; i++)
        offsets.push(-i * stepPercent, i * stepPercent);
    if (percent) offsets.push(-percent, percent);
    const caps = hardCaps(options), seen = new Set();
    return offsets.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b).flatMap(offset => {
        const limits = Object.fromEntries(Object.entries(caps).filter(([, value]) => value !== undefined).map(([key, value]) => {
            const scaled = value * (1 + offset / 100);
            return [key, key === 'maxCurd' ? Math.max(1, Math.floor(scaled + 1e-9)) : Number(scaled.toFixed(6))];
        }));
        const key = JSON.stringify(limits);
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ offset, limits }];
    });
}
