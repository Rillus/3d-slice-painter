# Product Requirements Document: Web Slice 3D Painter

**Project:** Web Slice 3D Painter (working title)  
**Version:** 0.2  
**Date:** 2026-05-11  
**Author:** Riley  

**Related:** [[3D Scanning SOP - Sofas and Rooms]] (capture pipeline context; this product is separate tooling)

---

## Executive Summary

A **progressive web app** that lets users **paint on planes in 3D space**—by default as a **single stack of parallel slices** (depth built slice by slice), with optional **additional plane groups and standalone sketch planes** inside the same volume so workflows scale from **furniture and props** through **rooms and architectural forms** (e.g. alleyways, façades). Users adjust spacing, orientation per group, and navigate the active paint target. The product avoids full mesh UV texture painting (Substance-class scope) and instead delivers **controllable multi-plane sketching** with export for downstream 3D, compositing, or image pipelines. **Offline-capable** use after first load is a **strong bonus** for on-the-go sketching (including foldables). **3D runtime is Three.js** (locked for v1).

---

## Problem Statement

### Current pain points

1. **No good mobile-native workflow** for “paint on a plane, stack or place more planes in 3D” without desktop DCC tools (Blender, Nomad on device, etc.).
2. **Retail and lifestyle workflows** (e.g. John Lewis product and room visualisation) may need **quick authored depth** or **layered colour passes** that sit between flat design and full sculpting—not served well by either 2D-only tools or heavy desktop-only apps.
3. **Handoff friction:** outputs from phone capture (see scanning SOP) and creative iteration are often split across apps with inconsistent formats.
4. **Single-axis slice stacks alone** are a poor fit for orthogonal structure (walls meeting floors, façades); **multiple orientations or free-placed planes** are needed without jumping to full UV paint.

### Target users

- **Primary:** You (and a small internal or side-project team) prototyping slice- and plane-based 3D sketch on mobile web.
- **Secondary:** Designers/artists who want a lightweight **volume of paintable planes** for concepts, masks, or depth-ish authoring without installing a DCC.
- **Tertiary (later):** Pipeline integration for asset export into web viewers or content tools (out of scope for earliest MVP).

---

## Goals and success metrics

### Primary goals

1. **Paint on the active slice or active sketch plane** in a 3D viewport with touch-friendly orbit/pan/zoom.
2. **Default mode:** one **plane group**—**N parallel slices** (default N = 32, configurable 8–128)—so existing “slice stack” behaviour remains the happy path.
3. **Multi-plane mode:** user can add **further plane groups** (each with its own axis/origin/spacing/count) and/or **standalone sketch planes** (single quad, own buffer) **within the same project volume**, to sketch walls, layers between them, organic stacks (e.g. from the ground), and architectural massing.
4. **Navigation:** clear **active paint target** (which group and which index, or which standalone plane); jump, add/remove slices **within a group**; add/remove groups/planes as product phase allows.
5. **Onion-skin:** faint visibility of **adjacent slices in the same plane group** while painting the active slice (behaviour for standalone planes: optional reference of nearest group slice or off—implementation choice; document in UX).
6. **Export:** **PNG sequence** (per paintable surface) **and** **`.glb`** (all quads + materials/textures)—both first-class outputs; exact packaging (one zip vs multiple) TBD by UX and browser APIs.
7. **PWA / offline:** installable; **core paint session usable offline** after first load is a **targeted bonus** (not a hard gate for first vertical slice, but design for it early—see phases).

### Success metrics (MVP)

| Metric | Target |
| :--- | :--- |
| Time from “open URL” to first brush stroke on phone | < 60 s (excluding auth if any) |
| Smooth orbit + paint on mid-range phone (representative device TBD) | No sustained frame drops below 24 fps during typical brush use |
| Session integrity | Undo/redo reliable for last N operations (N ≥ 20) |
| Export | User can obtain **PNG** and **`.glb`** without desktop-only steps (subject to browser capability fallbacks) |

### Non-goals (explicit)

- Full **UV / PBR texture painting** on arbitrary imported meshes (phase 3+ exploration only).
- **Real-time collaboration** (phase 3+).
- **Photogrammetry / scanning** inside this app (handled elsewhere; optional import of reference mesh later).
- **Boolean CSG / solid modelling** between planes—out of scope; planes are independent paint surfaces unless later tools say otherwise.

---

## User stories

### MVP (Phase 1)

