import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { compositeDab, compositeEraseDab, type RgbaByte } from "./brush/stamp.js";
import { normaliseBrushParams, type BrushParams } from "./brush/params.js";
import { dabSpacingForRadius, samplesAlongSegment } from "./brush/strokePath.js";
import { formatHexRgb, parseHexRgba, swatchKeyFromRgba } from "./colour/hex.js";
import { createRectOutlineLoop } from "./slices/outlineGeometry.js";
import {
  isCardinalPreset,
  quaternionFaceReferenceTowardViewer,
  quaternionForCardinalPreset,
} from "./slices/orientation.js";
import { stackNudgeStepWorld, stackPositionScalar } from "./slices/stackPosition.js";
import {
  bumpTierUpUntilMeshFits,
  clampMeshScale,
  clampMeshScaleToTierCap,
  clampTierIndex,
  inferTierFromMeshScale,
  meshScaleFromSliderValue,
  ratchetTierDown,
  ratchetTierUp,
  sliderStepForTierMax,
  tierMaxForIndex,
  type ScaleTierIndex,
} from "./slices/sliceScaleTier.js";
import {
  buildProjectManifest,
  type ProjectManifestV1,
} from "./project/exportBundle.js";
import { createProjectBundleZip, readProjectBundleZip } from "./project/projectBundle.js";
import {
  createLocalProjectStore,
  type LocalProjectRecord,
  type LocalProjectStore,
} from "./project/localProjects.js";
import { loadHudDockExpanded, saveHudDockExpanded, type HudDockId } from "./ui/hudDockPrefs.js";
import { pushPreStrokeSnapshot } from "./paint/undoStack.js";

const PAINT_RES = 512;
const PLANE_W = 2.4;
const PLANE_H = 2.4;
const MAX_SLICES = 128;
const MAX_UNDO_STROKES = 24;
const LS_COLOUR = "3dsp.brushColour";
const LS_SWATCHES = "3dsp.swatches";
const LEGACY_SESSION_PAINTING_KEY = "3dsp.sessionPainting.v1";
const MAX_SWATCHES = 12;
const DEFAULT_PROJECT_NAME = "Untitled project";
const RECENT_PROJECT_LIMIT = 5;

const SLICE_PLANE_POS_MIN = -3;
const SLICE_PLANE_POS_MAX = 3;

function getViewportCanvas(): HTMLCanvasElement {
  const el = document.querySelector("#c");
  if (!(el instanceof HTMLCanvasElement)) throw new Error("Missing #c canvas");
  return el;
}

const canvas = getViewportCanvas();

const brushSize = document.querySelector<HTMLInputElement>("#brush-size");
const brushOpacity = document.querySelector<HTMLInputElement>("#brush-opacity");
const brushHardness = document.querySelector<HTMLInputElement>("#brush-hardness");
const brushShape = document.querySelector<HTMLSelectElement>("#brush-shape");
const brushSlant = document.querySelector<HTMLInputElement>("#brush-slant");
const brushTexture = document.querySelector<HTMLSelectElement>("#brush-texture");
const modePaintBtn = document.querySelector<HTMLButtonElement>("#mode-paint");
const modeNavigateBtn = document.querySelector<HTMLButtonElement>("#mode-navigate");
const colourNative = document.querySelector<HTMLInputElement>("#colour-native");
const colourHex = document.querySelector<HTMLInputElement>("#colour-hex");
const brushColourGroup = document.querySelector<HTMLDivElement>("#brush-colour-group");
const colourTransparentBtn = document.querySelector<HTMLButtonElement>("#colour-transparent");
const paintUndoBtn = document.querySelector<HTMLButtonElement>("#paint-undo");
const swatchesContainer = document.querySelector<HTMLDivElement>("#colour-swatches");
const sliceActiveLabel = document.querySelector<HTMLSpanElement>("#slice-active-label");
const slicePrevBtn = document.querySelector<HTMLButtonElement>("#slice-prev");
const sliceNextBtn = document.querySelector<HTMLButtonElement>("#slice-next");
const sliceNudgeBackBtn = document.querySelector<HTMLButtonElement>("#slice-nudge-back");
const sliceNudgeForwardBtn = document.querySelector<HTMLButtonElement>("#slice-nudge-forward");
const sliceAddBtn = document.querySelector<HTMLButtonElement>("#slice-add");
const sliceSpacingInput = document.querySelector<HTMLInputElement>("#slice-spacing");
const sliceOrientSelect = document.querySelector<HTMLSelectElement>("#slice-orient");
const sliceOrientViewportBtn = document.querySelector<HTMLButtonElement>("#slice-orient-viewport");
const slicePlanePxInput = document.querySelector<HTMLInputElement>("#slice-plane-px");
const slicePlanePyInput = document.querySelector<HTMLInputElement>("#slice-plane-py");
const slicePlaneSxInput = document.querySelector<HTMLInputElement>("#slice-plane-sx");
const slicePlaneSyInput = document.querySelector<HTMLInputElement>("#slice-plane-sy");
const slicePlanePxOut = document.querySelector<HTMLOutputElement>("#slice-plane-px-out");
const slicePlanePyOut = document.querySelector<HTMLOutputElement>("#slice-plane-py-out");
const slicePlaneSxOut = document.querySelector<HTMLOutputElement>("#slice-plane-sx-out");
const slicePlaneSyOut = document.querySelector<HTMLOutputElement>("#slice-plane-sy-out");
const projectNewBtn = document.querySelector<HTMLButtonElement>("#project-new");
const projectSaveBtn = document.querySelector<HTMLButtonElement>("#project-save");
const projectLoadBtn = document.querySelector<HTMLButtonElement>("#project-load");
const projectLoadInput = document.querySelector<HTMLInputElement>("#project-load-input");
const projectExportBtn = document.querySelector<HTMLButtonElement>("#project-export");
const projectStatus = document.querySelector<HTMLDivElement>("#project-status");
const projectRecentList = document.querySelector<HTMLDivElement>("#project-recent-list");

type InteractionMode = "paint" | "navigate";
let interactionMode: InteractionMode = "paint";

let brushColour: RgbaByte = { r: 200, g: 55, b: 48, a: 255 };
let swatches: string[] = [];
let lastPaintCanvas: { cx: number; cy: number } | null = null;
let currentLocalProjectId: string | undefined;
let currentProjectName = DEFAULT_PROJECT_NAME;
let localProjectStore: LocalProjectStore | null = null;
let localSaveTimer: ReturnType<typeof setTimeout> | null = null;
let localSaveInProgress = false;
let localSaveQueued = false;
let lastLocalSaveError = false;
let recentThumbnailUrls: string[] = [];

