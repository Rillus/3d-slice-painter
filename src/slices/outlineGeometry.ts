import * as THREE from "three";

/** Closed rectangle in the XY plane (for `LineLoop`), centred on the origin. */
export function createRectOutlineLoop(width: number, height: number, z = 0): THREE.BufferGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const positions = new Float32Array([
    -hw,
    -hh,
    z,
    hw,
    -hh,
    z,
    hw,
    hh,
    z,
    -hw,
    hh,
    z,
  ]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geom;
}

/** World-space Z for slice index `i` in a stack along −Z, uniform gap. */
export function stackPositionZForIndex(index: number, gapWorld: number): number {
  const g = Math.max(0, gapWorld);
  return -index * g;
}
