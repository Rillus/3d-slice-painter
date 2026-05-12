import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { compositeDab, compositeEraseDab, type RgbaByte } from "./brush/stamp.js";
import { dabSpacingForRadius, samplesAlongSegment } from "./brush/strokePath.js";
import { formatHexRgb, parseHexRgba, swatchKeyFromRgba } from "./colour/hex.js";
import { createRectOutlineLoop } from "./slices/outlineGeometry.js";
import {
  isCardinalPreset,
  quaternionFaceReferenceTowardViewer,
  quaternionForCardinalPreset,
} from "./slices/orientation.js";
import { stackNudgeStepWorld, stackPositionScalar } from "./slices/stackPosition.js";
import { zipSync } from "fflate";
import {
  buildProjectManifest,
  serialiseManifest,
  slicePngFilename,
} from "./project/exportBundle.js";
import { loadHudDockExpanded, saveHudDockExpanded, type HudDockId } from "./ui/hudDockPrefs.js";
import { pushPreStrokeSnapshot } from "./paint/undoStack.js";
import {
  parseSessionPaintingJson,
  serialiseSessionPainting,
  SESSION_PAINTING_KEY,
  type SessionSliceMetaV1,
} from "./paint/sessionPainting.js";

const PAINT_RES = 512;
const PLANE_W = 2.4;
const PLANE_H = 2.4;
const MAX_SLICES = 128;
const MAX_UNDO_STROKES = 24;
const LS_COLOUR = "3dsp.brushColour";
const LS_SWATCHES = "3dsp.swatches";
const MAX_SWATCHES = 12;

const SLICE_PLANE_POS_MIN = -3;
const SLICE_PLANE_POS_MAX = 3;
const SLICE_PLANE_SCALE_MIN = 0.05;
const SLICE_PLANE_SCALE_SLIDER_MAX = 50;

function getViewportCanvas(): HTMLCanvasElement {
  const el = document.querySelector("#c");
  if (!(el instanceof HTMLCanvasElement)) throw new Error("Missing #c canvas");
  return el;
}

const canvas = getViewportCanvas();

const brushSize = document.querySelector<HTMLInputElement>("#brush-size");
const brushOpacity = document.querySelector<HTMLInputElement>("#brush-opacity");
const brushHardness = document.querySelector<HTMLInputElement>("#brush-hardness");
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
const projectExportBtn = document.querySelector<HTMLButtonElement>("#project-export");

type InteractionMode = "paint" | "navigate";
let interactionMode: InteractionMode = "paint";

let brushColour: RgbaByte = { r: 200, g: 55, b: 48, a: 255 };
let swatches: string[] = [];
let lastPaintCanvas: { cx: number; cy: number } | null = null;

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
    const sx = Math.min(50, Math.max(0.05, s.planeScaleX));
    const sy = Math.min(50, Math.max(0.05, s.planeScaleY));
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

function clampSlicePlaneScale(n: number): number {
  return Math.min(SLICE_PLANE_SCALE_SLIDER_MAX, Math.max(SLICE_PLANE_SCALE_MIN, n));
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
  const sx = clampSlicePlaneScale(s.planeScaleX);
  const sy = clampSlicePlaneScale(s.planeScaleY);
  if (slicePlanePxInput) slicePlanePxInput.value = String(px);
  if (slicePlanePyInput) slicePlanePyInput.value = String(py);
  if (slicePlaneSxInput) slicePlaneSxInput.value = String(sx);
  if (slicePlaneSyInput) slicePlaneSyInput.value = String(sy);
  formatPlaneReadout(slicePlanePxOut, px);
  formatPlaneReadout(slicePlanePyOut, py);
  formatPlaneReadout(slicePlaneSxOut, sx);
  formatPlaneReadout(slicePlaneSyOut, sy);
}

