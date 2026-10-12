// The maps you can play on. Each is built by tools/prep_map.py into public/maps/<id>.json.
export interface MapInfo { id: string; name: string; blurb: string }

export const MAPS: MapInfo[] = [
  { id: "combe-down", name: "Combe Down", blurb: "Village streets, quarry-stone terraces and the Foxhill estate" },
  { id: "victoria-park", name: "Royal Victoria Park", blurb: "Bath's great park, below the Royal Crescent, up to the Circus" },
];

/** Games from before there was a choice of map don't say which map they're on: it was this one. */
export const DEFAULT_MAP = "combe-down";

export const mapInfo = (id: string) => MAPS.find((m) => m.id === id);
export const mapName = (id: string) => mapInfo(id)?.name ?? id;
