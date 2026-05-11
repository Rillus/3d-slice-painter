export type ProjectManifestV1 = {
  version: 1;
  sliceCount: number;
  spacingWorld: number;
  canvasSize: number;
  planeWidthWorld: number;
  planeHeightWorld: number;
  exportedAt: string;
  /** World-space stack rotation (local +Z → paint plane normal). */
  stackQuaternion?: { x: number; y: number; z: number; w: number };
  /** Cardinal key when chosen from the list; null or omitted after a viewport snap until a cardinal is picked. */
  orientationCardinal?: string | null;
  /** Per-slice offset along the stack axis (world units), same order as PNG indices. */
  sliceAlongStackOffsets?: number[];
  /** In-plane offset in local X / Y (world units after stack rotation), per slice. */
  slicePlaneOffsetX?: number[];
  slicePlaneOffsetY?: number[];
  /** Local scale on the slice quad (multiplier), per slice. */
  slicePlaneScaleX?: number[];
  slicePlaneScaleY?: number[];
};

/** PNG filename for a slice index (PRD-style zero padding). */
export function slicePngFilename(sliceIndex: number): string {
  return `slice_${sliceIndex.toString().padStart(4, "0")}.png`;
}

export function buildProjectManifest(
  fields: Omit<ProjectManifestV1, "version" | "exportedAt">,
  exportedAt: string,
): ProjectManifestV1 {
  return {
    version: 1,
    exportedAt,
    ...fields,
  };
}

export function serialiseManifest(manifest: ProjectManifestV1): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