function applyActiveSlicePlaneFromInputs(): void {
  const s = getActiveSlice();
  if (!s) return;
  const px = Number(slicePlanePxInput?.value ?? 0);
  const py = Number(slicePlanePyInput?.value ?? 0);
  const sx = Number(slicePlaneSxInput?.value ?? 1);
  const sy = Number(slicePlaneSyInput?.value ?? 1);
  s.planeOffsetX = Number.isFinite(px) ? clampSlicePlanePos(px) : 0;
  s.planeOffsetY = Number.isFinite(py) ? clampSlicePlanePos(py) : 0;
  s.planeScaleX = Number.isFinite(sx) ? clampSlicePlaneScale(sx) : 1;
  s.planeScaleY = Number.isFinite(sy) ? clampSlicePlaneScale(sy) : 1;
  syncSlicePlaneInputsFromActive();
  updateSliceTransforms();
  schedulePersistPaintingSession();
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

function imageDataToPngDataUrlSync(data: ImageData): string {
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(data, 0, 0);
  return c.toDataURL("image/png");
}

function decodePngDataUrlToImageData(dataUrl: string, w: number, h: number): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== w || img.naturalHeight !== h) {
        resolve(null);
        return;
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function clearSessionPaintingStorage(): void {
  try {
    localStorage.removeItem(SESSION_PAINTING_KEY);
  } catch {
    /* ignore */
  }
}

let sessionPaintSaveTimer: ReturnType<typeof setTimeout> | null = null;

function persistPaintingSessionSync(): void {
  if (slices.length === 0) return;
  const layers: string[] = [];
  for (const s of slices) {
    const url = imageDataToPngDataUrlSync(s.imageData);
    if (!url) return;
    layers.push(url);
  }
  const sliceMeta: SessionSliceMetaV1[] = slices.map((s) => ({
    along: s.alongStackOffset,
    px: s.planeOffsetX,
    py: s.planeOffsetY,
    sx: s.planeScaleX,
    sy: s.planeScaleY,
    qx: s.stackQuaternion.x,
    qy: s.stackQuaternion.y,
    qz: s.stackQuaternion.z,
    qw: s.stackQuaternion.w,
    facing: s.sliceFacingSelectValue,
  }));
  try {
    localStorage.setItem(
      SESSION_PAINTING_KEY,
      serialiseSessionPainting({
        v: 1,
        w: PAINT_RES,
        h: PAINT_RES,
        layers,
        spacingWorld: sliceSpacingWorld,
        activeSliceIndex,
        sliceMeta,
      }),
    );
  } catch {
    /* quota exceeded or storage disabled */
  }
}

function schedulePersistPaintingSession(): void {
  if (sessionPaintSaveTimer !== null) clearTimeout(sessionPaintSaveTimer);
  sessionPaintSaveTimer = setTimeout(() => {
    sessionPaintSaveTimer = null;
    persistPaintingSessionSync();
  }, 400);
}

async function restorePaintingFromStorageIfPresent(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SESSION_PAINTING_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  const parsed = parseSessionPaintingJson(raw);
  if (!parsed || parsed.w !== PAINT_RES || parsed.h !== PAINT_RES) return;
  const L = parsed.layers.length;
  if (L < 1 || L > MAX_SLICES) return;

  const decoded = await Promise.all(
    parsed.layers.map((url) => decodePngDataUrlToImageData(url, PAINT_RES, PAINT_RES)),
  );
  if (decoded.some((d) => !d)) return;

  if (sliceFrame.parent) sliceFrame.parent.remove(sliceFrame);
  for (const s of slices) disposeSlice(s);
  slices.length = 0;
  for (let i = 0; i < L; i++) slices.push(createSliceState());
  for (let i = 0; i < L; i++) {
    const s = slices[i]!;
    const id = decoded[i]!;
    if (!id) continue;
    s.imageData.data.set(id.data);
    s.undoStack.length = 0;
    flushSliceTexture(s);
  }

  if (parsed.sliceMeta && parsed.sliceMeta.length === L) {
    for (let i = 0; i < L; i++) {
      const s = slices[i]!;
      const m = parsed.sliceMeta[i]!;
      s.alongStackOffset = m.along;
      s.planeOffsetX = m.px;
      s.planeOffsetY = m.py;
      s.planeScaleX = m.sx;
      s.planeScaleY = m.sy;
      s.stackQuaternion.set(m.qx, m.qy, m.qz, m.qw);
      s.stackQuaternion.normalize();
      s.sliceFacingSelectValue = m.facing;
    }
  }
  if (parsed.spacingWorld !== undefined && Number.isFinite(parsed.spacingWorld)) {
    sliceSpacingWorld = Math.max(0.001, parsed.spacingWorld);
    if (sliceSpacingInput) sliceSpacingInput.value = String(sliceSpacingWorld);
  }
  if (parsed.activeSliceIndex !== undefined && Number.isFinite(parsed.activeSliceIndex)) {
    const ai = Math.floor(parsed.activeSliceIndex);
    activeSliceIndex = Math.max(0, Math.min(L - 1, ai));
  } else {
    activeSliceIndex = Math.max(0, Math.min(L - 1, activeSliceIndex));
  }
  attachFrameToActiveSlice();
  updateSliceTransforms();
  updateSliceHud();
  syncUndoButton();
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
  updateSliceTransforms();
  attachFrameToActiveSlice();
  updateSliceHud();
  clearSessionPaintingStorage();
}

let exportInProgress = false;

async function exportProject(): Promise<void> {
  if (exportInProgress || slices.length === 0) return;
  exportInProgress = true;
  projectExportBtn?.setAttribute("aria-busy", "true");
  if (projectExportBtn) projectExportBtn.disabled = true;
  try {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      if (!s) continue;
      const blob = await imageDataToPngBlob(s.imageData);
      const buf = new Uint8Array(await blob.arrayBuffer());
      entries[slicePngFilename(i)] = buf;
    }
    const s0 = slices[0];
    const orientationCardinal =
      s0 && isCardinalPreset(s0.sliceFacingSelectValue) ? s0.sliceFacingSelectValue : null;
    const manifest = buildProjectManifest(
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
      new Date().toISOString(),
    );
    entries["project.json"] = new TextEncoder().encode(serialiseManifest(manifest));
    const zipped = zipSync(entries, { level: 6 });
    const zipBlob = new Blob([zipped], { type: "application/zip" });
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

function readBrushParams(): { radiusPx: number; opacity: number; hardness: number } {
  const size = Number(brushSize?.value ?? 32);
  const opacityPct = Number(brushOpacity?.value ?? 85);
  const hardnessPct = Number(brushHardness?.value ?? 65);
  return {
    radiusPx: Math.max(2, size),
    opacity: Math.max(0, Math.min(1, opacityPct / 100)),
    hardness: Math.max(0, Math.min(1, hardnessPct / 100)),
  };
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
  const { radiusPx, opacity, hardness } = readBrushParams();
  const data = active.imageData.data;
  if (brushColour.a === 0) {
    compositeEraseDab(data, PAINT_RES, PAINT_RES, cx, cy, radiusPx, hardness, opacity);
  } else {
    compositeDab(data, PAINT_RES, PAINT_RES, cx, cy, radiusPx, hardness, opacity, brushColour);
  }
}

function strokeCanvas(x0: number, y0: number, x1: number, y1: number, skipFirst: boolean): void {
  const active = getActiveSlice();
  if (!active) return;
  const { radiusPx, opacity, hardness } = readBrushParams();
  const step = dabSpacingForRadius(radiusPx);
  const pts = samplesAlongSegment(x0, y0, x1, y1, step);
  const start = skipFirst ? 1 : 0;
  const data = active.imageData.data;
  const erase = brushColour.a === 0;
  for (let i = start; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    if (erase) {
      compositeEraseDab(data, PAINT_RES, PAINT_RES, p.x, p.y, radiusPx, hardness, opacity);
    } else {
      compositeDab(data, PAINT_RES, PAINT_RES, p.x, p.y, radiusPx, hardness, opacity, brushColour);
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

for (const el of [slicePlanePxInput, slicePlanePyInput, slicePlaneSxInput, slicePlaneSyInput]) {
  el?.addEventListener("input", () => applyActiveSlicePlaneFromInputs());
  el?.addEventListener("change", () => applyActiveSlicePlaneFromInputs());
}

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

window.addEventListener("beforeunload", () => {
  persistPaintingSessionSync();
});

void (async () => {
  await restorePaintingFromStorageIfPresent();
  setInteractionMode("paint");
  renderSwatches();
  initHudDocks();
})();

requestAnimationFrame(tick);
