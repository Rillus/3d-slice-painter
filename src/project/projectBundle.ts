import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  serialiseManifest,
  slicePngFilename,
  type ProjectManifestV1,
} from "./exportBundle.js";

export type ProjectBundleSlice = {
  filename: string;
  bytes: Uint8Array;
};

export type ProjectBundle = {
  manifest: ProjectManifestV1;
  slices: ProjectBundleSlice[];
};

export type CreateProjectBundleInput = {
  manifest: ProjectManifestV1;
  pngSlices: Uint8Array[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function isQuaternion(value: unknown): value is ProjectManifestV1["stackQuaternion"] {
  if (!value || typeof value !== "object") return false;
  const q = value as Record<string, unknown>;
  return isFiniteNumber(q.x) && isFiniteNumber(q.y) && isFiniteNumber(q.z) && isFiniteNumber(q.w);
}

function isNumberArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

function isQuaternionArray(value: unknown, length: number): value is NonNullable<ProjectManifestV1["sliceStackQuaternions"]> {
  return Array.isArray(value) && value.length === length && value.every(isQuaternion);
}

function isStringOrNullArray(value: unknown, length: number): value is (string | null)[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "string" || item === null)
  );
}

function optionalNumberArray(value: unknown, length: number): value is number[] | undefined {
  return value === undefined || isNumberArray(value, length);
}

function optionalQuaternionArray(
  value: unknown,
  length: number,
): value is ProjectManifestV1["sliceStackQuaternions"] {
  return value === undefined || isQuaternionArray(value, length);
}

function optionalStringOrNullArray(
  value: unknown,
  length: number,
): value is ProjectManifestV1["sliceOrientationCardinals"] {
  return value === undefined || isStringOrNullArray(value, length);
}

export function validateProjectManifest(value: unknown): ProjectManifestV1 | null {
  if (!value || typeof value !== "object") return null;
  const manifest = value as Record<string, unknown>;
  if (manifest.version !== 1) return null;
  if (!isPositiveInteger(manifest.sliceCount)) return null;
  if (!isPositiveFiniteNumber(manifest.spacingWorld)) return null;
  if (!isPositiveInteger(manifest.canvasSize)) return null;
  if (!isPositiveFiniteNumber(manifest.planeWidthWorld)) return null;
  if (!isPositiveFiniteNumber(manifest.planeHeightWorld)) return null;
  if (typeof manifest.exportedAt !== "string" || manifest.exportedAt.length === 0) return null;
  if (manifest.stackQuaternion !== undefined && !isQuaternion(manifest.stackQuaternion)) return null;
  if (
    manifest.orientationCardinal !== undefined &&
    manifest.orientationCardinal !== null &&
    typeof manifest.orientationCardinal !== "string"
  ) {
    return null;
  }

  const sliceCount = manifest.sliceCount;
  if (!optionalQuaternionArray(manifest.sliceStackQuaternions, sliceCount)) return null;
  if (!optionalStringOrNullArray(manifest.sliceOrientationCardinals, sliceCount)) return null;
  if (!optionalNumberArray(manifest.sliceAlongStackOffsets, sliceCount)) return null;
  if (!optionalNumberArray(manifest.slicePlaneOffsetX, sliceCount)) return null;
  if (!optionalNumberArray(manifest.slicePlaneOffsetY, sliceCount)) return null;
  if (!optionalNumberArray(manifest.slicePlaneScaleX, sliceCount)) return null;
  if (!optionalNumberArray(manifest.slicePlaneScaleY, sliceCount)) return null;

  return value as ProjectManifestV1;
}

export function createProjectBundleZip(input: CreateProjectBundleInput): Uint8Array {
  const manifest = validateProjectManifest(input.manifest);
  if (!manifest) throw new Error("Invalid project manifest");
  if (input.pngSlices.length !== manifest.sliceCount) {
    throw new Error(`Expected ${manifest.sliceCount} PNG slices, received ${input.pngSlices.length}`);
  }

  const entries: Record<string, Uint8Array> = {
    "project.json": strToU8(serialiseManifest(manifest)),
  };
  for (let i = 0; i < input.pngSlices.length; i++) {
    entries[slicePngFilename(i)] = input.pngSlices[i]!;
  }
  return zipSync(entries, { level: 6 });
}

export function readProjectBundleZip(bytes: Uint8Array): ProjectBundle {
  const entries = unzipSync(bytes);
  const projectJson = entries["project.json"];
  if (!projectJson) throw new Error("Project bundle is missing project.json");

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(projectJson));
  } catch {
    throw new Error("Project bundle contains invalid project.json");
  }

  const manifest = validateProjectManifest(parsed);
  if (!manifest) throw new Error("Project bundle contains an invalid project.json manifest");

  const slices: ProjectBundleSlice[] = [];
  for (let i = 0; i < manifest.sliceCount; i++) {
    const filename = slicePngFilename(i);
    const slice = entries[filename];
    if (!slice || slice.byteLength === 0) throw new Error(`Project bundle is missing ${filename}`);
    slices.push({ filename, bytes: slice });
  }

  return { manifest, slices };
}