try {
  localProjectStore = createLocalProjectStore();
} catch (err) {
  console.warn("IndexedDB project storage is unavailable", err);
}

function loadStoredColour(): void {
  try {
    const h = localStorage.getItem(LS_COLOUR);
    if (!h) return;
    const p = parseHexRgba(h);
    if (!p) return;
    brushColour = { r: p.r, g: p.g, b: p.b, a: p.a };
  } catch {
    /* storage unavailable */
  }
}

function saveColour(): void {
  try {
    localStorage.setItem(LS_COLOUR, swatchKeyFromRgba(brushColour));
  } catch {
    /* ignore */
  }
}

function loadStoredSwatches(): string[] {
  try {
    const raw = localStorage.getItem(LS_SWATCHES);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((h) => h.toLowerCase())
      .filter((h) => parseHexRgba(h) !== null)
      .slice(0, MAX_SWATCHES);
  } catch {
    return [];
  }
}

function saveSwatches(): void {
  try {
    localStorage.setItem(LS_SWATCHES, JSON.stringify(swatches));
  } catch {
    /* ignore */
  }
}

function recordSwatch(hex: string): void {
  const p = parseHexRgba(hex);
  if (!p) return;
  const key = swatchKeyFromRgba(p);
  swatches = [key, ...swatches.filter((h) => h.toLowerCase() !== key)].slice(0, MAX_SWATCHES);
  saveSwatches();
  renderSwatches();
}

