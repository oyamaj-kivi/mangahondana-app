export function computeMissingVolumes(ownedNumbers) {
  const whole = ownedNumbers.filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  if (whole.length === 0) return [];
  const min = whole[0];
  const max = whole[whole.length - 1];
  const owned = new Set(whole);
  const missing = [];
  for (let n = min; n <= max; n++) {
    if (!owned.has(n)) missing.push(n);
  }
  return missing;
}

export function extractVolumeNumber(title) {
  if (!title) return null;
  const patterns = [
    /第\s*(\d+(?:\.\d+)?)\s*巻/,
    /\((\d+(?:\.\d+)?)\)/,
    /（(\d+(?:\.\d+)?)）/,
    /\s(\d+(?:\.\d+)?)\s*$/,
    /(\d+(?:\.\d+)?)\s*巻/,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

export function parseVolumeInput(input) {
  if (Array.isArray(input)) {
    return input.map(Number).filter((n) => !Number.isNaN(n));
  }
  if (typeof input !== 'string') return [];
  const numbers = new Set();
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const rangeMatch = part.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      for (let n = Math.min(start, end); n <= Math.max(start, end); n++) numbers.add(n);
    } else {
      const n = Number(part);
      if (!Number.isNaN(n)) numbers.add(n);
    }
  }
  return [...numbers];
}
