/**
 * Reads a map pin from what people paste: a Google Maps link (…/@35.90,14.42,17z or ?q=35.90,14.42)
 * or plain "35.90, 14.42". Returns null if there are no valid coordinates.
 */
export function parsePin(text: string): { latitude: number; longitude: number } | null {
  const t = text.trim();
  const patterns = [/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const latitude = Number(m[1]);
      const longitude = Number(m[2]);
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
    }
  }
  return null;
}

export function mapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