function syncColourInputs(): void {
  if (colourHex) colourHex.value = swatchKeyFromRgba(brushColour);
  if (colourNative) {
    colourNative.value = formatHexRgb(brushColour.r, brushColour.g, brushColour.b).toLowerCase();
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function applyRgb(rgb: { r: number; g: number; b: number; a?: number }, persistColour: boolean): void {
  const a = rgb.a !== undefined ? clampByte(rgb.a) : 255;
  brushColour = {
    r: clampByte(rgb.r),
    g: clampByte(rgb.g),
    b: clampByte(rgb.b),
    a,
  };
  syncColourInputs();
  if (persistColour) saveColour();
}

function applyHexString(raw: string, persistColour: boolean): boolean {
  const parsed = parseHexRgba(raw);
  if (!parsed) return false;
  applyRgb(parsed, persistColour);
  return true;
}

function renderSwatches(): void {
  if (!swatchesContainer) return;
  swatchesContainer.replaceChildren();
  const disabled = interactionMode === "navigate";
  for (const hex of swatches) {
    const c = parseHexRgba(hex);
    if (!c) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hud__swatch";
    btn.disabled = disabled;
    if (c.a === 0) {
      btn.classList.add("hud__swatch--erase");
    } else {
      btn.style.backgroundColor = `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;
    }
    btn.setAttribute("aria-label", `Select colour ${hex}`);
    btn.addEventListener("click", () => {
      if (interactionMode !== "paint") return;
      if (applyHexString(hex, true)) recordSwatch(hex);
    });
    swatchesContainer.appendChild(btn);
  }
}

loadStoredColour();
swatches = loadStoredSwatches();
syncColourInputs();

function hudDockToggleLabel(id: HudDockId, expanded: boolean): string {
  switch (id) {
    case "toolbar":
      return expanded ? "Hide toolbar" : "Show toolbar";
    case "left":
      return expanded ? "Hide tools" : "Show tools";
    case "right":
      return expanded ? "Hide slices" : "Show slices";
    default:
      return expanded ? "Hide panel" : "Show panel";
  }
}

function applyHudDockExpanded(dock: HTMLElement, id: HudDockId, expanded: boolean): void {
  dock.classList.toggle("hud-dock--collapsed", !expanded);
  const toggle = dock.querySelector<HTMLButtonElement>(".hud-dock__toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.setAttribute("aria-label", hudDockToggleLabel(id, expanded));
  }
}

function initHudDocks(): void {
  const docks: { id: HudDockId; el: HTMLElement | null }[] = [
    { id: "toolbar", el: document.getElementById("hud-dock-toolbar") },
    { id: "left", el: document.getElementById("hud-dock-left") },
    { id: "right", el: document.getElementById("hud-dock-right") },
  ];
  for (const { id, el } of docks) {
    if (!el) continue;
    applyHudDockExpanded(el, id, loadHudDockExpanded(id));
    const toggle = el.querySelector<HTMLButtonElement>(".hud-dock__toggle");
    toggle?.addEventListener("click", () => {
      const nextExpanded = el.classList.contains("hud-dock--collapsed");
      saveHudDockExpanded(id, nextExpanded);
      applyHudDockExpanded(el, id, nextExpanded);
    });
  }
}

type SliceState = {
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  paintCanvas: HTMLCanvasElement;
  paint2d: CanvasRenderingContext2D;
  imageData: ImageData;
  /** Extra translation along the stack axis (world units), relative to nominal grid. */
  alongStackOffset: number;
  /** In-plane translation in mesh local X / Y (world units after stack rotation). */
  planeOffsetX: number;
  planeOffsetY: number;
  /** Local scale on the slice quad (multiplier). */
  planeScaleX: number;
  planeScaleY: number;
  /** Pre-stroke pixel snapshots for undo (newest at end). */
  undoStack: Uint8ClampedArray[];
  /** World rotation: local +Z (paint normal) → world. */
  stackQuaternion: THREE.Quaternion;
  /** Last chosen value for the slice facing control (`viewport_action` after match viewport). */
  sliceFacingSelectValue: string;
  /** Scale slider tier (0 = max 2 … 3 = max 50); ratchet on release at slider ends. */
  scaleSliderTierX: ScaleTierIndex;
  scaleSliderTierY: ScaleTierIndex;
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d23);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
camera.position.set(0, 0, 3.2);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const planeGeo = new THREE.PlaneGeometry(PLANE_W, PLANE_H);

const slices: SliceState[] = [];
let activeSliceIndex = 0;
let sliceSpacingWorld = 0.12;

function getPaint2d(canvasEl: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context not available");
  return ctx;
}

function createSliceState(): SliceState {
  const paintCanvas = document.createElement("canvas");
  paintCanvas.width = PAINT_RES;
  paintCanvas.height = PAINT_RES;
  const paint2d = getPaint2d(paintCanvas);
  const imageData = paint2d.createImageData(PAINT_RES, PAINT_RES);
  imageData.data.fill(0);
  paint2d.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(paintCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    /* Let alpha < 1 show slices behind along the view; true would write plane depth for holes. */
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(planeGeo, mat);
  scene.add(mesh);

  return {
    mesh,
    texture,
    paintCanvas,
    paint2d,
    imageData,
    alongStackOffset: 0,
    planeOffsetX: 0,
    planeOffsetY: 0,
    planeScaleX: 1,
    planeScaleY: 1,
    undoStack: [],
    stackQuaternion: quaternionForCardinalPreset("pz").clone(),
    sliceFacingSelectValue: "pz",
    scaleSliderTierX: 0,
    scaleSliderTierY: 0,
  };
}

const sliceFrame = new THREE.LineLoop(
  createRectOutlineLoop(PLANE_W, PLANE_H, 0),
  new THREE.LineBasicMaterial({ color: 0x000000 }),
);
sliceFrame.position.z = 0.002;
sliceFrame.renderOrder = 2;

function getActiveSlice(): SliceState | undefined {
  return slices[activeSliceIndex];
}

function updateSliceTransforms(): void {
  const gap = sliceSpacingWorld;
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i]!;
    const m = s.mesh;
    const q = s.stackQuaternion;
    m.quaternion.copy(q);
    const worldNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const scalar = stackPositionScalar(i, gap, s.alongStackOffset);
    const stackPos = worldNormal.clone().multiplyScalar(scalar);
    const lateral = new THREE.Vector3(s.planeOffsetX, s.planeOffsetY, 0).applyQuaternion(q);
    m.position.copy(stackPos.add(lateral));
    const sx = clampMeshScale(s.planeScaleX);
    const sy = clampMeshScale(s.planeScaleY);
    m.scale.set(sx, sy, 1);
  }
}

function syncSliceOrientationUiFromActive(): void {
  const s = getActiveSlice();
  if (!sliceOrientSelect || !s) return;
  sliceOrientSelect.value = s.sliceFacingSelectValue;
}

function clampSlicePlanePos(n: number): number {
  return Math.min(SLICE_PLANE_POS_MAX, Math.max(SLICE_PLANE_POS_MIN, n));
}

function formatPlaneReadout(el: HTMLOutputElement | null, n: number): void {
  if (!el) return;
  const abs = Math.abs(n);
  el.textContent = abs >= 10 ? n.toFixed(1) : abs >= 1 ? n.toFixed(2) : n.toFixed(2);
}

function syncSlicePlaneInputsFromActive(): void {
  const s = getActiveSlice();
  if (!s) return;
  const px = clampSlicePlanePos(s.planeOffsetX);
  const py = clampSlicePlanePos(s.planeOffsetY);
  s.scaleSliderTierX = bumpTierUpUntilMeshFits(clampTierIndex(s.scaleSliderTierX), s.planeScaleX);
  s.scaleSliderTierY = bumpTierUpUntilMeshFits(clampTierIndex(s.scaleSliderTierY), s.planeScaleY);
  const tx = clampTierIndex(s.scaleSliderTierX);
  const ty = clampTierIndex(s.scaleSliderTierY);
  const maxX = tierMaxForIndex(tx);
  const maxY = tierMaxForIndex(ty);
  const sxMesh = clampMeshScale(s.planeScaleX);
  const syMesh = clampMeshScale(s.planeScaleY);
  if (slicePlanePxInput) slicePlanePxInput.value = String(px);
  if (slicePlanePyInput) slicePlanePyInput.value = String(py);
  if (slicePlaneSxInput) {
    slicePlaneSxInput.min = "0";
    slicePlaneSxInput.max = String(maxX);
    slicePlaneSxInput.step = sliderStepForTierMax(maxX);
    slicePlaneSxInput.value = String(Math.min(sxMesh, maxX));
  }
  if (slicePlaneSyInput) {
    slicePlaneSyInput.min = "0";
    slicePlaneSyInput.max = String(maxY);
    slicePlaneSyInput.step = sliderStepForTierMax(maxY);
    slicePlaneSyInput.value = String(Math.min(syMesh, maxY));
  }
  formatPlaneReadout(slicePlanePxOut, px);
  formatPlaneReadout(slicePlanePyOut, py);
  formatPlaneReadout(slicePlaneSxOut, sxMesh);
  formatPlaneReadout(slicePlaneSyOut, syMesh);
}

function applyActiveSlicePlaneFromInputs(): void {
  const s = getActiveSlice();
  if (!s) return;
  const px = Number(slicePlanePxInput?.value ?? 0);
  const py = Number(slicePlanePyInput?.value ?? 0);
  const rawSx = Number(slicePlaneSxInput?.value ?? 1);
  const rawSy = Number(slicePlaneSyInput?.value ?? 1);
  const maxX = tierMaxForIndex(clampTierIndex(s.scaleSliderTierX));
  const maxY = tierMaxForIndex(clampTierIndex(s.scaleSliderTierY));
  s.planeOffsetX = Number.isFinite(px) ? clampSlicePlanePos(px) : 0;
  s.planeOffsetY = Number.isFinite(py) ? clampSlicePlanePos(py) : 0;
  s.planeScaleX = Number.isFinite(rawSx) ? meshScaleFromSliderValue(rawSx, maxX) : 1;
  s.planeScaleY = Number.isFinite(rawSy) ? meshScaleFromSliderValue(rawSy, maxY) : 1;
  syncSlicePlaneInputsFromActive();
  updateSliceTransforms();
  schedulePersistPaintingSession();
}

function commitSliceScaleSlider(axis: "x" | "y"): void {
  const s = getActiveSlice();
  const el = axis === "x" ? slicePlaneSxInput : slicePlaneSyInput;
  if (!s || !el) return;
  const max = Number(el.max);
  const min = Number(el.min);
  const val = Number(el.value);
  const step = Math.max(1e-6, Number(el.step) || 0.02);
  const atMax = val >= max - step * 0.55;
  const atMin = val <= min + step * 0.55;
  let changed = false;
  if (atMax && (axis === "x" ? s.scaleSliderTierX : s.scaleSliderTierY) < 3) {
    if (axis === "x") s.scaleSliderTierX = ratchetTierUp(clampTierIndex(s.scaleSliderTierX));
    else s.scaleSliderTierY = ratchetTierUp(clampTierIndex(s.scaleSliderTierY));
    changed = true;
  } else if (atMin && (axis === "x" ? s.scaleSliderTierX : s.scaleSliderTierY) > 0) {
    if (axis === "x") {
      const nt = ratchetTierDown(clampTierIndex(s.scaleSliderTierX));
      s.scaleSliderTierX = nt;
      s.planeScaleX = clampMeshScaleToTierCap(s.planeScaleX, nt);
    } else {
      const nt = ratchetTierDown(clampTierIndex(s.scaleSliderTierY));
      s.scaleSliderTierY = nt;
      s.planeScaleY = clampMeshScaleToTierCap(s.planeScaleY, nt);
    }
    changed = true;
  }
  if (changed) {
    syncSlicePlaneInputsFromActive();
    updateSliceTransforms();
    schedulePersistPaintingSession();
  }
}

function nudgeActiveSliceAlongStack(direction: 1 | -1): void {
  const s = getActiveSlice();
  if (!s) return;
  const step = stackNudgeStepWorld(sliceSpacingWorld);
  s.alongStackOffset += direction * step;
  updateSliceTransforms();
  schedulePersistPaintingSession();
}

function applySliceOrientationFromSelect(): void {
  const s = getActiveSlice();
  const v = sliceOrientSelect?.value;
  if (!s || !v) return;
  if (v === "viewport_action") {
    matchSliceOrientationToViewport();
    return;
  }
  if (isCardinalPreset(v)) {
    s.stackQuaternion.copy(quaternionForCardinalPreset(v));
    s.sliceFacingSelectValue = v;
    updateSliceTransforms();
    schedulePersistPaintingSession();
  }
}

function matchSliceOrientationToViewport(): void {
  const s = getActiveSlice();
  if (!s) return;
  s.stackQuaternion.copy(quaternionFaceReferenceTowardViewer(controls.target, camera.position));
  s.sliceFacingSelectValue = "viewport_action";
  if (sliceOrientSelect) sliceOrientSelect.value = "viewport_action";
  updateSliceTransforms();
  schedulePersistPaintingSession();
}

function readSliceSpacingFromInput(): number {
  const raw = Number(sliceSpacingInput?.value ?? 0.12);
  if (!Number.isFinite(raw)) return 0.12;
  return Math.max(0.001, raw);
}

function refreshSliceSpacingFromInput(): void {
  sliceSpacingWorld = readSliceSpacingFromInput();
  updateSliceTransforms();
  schedulePersistPaintingSession();
}

function attachFrameToActiveSlice(): void {
  const s = getActiveSlice();
  if (!s) return;
  if (sliceFrame.parent) sliceFrame.parent.remove(sliceFrame);
  s.mesh.add(sliceFrame);
}

function updateSliceHud(): void {
  const n = slices.length;
  const idx = activeSliceIndex + 1;
  if (sliceActiveLabel) sliceActiveLabel.textContent = `Slice ${idx} / ${n}`;
  if (slicePrevBtn) slicePrevBtn.disabled = interactionMode === "navigate" || activeSliceIndex <= 0;
  if (sliceNextBtn) sliceNextBtn.disabled = interactionMode === "navigate" || activeSliceIndex >= n - 1;
  if (sliceAddBtn) sliceAddBtn.disabled = interactionMode === "navigate" || n >= MAX_SLICES;
  if (sliceSpacingInput) sliceSpacingInput.disabled = interactionMode === "navigate";
  if (sliceOrientSelect) sliceOrientSelect.disabled = interactionMode === "navigate";
  if (sliceOrientViewportBtn) sliceOrientViewportBtn.disabled = interactionMode === "navigate";
  if (sliceNudgeBackBtn) sliceNudgeBackBtn.disabled = interactionMode === "navigate";
  if (sliceNudgeForwardBtn) sliceNudgeForwardBtn.disabled = interactionMode === "navigate";
  for (const el of [slicePlanePxInput, slicePlanePyInput, slicePlaneSxInput, slicePlaneSyInput]) {
    if (el) el.disabled = interactionMode === "navigate";
  }
  syncSlicePlaneInputsFromActive();
  syncSliceOrientationUiFromActive();
  syncUndoButton();
}

function pushStrokeUndoSnapshot(s: SliceState): void {
  pushPreStrokeSnapshot(s.undoStack, s.imageData.data, MAX_UNDO_STROKES);
}

function undoLastStroke(): void {
  const s = getActiveSlice();
  if (!s || s.undoStack.length === 0) return;
  const restore = s.undoStack.pop()!;
  s.imageData.data.set(restore);
  flushSliceTexture(s);
  syncUndoButton();
  schedulePersistPaintingSession();
}

function syncUndoButton(): void {
  const s = getActiveSlice();
  paintUndoBtn && (paintUndoBtn.disabled = !s || s.undoStack.length === 0);
}

function setActiveSliceIndex(next: number): void {
  const n = slices.length;
  if (n === 0) return;
  activeSliceIndex = Math.max(0, Math.min(n - 1, next));
  attachFrameToActiveSlice();
  updateSliceHud();
}

function addSlice(): void {
  if (slices.length >= MAX_SLICES) return;
  sliceSpacingWorld = readSliceSpacingFromInput();
  slices.push(createSliceState());
  activeSliceIndex = slices.length - 1;
  updateSliceTransforms();
  attachFrameToActiveSlice();
  updateSliceHud();
  schedulePersistPaintingSession();
}

function flushSliceTexture(s: SliceState): void {
  s.paint2d.putImageData(s.imageData, 0, 0);
  s.texture.needsUpdate = true;
}

function disposeSlice(s: SliceState): void {
  scene.remove(s.mesh);
  const mat = s.mesh.material;
  if (mat instanceof THREE.MeshBasicMaterial) {
    mat.map?.dispose();
    mat.dispose();
  }
}

function imageDataToPngBlob(data: ImageData): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D context unavailable"));
  ctx.putImageData(data, 0, 0);
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG encoding failed"));
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function decodePngBlobToImageData(blob: Blob, w: number, h: number): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const finish = (value: ImageData | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== w || img.naturalHeight !== h) {
        finish(null);
        return;
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) {
        finish(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      finish(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

function clearLegacySessionPaintingStorage(): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_PAINTING_KEY);
  } catch {
    /* ignore */
  }
}

function setProjectStatus(message: string): void {
  if (projectStatus) projectStatus.textContent = message;
}

function projectManifestForCurrentArtwork(exportedAt: string): ProjectManifestV1 {
  const s0 = slices[0];
  const orientationCardinal =
    s0 && isCardinalPreset(s0.sliceFacingSelectValue) ? s0.sliceFacingSelectValue : null;
  return buildProjectManifest(
    {
      sliceCount: slices.length,
      spacingWorld: sliceSpacingWorld,
      canvasSize: PAINT_RES,
      planeWidthWorld: PLANE_W,
      planeHeightWorld: PLANE_H,
      stackQuaternion: s0
        ? {
            x: s0.stackQuaternion.x,
            y: s0.stackQuaternion.y,
            z: s0.stackQuaternion.z,
            w: s0.stackQuaternion.w,
          }
        : undefined,
      sliceStackQuaternions: slices.map((s) => ({
        x: s.stackQuaternion.x,
        y: s.stackQuaternion.y,
        z: s.stackQuaternion.z,
        w: s.stackQuaternion.w,
      })),
      orientationCardinal,
      sliceOrientationCardinals: slices.map((s) =>
        isCardinalPreset(s.sliceFacingSelectValue) ? s.sliceFacingSelectValue : null,
      ),
      sliceAlongStackOffsets: slices.map((s) => s.alongStackOffset),
      slicePlaneOffsetX: slices.map((s) => s.planeOffsetX),
      slicePlaneOffsetY: slices.map((s) => s.planeOffsetY),
      slicePlaneScaleX: slices.map((s) => s.planeScaleX),
      slicePlaneScaleY: slices.map((s) => s.planeScaleY),
    },
    exportedAt,
  );
}

async function buildCurrentProjectBundle(now = new Date()): Promise<{ manifest: ProjectManifestV1; zipBlob: Blob }> {
  if (slices.length === 0) throw new Error("No slices to save");
  const pngSlices: Uint8Array[] = [];
  for (const s of slices) {
    const blob = await imageDataToPngBlob(s.imageData);
    pngSlices.push(new Uint8Array(await blob.arrayBuffer()));
  }
  const manifest = projectManifestForCurrentArtwork(now.toISOString());
  const zipped = createProjectBundleZip({ manifest, pngSlices });
  return { manifest, zipBlob: new Blob([zipped], { type: "application/zip" }) };
}

function imageDataToThumbnailBlob(data: ImageData): Promise<Blob> {
  const source = document.createElement("canvas");
  source.width = data.width;
  source.height = data.height;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return Promise.reject(new Error("2D context unavailable"));
  sourceCtx.putImageData(data, 0, 0);

  const size = 96;
  const thumb = document.createElement("canvas");
  thumb.width = size;
  thumb.height = size;
  const thumbCtx = thumb.getContext("2d");
  if (!thumbCtx) return Promise.reject(new Error("2D context unavailable"));
  thumbCtx.clearRect(0, 0, size, size);
  thumbCtx.drawImage(source, 0, 0, size, size);
  return new Promise((resolve, reject) => {
    thumb.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Thumbnail encoding failed"));
    }, "image/png");
  });
}

function applyProjectManifestToSlices(manifest: ProjectManifestV1, decoded: ImageData[]): void {
  if (sliceFrame.parent) sliceFrame.parent.remove(sliceFrame);
  for (const s of slices) disposeSlice(s);
  slices.length = 0;
  for (let i = 0; i < decoded.length; i++) slices.push(createSliceState());
  for (let i = 0; i < decoded.length; i++) {
    const s = slices[i]!;
    s.imageData.data.set(decoded[i]!.data);
    s.undoStack.length = 0;
    flushSliceTexture(s);
  }

  for (let i = 0; i < decoded.length; i++) {
    const s = slices[i]!;
    s.alongStackOffset = manifest.sliceAlongStackOffsets?.[i] ?? 0;
    s.planeOffsetX = manifest.slicePlaneOffsetX?.[i] ?? 0;
    s.planeOffsetY = manifest.slicePlaneOffsetY?.[i] ?? 0;
    s.planeScaleX = manifest.slicePlaneScaleX?.[i] ?? 1;
    s.planeScaleY = manifest.slicePlaneScaleY?.[i] ?? 1;

    const q = manifest.sliceStackQuaternions?.[i] ?? manifest.stackQuaternion;
    if (q) {
      s.stackQuaternion.set(q.x, q.y, q.z, q.w);
      s.stackQuaternion.normalize();
    }

    const facing = manifest.sliceOrientationCardinals?.[i] ?? manifest.orientationCardinal;
    if (facing && isCardinalPreset(facing)) {
      s.sliceFacingSelectValue = facing;
    } else if (q) {
      s.sliceFacingSelectValue = "viewport_action";
    }
    s.scaleSliderTierX = bumpTierUpUntilMeshFits(inferTierFromMeshScale(s.planeScaleX), s.planeScaleX);
    s.scaleSliderTierY = bumpTierUpUntilMeshFits(inferTierFromMeshScale(s.planeScaleY), s.planeScaleY);
  }

  sliceSpacingWorld = Math.max(0.001, manifest.spacingWorld);
  if (sliceSpacingInput) sliceSpacingInput.value = String(sliceSpacingWorld);
  activeSliceIndex = 0;
  attachFrameToActiveSlice();
  updateSliceTransforms();
  updateSliceHud();
  syncUndoButton();
}

async function applyProjectBundleBytes(bytes: Uint8Array): Promise<ProjectManifestV1> {
  const bundle = readProjectBundleZip(bytes);
  const { manifest } = bundle;
  if (manifest.canvasSize !== PAINT_RES) {
    throw new Error(`Unsupported canvas size ${manifest.canvasSize}px; expected ${PAINT_RES}px`);
  }
  if (manifest.sliceCount < 1 || manifest.sliceCount > MAX_SLICES) {
    throw new Error(`Unsupported slice count ${manifest.sliceCount}`);
  }
  const decoded = await Promise.all(
    bundle.slices.map((slice) =>
      decodePngBlobToImageData(new Blob([slice.bytes], { type: "image/png" }), PAINT_RES, PAINT_RES),
    ),
  );
  if (decoded.some((imageData) => imageData === null)) {
    throw new Error("Project bundle contains an unreadable PNG slice");
  }
  applyProjectManifestToSlices(manifest, decoded as ImageData[]);
  return manifest;
}

function schedulePersistPaintingSession(): void {
  if (!localProjectStore) return;
  if (localSaveTimer !== null) clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(() => {
    localSaveTimer = null;
    void saveCurrentProjectToIndexedDb({ name: currentProjectName, explicit: false });
  }, 900);
}

async function renderRecentProjects(): Promise<void> {
  if (!projectRecentList) return;
  for (const url of recentThumbnailUrls) URL.revokeObjectURL(url);
  recentThumbnailUrls = [];
  projectRecentList.replaceChildren();
  if (!localProjectStore) {
    projectRecentList.textContent = "IndexedDB storage is unavailable.";
    return;
  }
  const recents = await localProjectStore.listRecentProjects(RECENT_PROJECT_LIMIT);
  if (recents.length === 0) {
    projectRecentList.textContent = "No local projects yet.";
    return;
  }
  for (const project of recents) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hud__recent-project";
    btn.title = `Load ${project.name}`;
    if (project.thumbnailBlob) {
      const img = document.createElement("img");
      const url = URL.createObjectURL(project.thumbnailBlob);
      recentThumbnailUrls.push(url);
      img.src = url;
      img.alt = "";
      btn.appendChild(img);
    }
    const text = document.createElement("span");
    text.className = "hud__recent-project-text";
    const name = document.createElement("strong");
    name.textContent = project.name;
    const date = document.createElement("small");
    date.textContent = new Date(project.updatedAt).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
    text.append(name, date);
    btn.appendChild(text);
    btn.addEventListener("click", () => {
      void loadRecentProject(project.id);
    });
    projectRecentList.appendChild(btn);
  }
}

async function saveCurrentProjectToIndexedDb(options: { name: string; explicit: boolean }): Promise<void> {
  if (!localProjectStore || slices.length === 0) return;
  if (localSaveInProgress) {
    localSaveQueued = true;
    return;
  }

  localSaveInProgress = true;
  projectSaveBtn?.setAttribute("aria-busy", "true");
  if (options.explicit && projectSaveBtn) projectSaveBtn.disabled = true;
  try {
    const now = new Date();
    const { manifest, zipBlob } = await buildCurrentProjectBundle(now);
    const thumbnailBlob = slices[0] ? await imageDataToThumbnailBlob(slices[0].imageData) : undefined;
    const saved = await localProjectStore.saveProject({
      id: currentLocalProjectId,
      name: options.name,
      manifest,
      bundleBlob: zipBlob,
      thumbnailBlob,
      now,
    });
    currentLocalProjectId = saved.id;
    currentProjectName = saved.name;
    lastLocalSaveError = false;
    setProjectStatus(`Saved locally: ${currentProjectName}`);
    await renderRecentProjects();
  } catch (err) {
    console.error(err);
    lastLocalSaveError = true;
    setProjectStatus("Local save failed.");
    if (options.explicit) window.alert("Save failed. IndexedDB may be unavailable or full.");
  } finally {
    localSaveInProgress = false;
    projectSaveBtn?.removeAttribute("aria-busy");
    if (projectSaveBtn) projectSaveBtn.disabled = localProjectStore === null;
  }

  if (localSaveQueued) {
    localSaveQueued = false;
    await saveCurrentProjectToIndexedDb({ name: currentProjectName, explicit: false });
  }
}

async function saveProject(): Promise<void> {
  const requestedName = window.prompt("Project name", currentProjectName);
  if (requestedName === null) return;
  const name = requestedName.trim() || DEFAULT_PROJECT_NAME;
  await saveCurrentProjectToIndexedDb({ name, explicit: true });
}

function basenameProjectName(filename: string): string {
  const trimmed = filename.replace(/\.[^.]+$/, "").trim();
  return trimmed || DEFAULT_PROJECT_NAME;
}

async function loadProjectFile(file: File): Promise<void> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await applyProjectBundleBytes(bytes);
    currentLocalProjectId = undefined;
    currentProjectName = basenameProjectName(file.name);
    setProjectStatus(`Loaded: ${currentProjectName}`);
    await saveCurrentProjectToIndexedDb({ name: currentProjectName, explicit: false });
  } catch (err) {
    console.error(err);
    window.alert("Load failed. Choose a valid 3D Slice Painter project ZIP.");
  }
}

async function loadRecentProject(id: string): Promise<void> {
  if (!localProjectStore) return;
  try {
    const project = await localProjectStore.loadProject(id);
    if (!project) throw new Error("Project not found");
    await applyProjectBundleBytes(new Uint8Array(await project.bundleBlob.arrayBuffer()));
    currentLocalProjectId = project.id;
    currentProjectName = project.name;
    setProjectStatus(`Loaded: ${currentProjectName}`);
  } catch (err) {
    console.error(err);
    window.alert("Load failed. The local project may be corrupt or unavailable.");
  }
}

async function restoreLatestLocalProjectIfPresent(): Promise<void> {
  clearLegacySessionPaintingStorage();
  if (!localProjectStore) {
    setProjectStatus("IndexedDB storage is unavailable.");
    return;
  }
  await renderRecentProjects();
  try {
    const [recent] = await localProjectStore.listRecentProjects(1);
    if (!recent) {
      setProjectStatus("No local project saved yet.");
      return;
    }
    const project = await localProjectStore.loadProject(recent.id);
    if (!project) return;
    await restoreLocalProject(project);
  } catch (err) {
    console.warn("Unable to restore the latest local project", err);
    if (!lastLocalSaveError) setProjectStatus("Could not restore recent project.");
  }
}

async function restoreLocalProject(project: LocalProjectRecord): Promise<void> {
  await applyProjectBundleBytes(new Uint8Array(await project.bundleBlob.arrayBuffer()));
  currentLocalProjectId = project.id;
  currentProjectName = project.name;
  setProjectStatus(`Loaded: ${currentProjectName}`);
}

function newProject(): void {
  if (!confirm("Start a new project? All slices and strokes will be cleared.")) return;

  painting = false;
  lastPaintCanvas = null;
  if (activePaintPointerId !== null) {
    try {
      canvas.releasePointerCapture(activePaintPointerId);
    } catch {
      /* not capturing */
    }
    activePaintPointerId = null;
  }

  if (sliceFrame.parent) sliceFrame.parent.remove(sliceFrame);
  for (const s of slices) disposeSlice(s);
  slices.length = 0;
  slices.push(createSliceState());
  activeSliceIndex = 0;
  sliceSpacingWorld = 0.12;
  if (sliceSpacingInput) sliceSpacingInput.value = "0.12";
  currentLocalProjectId = undefined;
  currentProjectName = DEFAULT_PROJECT_NAME;
  updateSliceTransforms();
  attachFrameToActiveSlice();
  updateSliceHud();
  schedulePersistPaintingSession();
  setProjectStatus("New unsaved project.");
}

let exportInProgress = false;

async function exportProject(): Promise<void> {
  if (exportInProgress || slices.length === 0) return;
  exportInProgress = true;
  projectExportBtn?.setAttribute("aria-busy", "true");
  if (projectExportBtn) projectExportBtn.disabled = true;
  try {
    const { zipBlob } = await buildCurrentProjectBundle();
    const stamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
    downloadBlob(zipBlob, `slice-painter_${stamp}.zip`);
  } catch (err) {
    console.error(err);
    window.alert(
      "Export failed. Your browser may be low on memory, or PNG encoding may be unavailable in this context.",
    );
  } finally {
    exportInProgress = false;
    projectExportBtn?.removeAttribute("aria-busy");
    if (projectExportBtn) projectExportBtn.disabled = false;
  }
}

const grid = new THREE.GridHelper(6, 12, 0x3a4150, 0x2a3038);
grid.position.y = -1.25;
scene.add(grid);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 1.2;
controls.maxDistance = 12;
controls.update();

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

let painting = false;
let activePaintPointerId: number | null = null;

function setInteractionMode(mode: InteractionMode): void {
  interactionMode = mode;

  if (mode === "navigate") {
    lastPaintCanvas = null;
    if (activePaintPointerId !== null) {
      try {
        canvas.releasePointerCapture(activePaintPointerId);
      } catch {
        /* not capturing */
      }
      activePaintPointerId = null;
    }
    painting = false;
    controls.enabled = true;
  } else {
    controls.enabled = false;
  }

  modePaintBtn?.setAttribute("aria-pressed", mode === "paint" ? "true" : "false");
  modeNavigateBtn?.setAttribute("aria-pressed", mode === "navigate" ? "true" : "false");
  modePaintBtn?.classList.toggle("hud__segment--active", mode === "paint");
  modeNavigateBtn?.classList.toggle("hud__segment--active", mode === "navigate");

  const brushDisabled = mode === "navigate";
  for (const el of [
    brushSize,
    brushOpacity,
    brushHardness,
    brushShape,
    brushSlant,
    brushTexture,
    colourNative,
    colourHex,
    slicePrevBtn,
    sliceNextBtn,
    sliceAddBtn,
    sliceSpacingInput,
    sliceOrientSelect,
    sliceOrientViewportBtn,
    sliceNudgeBackBtn,
    sliceNudgeForwardBtn,
    slicePlanePxInput,
    slicePlanePyInput,
    slicePlaneSxInput,
    slicePlaneSyInput,
    colourTransparentBtn,
  ]) {
    if (el) el.disabled = brushDisabled;
  }
  swatchesContainer?.querySelectorAll<HTMLButtonElement>(".hud__swatch").forEach((b) => {
    b.disabled = brushDisabled;
  });
  updateSliceHud();
}

function readBrushParams(): BrushParams {
  return normaliseBrushParams({
    size: brushSize?.value,
    opacityPct: brushOpacity?.value,
    hardnessPct: brushHardness?.value,
    shape: brushShape?.value,
    slantDeg: brushSlant?.value,
    texture: brushTexture?.value,
  });
}

function rayToCanvas(clientX: number, clientY: number): { cx: number; cy: number } | null {
  const active = getActiveSlice();
  if (!active) return null;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(active.mesh, false);
  const hit = hits[0];
  if (!hit?.uv) return null;
  const uv = hit.uv;
  return {
    cx: uv.x * PAINT_RES,
    cy: (1 - uv.y) * PAINT_RES,
  };
}

function dabCanvas(cx: number, cy: number): void {
  const active = getActiveSlice();
  if (!active) return;
  const { radiusPx, opacity, hardness, shape, slantDeg, texture } = readBrushParams();
  const data = active.imageData.data;
  if (brushColour.a === 0) {
    compositeEraseDab(data, PAINT_RES, PAINT_RES, cx, cy, radiusPx, hardness, opacity, {
      shape,
      slantDeg,
      texture,
    });
  } else {
    compositeDab(data, PAINT_RES, PAINT_RES, cx, cy, radiusPx, hardness, opacity, brushColour, {
      shape,
      slantDeg,
      texture,
    });
  }
}

function strokeCanvas(x0: number, y0: number, x1: number, y1: number, skipFirst: boolean): void {
  const active = getActiveSlice();
  if (!active) return;
  const { radiusPx, opacity, hardness, shape, slantDeg, texture } = readBrushParams();
  const step = dabSpacingForRadius(radiusPx);
  const pts = samplesAlongSegment(x0, y0, x1, y1, step);
  const start = skipFirst ? 1 : 0;
  const data = active.imageData.data;
  const erase = brushColour.a === 0;
  for (let i = start; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    if (erase) {
      compositeEraseDab(data, PAINT_RES, PAINT_RES, p.x, p.y, radiusPx, hardness, opacity, {
        shape,
        slantDeg,
        texture,
      });
    } else {
      compositeDab(data, PAINT_RES, PAINT_RES, p.x, p.y, radiusPx, hardness, opacity, brushColour, {
        shape,
        slantDeg,
        texture,
      });
    }
  }
}

function processPaintPointer(e: PointerEvent): void {
  const active = getActiveSlice();
  if (!active) return;
  const coalesced = e.getCoalescedEvents?.();
  const events = coalesced && coalesced.length > 0 ? coalesced : [e];
  let prev = lastPaintCanvas;
  for (const ev of events) {
    const p = rayToCanvas(ev.clientX, ev.clientY);
    if (!p) {
      prev = null;
      continue;
    }
    if (prev) strokeCanvas(prev.cx, prev.cy, p.cx, p.cy, true);
    else dabCanvas(p.cx, p.cy);
    prev = p;
  }
  lastPaintCanvas = prev;
  flushSliceTexture(active);
}

function resize(): void {
  const parent = canvas.parentElement;
  const w = parent?.clientWidth ?? window.innerWidth;
  const h = parent?.clientHeight ?? window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

window.addEventListener("resize", resize);
resize();

sliceSpacingInput?.addEventListener("input", () => {
  refreshSliceSpacingFromInput();
});

sliceSpacingInput?.addEventListener("change", () => {
  refreshSliceSpacingFromInput();
});

slicePrevBtn?.addEventListener("click", () => setActiveSliceIndex(activeSliceIndex - 1));
sliceNextBtn?.addEventListener("click", () => setActiveSliceIndex(activeSliceIndex + 1));
sliceNudgeBackBtn?.addEventListener("click", () => nudgeActiveSliceAlongStack(-1));
sliceNudgeForwardBtn?.addEventListener("click", () => nudgeActiveSliceAlongStack(1));
sliceAddBtn?.addEventListener("click", () => addSlice());

for (const el of [slicePlanePxInput, slicePlanePyInput]) {
  el?.addEventListener("input", () => applyActiveSlicePlaneFromInputs());
  el?.addEventListener("change", () => applyActiveSlicePlaneFromInputs());
}
slicePlaneSxInput?.addEventListener("input", () => applyActiveSlicePlaneFromInputs());
slicePlaneSyInput?.addEventListener("input", () => applyActiveSlicePlaneFromInputs());
slicePlaneSxInput?.addEventListener("change", () => {
  applyActiveSlicePlaneFromInputs();
  commitSliceScaleSlider("x");
});
slicePlaneSyInput?.addEventListener("change", () => {
  applyActiveSlicePlaneFromInputs();
  commitSliceScaleSlider("y");
});

window.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing =
    t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
  if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    undoLastStroke();
    return;
  }
  if (interactionMode !== "paint") return;
  if (typing) return;
  if (e.key === "[") {
    e.preventDefault();
    setActiveSliceIndex(activeSliceIndex - 1);
  } else if (e.key === "]") {
    e.preventDefault();
    setActiveSliceIndex(activeSliceIndex + 1);
  }
});

sliceOrientSelect?.addEventListener("change", () => {
  applySliceOrientationFromSelect();
});

sliceOrientViewportBtn?.addEventListener("click", () => {
  matchSliceOrientationToViewport();
});

projectNewBtn?.addEventListener("click", () => newProject());
projectSaveBtn?.addEventListener("click", () => {
  void saveProject();
});
projectLoadBtn?.addEventListener("click", () => {
  projectLoadInput?.click();
});
projectLoadInput?.addEventListener("change", () => {
  const file = projectLoadInput.files?.[0];
  projectLoadInput.value = "";
  if (file) void loadProjectFile(file);
});
projectExportBtn?.addEventListener("click", () => {
  void exportProject();
});

colourNative?.addEventListener("input", () => {
  if (!colourNative) return;
  const p = parseHexRgba(colourNative.value);
  if (!p) return;
  applyRgb({ r: p.r, g: p.g, b: p.b, a: 255 }, false);
});

colourNative?.addEventListener("change", () => {
  if (!colourNative) return;
  const p = parseHexRgba(colourNative.value);
  if (!p) return;
  applyRgb({ r: p.r, g: p.g, b: p.b, a: 255 }, true);
  recordSwatch(colourNative.value);
  brushColourGroup?.classList.remove("hud-brush__colour--palette-open");
});

colourNative?.closest("label")?.addEventListener("pointerdown", () => {
  brushColourGroup?.classList.add("hud-brush__colour--palette-open");
});

brushColourGroup?.addEventListener("focusin", (ev) => {
  if (!(ev.target instanceof HTMLElement)) return;
  if (ev.target.id === "colour-transparent") return;
  brushColourGroup?.classList.add("hud-brush__colour--palette-open");
});

brushColourGroup?.addEventListener("focusout", (ev) => {
  if (!(ev.currentTarget instanceof HTMLElement)) return;
  const next = ev.relatedTarget;
  if (next instanceof Node && ev.currentTarget.contains(next)) return;
  ev.currentTarget.classList.remove("hud-brush__colour--palette-open");
});

colourTransparentBtn?.addEventListener("click", () => {
  if (interactionMode !== "paint") return;
  applyRgb({ r: 0, g: 0, b: 0, a: 0 }, false);
});

colourHex?.addEventListener("input", () => {
  if (!colourHex) return;
  colourHex.removeAttribute("aria-invalid");
  applyHexString(colourHex.value, false);
});

colourHex?.addEventListener("change", () => {
  if (!colourHex) return;
  if (applyHexString(colourHex.value, true)) {
    recordSwatch(colourHex.value);
    colourHex.removeAttribute("aria-invalid");
  } else {
    colourHex.setAttribute("aria-invalid", "true");
    syncColourInputs();
  }
});

colourHex?.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return;
  colourHex?.dispatchEvent(new Event("change", { bubbles: true }));
});

modePaintBtn?.addEventListener("click", () => setInteractionMode("paint"));
modeNavigateBtn?.addEventListener("click", () => setInteractionMode("navigate"));

paintUndoBtn?.addEventListener("click", () => undoLastStroke());

slices.push(createSliceState());
sliceSpacingWorld = readSliceSpacingFromInput();
updateSliceTransforms();
attachFrameToActiveSlice();
updateSliceHud();

setInteractionMode("paint");
renderSwatches();

canvas.addEventListener("pointerdown", (e) => {
  if (interactionMode !== "paint") return;
  if (e.button !== 0) return;
  const active = getActiveSlice();
  if (!active) return;
  if (!rayToCanvas(e.clientX, e.clientY)) return;
  pushStrokeUndoSnapshot(active);
  syncUndoButton();
  activePaintPointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  painting = true;
  lastPaintCanvas = null;
  processPaintPointer(e);
});

canvas.addEventListener("pointermove", (e) => {
  if (interactionMode !== "paint" || !painting) return;
  processPaintPointer(e);
});

function endPaint(e: PointerEvent): void {
  if (!painting) return;
  painting = false;
  lastPaintCanvas = null;
  activePaintPointerId = null;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* already released */
  }
  schedulePersistPaintingSession();
}

canvas.addEventListener("pointerup", endPaint);
canvas.addEventListener("pointercancel", endPaint);
canvas.addEventListener("lostpointercapture", () => {
  const wasPainting = painting;
  painting = false;
  lastPaintCanvas = null;
  activePaintPointerId = null;
  if (wasPainting) schedulePersistPaintingSession();
});

function tick(): void {
  requestAnimationFrame(tick);
  if (interactionMode === "navigate" && controls.enabled) {
    controls.update();
  }
  renderer.render(scene, camera);
}

void (async () => {
  if (projectSaveBtn) projectSaveBtn.disabled = localProjectStore === null;
  await restoreLatestLocalProjectIfPresent();
  setInteractionMode("paint");
  renderSwatches();
  initHudDocks();
})();

requestAnimationFrame(tick);