- **US-1:** As a user, I want a new project to start with **one plane group** of **N parallel slices** (default N = 32, configurable 8–128) so the default workflow is “single stack” slice painting.
- **US-2:** As a user, I want to **select the active slice** (slider or prev/next) within the **active plane group** so I always know which layer I am editing.
- **US-3:** As a user, I want **brush** (size, opacity, hardness, colour) and **eraser** on the **active paint target** only (active slice or active standalone plane).
- **US-4:** As a user, I want **onion-skin** for **adjacent slices in the same group** so I can align strokes across depth.
- **US-5:** As a user, I want **undo/redo** for paint operations (per command batches, not per pixel).
- **US-6:** As a user, I want to **adjust slice spacing** (world units) and **plane group transform** (position, rotation of the whole stack) so the slab reads correctly in 3D.
- **US-7:** As a user, I want to **add at least one additional plane group or standalone sketch plane** in the volume (placement/orientation TBD in UX: presets vs gizmo-lite) so I can sketch **orthogonal structure** or **fill space between** stacks.
- **US-8:** As a user, I want to **switch the active paint target** between groups/planes without losing work, with a clear UI list or scene picker.
- **US-9:** As a user, I want to **export PNGs** for all paintable surfaces with **consistent, documented naming** (e.g. per group + slice index).
- **US-10:** As a user, I want to **export a single `.glb`** containing all paintable quads and their albedo maps (or documented fallback) for viewers and DCC handoff.

### Phase 2

- **US-11:** Save/load project (local **IndexedDB** first; optional cloud later).
- **US-12:** Import **reference image** on one slice/plane or as underlay.
- **US-13:** Lock/hide individual slices or whole groups; duplicate slice or group.
- **US-14:** Richer placement UX for new groups/planes (snapping, align to world axes, templates for “room box”).

### Phase 3 (optional)

- **US-15:** Import simple **`.glb`** reference (e.g. scan proxy) and align plane groups to bounding box or key faces.
- **US-16:** Pressure-sensitive stylus where supported.
- **US-17:** Account-based cloud sync and asset library.

---

## Functional requirements

### FR-1 Viewport and navigation

- Render **paintable quads** in **WebGL2** via **Three.js** (locked for v1): one quad per slice in each plane group, plus one quad per standalone sketch plane.
- **Orbit, pan, zoom** via one- and two-finger gestures; prevent browser scroll conflict in paint mode.
- **Snap views** (optional): front / top / side of **selection** or **world** for faster alignment.
- **Hit testing:** when the user paints, resolve **one** active paint surface from ray intersection (active target wins if under cursor; otherwise **closest hit** along the camera ray, with tie-break documented). Overlapping planes are expected; ambiguity is reduced by explicit “active target” selection.

### FR-2 Painting model

- Each **slice** (within a group) and each **standalone plane** owns a **2D raster** (RGBA, resolution configurable; default 512×512 or 1024×1024), in **texture space** of that quad.
- Brush applies **stamp-based** dab accumulation with opacity and hardness.
- **Only the active paint target** receives input unless a future projection brush is specified.

### FR-3 Plane groups and multi-plane volume

- **Plane group:** ordered list of **N** parallel quads, shared **stack axis** (normal), **spacing** Δ between consecutive slices along that axis, **group transform** (position + rotation in world space). Default project contains **exactly one** plane group.
- **Additional plane groups:** same structure; user-configurable N (within global guardrails), spacing, and transform **independent** of the first group.
- **Standalone sketch plane:** single quad + single raster; position and orientation in world space; no automatic “adjacent slice” for onion-skin unless UX attaches it to a nearby group (optional, later).
- **Global limits:** total slice count, total standalone planes, and texture resolution are bounded by **performance guardrails** (see NFR-1); **numeric caps start conservative** and are revised after profiling on reference devices (including foldables where applicable).

### FR-4 Export

- **PNG:** one file per paintable raster, naming convention **documented and stable**, e.g. `group_{groupIndex:02d}_slice_{sliceIndex:04d}.png` for grouped slices and `plane_{planeId}.png` (or sequential index) for standalone planes—exact scheme in implementation spec / README.
- **`.glb`:** single glTF binary export containing **all** paintable meshes with materials referencing exported textures (or vertex-colour fallback only if explicitly chosen and documented).
- **Delivery:** zip when browser supports **File System Access** or equivalent; otherwise documented fallbacks (multi-download, single archive via JS zip library).

### FR-5 Settings

- Canvas size preset list; **warn** on large sizes and high **total** texture memory (groups × slices × resolution).

---

## Non-functional requirements

### NFR-1 Performance and guardrails

- Target **interactive** viewport on **iOS Safari** and **Chrome Android** for agreed reference devices.
- **Guardrail policy (values TBD):** enforce **configurable caps** on (a) slices per group, (b) number of groups, (c) standalone planes, (d) texture resolution; **adaptive degradation** under load (e.g. reduce onion-skin layers, lower live preview resolution, lazy GPU upload for distant slices/planes); **surface in UI** when the user approaches limits.
- Until a device matrix exists, ship **conservative defaults** and **instrument** frame time / memory where feasible to inform later tuning.

