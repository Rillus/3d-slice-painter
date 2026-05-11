import * as THREE from "three";

/** Default `PlaneGeometry` normal before mesh rotation. */
export const DEFAULT_PLANE_NORMAL = new THREE.Vector3(0, 0, 1);

export type CardinalPreset = "pz" | "nz" | "px" | "nx" | "py" | "ny";

export function isCardinalPreset(value: string): value is CardinalPreset {
  return value === "pz" || value === "nz" || value === "px" || value === "nx" || value === "py" || value === "ny";
}

export function worldNormalFromCardinal(preset: CardinalPreset): THREE.Vector3 {
  switch (preset) {
    case "pz":
      return new THREE.Vector3(0, 0, 1);
    case "nz":
      return new THREE.Vector3(0, 0, -1);
    case "px":
      return new THREE.Vector3(1, 0, 0);
    case "nx":
      return new THREE.Vector3(-1, 0, 0);
    case "py":
      return new THREE.Vector3(0, 1, 0);
    case "ny":
      return new THREE.Vector3(0, -1, 0);
  }
}

/** Quaternion so local +Z aligns with the given world-space plane normal. */
export function quaternionForCardinalPreset(preset: CardinalPreset): THREE.Quaternion {
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(DEFAULT_PLANE_NORMAL, worldNormalFromCardinal(preset));
  return q;
}

/**
 * Face the slice toward `viewerPosition` from a reference point on the stack (e.g. orbit target).
 * Plane normal = direction from reference toward viewer.
 */
export function quaternionFaceReferenceTowardViewer(
  referencePoint: THREE.Vector3,
  viewerPosition: THREE.Vector3,
): THREE.Quaternion {
  const dir = viewerPosition.clone().sub(referencePoint);
  if (dir.lengthSq() < 1e-12) return new THREE.Quaternion();
  dir.normalize();
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(DEFAULT_PLANE_NORMAL, dir);
  return q;
}
