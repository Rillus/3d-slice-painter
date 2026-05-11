import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANE_NORMAL,
  quaternionFaceReferenceTowardViewer,
  quaternionForCardinalPreset,
  worldNormalFromCardinal,
} from "./orientation.js";

function applyNormal(q: THREE.Quaternion): THREE.Vector3 {
  return DEFAULT_PLANE_NORMAL.clone().applyQuaternion(q);
}

describe("quaternionForCardinalPreset", () => {
  it("maps +Z preset to +Z world normal", () => {
    const n = applyNormal(quaternionForCardinalPreset("pz"));
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(0);
    expect(n.z).toBeCloseTo(1);
  });

  it("maps −X preset to −X world normal", () => {
    const n = applyNormal(quaternionForCardinalPreset("nx"));
    expect(n.x).toBeCloseTo(-1);
    expect(n.y).toBeCloseTo(0);
    expect(n.z).toBeCloseTo(0);
  });

  it("maps +Y preset to +Y world normal", () => {
    const n = applyNormal(quaternionForCardinalPreset("py"));
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(1);
    expect(n.z).toBeCloseTo(0);
  });
});

describe("worldNormalFromCardinal", () => {
  it("returns unit axes", () => {
    expect(worldNormalFromCardinal("nz").z).toBe(-1);
    expect(worldNormalFromCardinal("px").x).toBe(1);
  });
});

describe("quaternionFaceReferenceTowardViewer", () => {
  it("faces the reference from the viewer direction", () => {
    const ref = new THREE.Vector3(0, 0, 0);
    const eye = new THREE.Vector3(0, 0, 5);
    const q = quaternionFaceReferenceTowardViewer(ref, eye);
    const n = applyNormal(q);
    expect(n.z).toBeGreaterThan(0.99);
  });

  it("returns identity when viewer coincides with reference", () => {
    const p = new THREE.Vector3(1, 2, 3);
    const q = quaternionFaceReferenceTowardViewer(p, p);
    expect(q.w).toBeCloseTo(1);
  });
});
