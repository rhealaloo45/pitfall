/* Playable-area helpers. (The tabletop slab this file used to build is gone:
   the city now runs into the sea and into the suburbs beyond the map edge.) */
import { WORLD_BOUNDS as B } from './layout.js';

/** True if (x, z) is at least `inset` metres inside the playable bounds. */
export function insideSlab(x, z, inset = 0) {
  return x > B.minX + inset && x < B.maxX - inset && z > B.minZ + inset && z < B.maxZ - inset;
}