### NFR-2 Compatibility

- **WebGL2** baseline; document unsupported browsers with clear message.
- Touch-first UI; keyboard shortcuts on desktop optional. **Foldable / large phone** layouts should remain usable without requiring desktop.

### NFR-3 Accessibility

- Sufficient contrast for UI chrome; slider and buttons usable with **large touch targets** (min ~44×44 pt equivalent).
- Do not rely on colour alone for tool state (icons/labels).

### NFR-4 Privacy and data

- MVP **local-only** storage preferred; no PII required to use the app.
- If cloud is added later: explicit consent, retention policy, and JLP/Ticketlab governance as applicable.

### NFR-5 Engineering quality (TDD)

- **Unit tests** for brush maths (dab alpha, hardness falloff, compositing onto slice buffer).
- **Integration tests** for undo stack, export naming, and multi-group project serialisation (when save/load exists).
- Visual regression optional (screenshot tests) once renderer stabilises.

---

## Technical approach (locked defaults)

| Layer | Choice | Notes |
| :--- | :--- | :--- |
| Runtime | **TypeScript** | Shared types for project model and export |
| 3D | **Three.js** (r15x+) | **Locked for v1**; WebGL2, ecosystem, `GLTFExporter` |
| Build | **Vite** | Fast dev on mobile via LAN |
| PWA / offline | **vite-plugin-pwa** (or equivalent) | Cache shell + static assets; session data local; align with offline bonus goal |
| Brush | **Offscreen 2D canvas** or **render-to-texture** per paintable surface | Perf-test both; start with **2D canvas per raster** for simplicity |

### Data model (conceptual)

- `Project`: id, createdAt, canvasSize (default for new surfaces), `planeGroups[]`, `standalonePlanes[]`, global settings / guardrail overrides  
- `PlaneGroup`: id, sliceCount, spacing, transform (position, rotation), axis/normal, `slices[]`  
- `Slice`: index within group, texture ref (blob / ImageData / handle), locked, visible  
- `StandalonePlane`: id, transform, texture ref, locked, visible  
- `History`: command stack for undo/redo (paint batches scoped to target id, not per pixel)

---

## Phases and milestones

| Phase | Scope | Rough duration (1 FE, part-time) |
| :--- | :--- | :--- |
| **P0 Spike** | Single plane (or single-group single slice), one-finger paint, orbit camera on phone, Three.js | 3–5 days |
| **P1 MVP** | Full **default** stack, slice UI, onion-skin, undo/redo, **second group or one standalone plane**, active-target switching, **PNG + `.glb` export** | 3–5 weeks |
| **P2** | Save/load (IndexedDB), reference underlay, PWA/offline hardening, richer placement, perf tuning vs device matrix | 3–5 weeks |
| **P3** | Reference mesh import, polish, advanced guardrails and caps by device tier | 6+ weeks |

*(Durations are indicative; adjust for allocation and scope creep.)*

---

## Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Mobile GPU memory with many high-res textures across groups | Global caps; lazy GPU upload; warn in settings; reduce default N on mobile |
| iOS Safari WebGL quirks | Early device matrix; feature-detect and document |
| Undo memory growth | Command-based history; cap length with warning; scope undo to target where helpful |
| Ray hit ambiguity between overlapping planes | Active-target priority + closest-hit rule + clear UI for current target |
| “Just add Substance features” scope creep | Keep PRD non-goals visible in sprint reviews |

---

## Open questions

1. **Primary sponsor:** Ticketlab side project vs John Lewis internal prototype—governs hosting, branding, and compliance.
2. **Auth:** Anonymous-only vs sign-in for any cloud phase.
3. **Reference devices:** Which phones, tablets, and **foldables** must pass the performance bar?
4. **Commercial fonts/assets:** Any third-party brush stamps or stock integration?
5. **Placement UX for new groups/planes:** Minimal (numeric + presets) vs in-viewport manipulators for v1?

---

## Appendix: competitive reference (non-exhaustive)

- **Nomad Sculpt / Forger** — native mobile sculpt + paint; informs UX expectations, not web stack.
- **Blender** — reference workflow for stacked and placed planes; this product is a narrow, web-mobile subset.

---

## Document history

| Version | Date | Changes |
| :--- | :--- | :--- |
| 0.1 | 2026-05-11 | Initial PRD |
| 0.2 | 2026-05-11 | Multi-plane volume (single stack default); Three.js locked; PNG + `.glb` exports; offline/PWA as strong bonus; performance guardrail policy; use cases through architecture; data model and phases updated |
