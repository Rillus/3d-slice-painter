import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { compositeDab, type RgbaByte } from "./brush/stamp.js";
import { dabSpacingForRadius, samplesAlongSegment } from "./brush/strokePath.js";
import { formatHexRgb, parseHexRgb } from "./colour/hex.js";

const PAINT_RES = 512;
const LS_COLOUR = "3dsp.brushColour";
const LS_SWATCHES = "3dsp.swatches";
const MAX_SWATCHES = 12;

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
const swatchesContainer = document.querySelector<HTMLDivElement>("#colour-swatches");

type InteractionMode = "paint" | "navigate";
let interactionMode: InteractionMode = "paint";

let brushColour: RgbaByte = { r: 200, g: 55, b: 48, a: 255 };
let swatches: string[] = [];
let lastPaintCanvas: { cx: number; cy: number } | null = null;

function loadStoredColour(): void {
  try {
    const h = localStorage.getItem(LS_COLOUR);
    if (!h) return;
    const p = parseHexRgb(h);
    if (p) brushColour = { ...p, a: 255 };
  } catch {
    /* storage unavailable */
  }
}

function saveColour(): void {
  try {
    localStorage.setItem(LS_COLOUR, formatHexRgb(brushColour.r, brushColour.g, brushColour.b).toLowerCase());
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
      .filter((h) => parseHexRgb(h) !== null)
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
  const p = parseHexRgb(hex);
  if (!p) return;
  const key = formatHexRgb(p.r, p.g, p.b).toLowerCase();
  swatches = [key, ...swatches.filter((h) => h.toLowerCase() !== key)].slice(0, MAX_SWATCHES);
  saveSwatches();
  renderSwatches();
}

function syncColourInputs(): void {
  const hex = formatHexRgb(brushColour.r, brushColour.g, brushColour.b).toLowerCase();
  if (colourNative) colourNative.value = hex;
  if (colourHex) colourHex.value = hex;
}

function applyRgb(rgb: { r: number; g: number; b: number }, persistColour: boolean): void {
  brushColour = { r: rgb.r, g: rgb.g, b: rgb.b, a: 255 };
  syncColourInputs();
  if (persistColour) saveColour();
}

function applyHexString(raw: string, persistColour: boolean): boolean {
  const parsed = parseHexRgb(raw);
  if (!parsed) return false;
  applyRgb(parsed, persistColour);
  return true;
}

function renderSwatches(): void {
  if (!swatchesContainer) return;
  swatchesContainer.replaceChildren();
  const disabled = interactionMode === "navigate";
  for (const hex of swatches) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hud__swatch";
    btn.disabled = disabled;
    btn.style.backgroundColor = hex;
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

const paintCanvas = document.createElement("canvas");
paintCanvas.width = PAINT_RES;
paintCanvas.height = PAINT_RES;

function getPaint2d(canvasEl: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context not available");
  return ctx;
}

const paint2d = getPaint2d(paintCanvas);

const paintBuffer = paint2d.createImageData(PAINT_RES, PAINT_RES);
paintBuffer.data.fill(0);
paint2d.putImageData(paintBuffer, 0, 0);

function flushPaintTexture(): void {
  paint2d.putImageData(paintBuffer, 0, 0);
  texture.needsUpdate = true;
}

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

const texture = new THREE.CanvasTexture(paintCanvas);
texture.colorSpace = THREE.SRGBColorSpace;
texture.wrapS = THREE.ClampToEdgeWrapping;
texture.wrapT = THREE.ClampToEdgeWrapping;
texture.minFilter = THREE.LinearMipmapLinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.generateMipmaps = true;

const planeGeo = new THREE.PlaneGeometry(2.4, 2.4);
const planeMat = new THREE.MeshBasicMaterial({
  map: texture,
  transparent: true,
  depthWrite: true,
  side: THREE.DoubleSide,
});
const planeMesh = new THREE.Mesh(planeGeo, planeMat);
scene.add(planeMesh);

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
  for (const el of [brushSize, brushOpacity, brushHardness, colourNative, colourHex]) {
    if (el) el.disabled = brushDisabled;
  }
  swatchesContainer?.querySelectorAll<HTMLButtonElement>(".hud__swatch").forEach((b) => {
    b.disabled = brushDisabled;
  });
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
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(planeMesh, false);
  const hit = hits[0];
  if (!hit?.uv) return null;
  const uv = hit.uv;
  return {
    cx: uv.x * PAINT_RES,
    cy: (1 - uv.y) * PAINT_RES,
  };
}

function dabCanvas(cx: number, cy: number): void {
  const { radiusPx, opacity, hardness } = readBrushParams();
  compositeDab(paintBuffer.data, PAINT_RES, PAINT_RES, cx, cy, radiusPx, hardness, opacity, brushColour);
}

function strokeCanvas(x0: number, y0: number, x1: number, y1: number, skipFirst: boolean): void {
  const { radiusPx, opacity, hardness } = readBrushParams();
  const step = dabSpacingForRadius(radiusPx);
  const pts = samplesAlongSegment(x0, y0, x1, y1, step);
  const start = skipFirst ? 1 : 0;
  for (let i = start; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    compositeDab(paintBuffer.data, PAINT_RES, PAINT_RES, p.x, p.y, radiusPx, hardness, opacity, brushColour);
  }
}

function processPaintPointer(e: PointerEvent): void {
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
  flushPaintTexture();
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

colourNative?.addEventListener("input", () => {
  if (!colourNative) return;
  applyHexString(colourNative.value, false);
});

colourNative?.addEventListener("change", () => {
  if (!colourNative) return;
  if (applyHexString(colourNative.value, true)) recordSwatch(colourNative.value);
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

setInteractionMode("paint");
renderSwatches();

canvas.addEventListener("pointerdown", (e) => {
  if (interactionMode !== "paint") return;
  if (e.button !== 0) return;
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
}

canvas.addEventListener("pointerup", endPaint);
canvas.addEventListener("pointercancel", endPaint);
canvas.addEventListener("lostpointercapture", () => {
  painting = false;
  lastPaintCanvas = null;
  activePaintPointerId = null;
});

function tick(): void {
  requestAnimationFrame(tick);
  if (interactionMode === "navigate" && controls.enabled) {
    controls.update();
  }
  renderer.render(scene, camera);
}

requestAnimationFrame(tick);
