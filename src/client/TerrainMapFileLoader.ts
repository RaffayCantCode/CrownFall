import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { MapFiles } from "@openfront/engine-api/game/MapFiles";
import { MapManifest } from "@openfront/engine-api/game/MapManifest";
import {
  loadTerrainMap,
  TerrainMapData,
} from "@openfront/engine-lib/game/TerrainMapLoader";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { FetchGameMapLoader } from "@openfront/shared/FetchGameMapLoader";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";

export const terrainMapFileLoader = new FetchGameMapLoader((path) =>
  assetUrl(`maps/${path}`),
);

const terrainMaps = new Map<string, Promise<TerrainMapData>>();
const rawMapFilesCache = new Map<string, Promise<MapFiles>>();
const manifests = new Map<GameMapType, Promise<MapManifest>>();

function cloneMapFiles(files: MapFiles): MapFiles {
  return {
    map: files.map,
    mapSize: files.mapSize,
    manifest: files.manifest,
    mapBin: files.mapBin ? files.mapBin.slice() : undefined,
    map4xBin: files.map4xBin ? files.map4xBin.slice() : undefined,
    map16xBin: files.map16xBin ? files.map16xBin.slice() : undefined,
  };
}

/**
 * Loads and deduplicates raw map binaries + manifest so the main-thread WebGL
 * terrain builder and the Web Worker share a single network download, while
 * returning fresh Uint8Array copies safe to transfer via postMessage.
 */
export async function loadCachedMapFiles(
  map: GameMapType,
  mapSize: GameMapSize,
): Promise<MapFiles> {
  const key = `${map}:${mapSize}`;
  let pending = rawMapFilesCache.get(key);
  if (pending === undefined) {
    pending = loadMapFiles(terrainMapFileLoader, map, mapSize);
    pending.catch(() => {
      if (rawMapFilesCache.get(key) === pending) {
        rawMapFilesCache.delete(key);
      }
    });
    rawMapFilesCache.set(key, pending);
  }
  const files = await pending;
  return cloneMapFiles(files);
}

/** A map's manifest, fetched once. */
export function loadCachedManifest(map: GameMapType): Promise<MapManifest> {
  let manifest = manifests.get(map);
  if (manifest === undefined) {
    manifest = terrainMapFileLoader.getMapData(map).manifest();
    manifest.catch(() => manifests.delete(map));
    manifests.set(map, manifest);
  }
  return manifest;
}

/** The maps the client draws on, built once per map and size. */
export function loadCachedTerrainMap(
  map: GameMapType,
  mapSize: GameMapSize,
): Promise<TerrainMapData> {
  const key = `${map}:${mapSize}`;
  let pending = terrainMaps.get(key);
  if (pending === undefined) {
    pending = loadCachedMapFiles(map, mapSize).then((files) =>
      loadTerrainMap(files),
    );
    pending.catch(() => {
      if (terrainMaps.get(key) === pending) {
        terrainMaps.delete(key);
      }
    });
    terrainMaps.set(key, pending);
  }
  return pending;
}
