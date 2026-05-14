import { describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { createProjectBundleZip } from "./projectBundle.js";
import { buildProjectManifest } from "./exportBundle.js";
import { createLocalProjectStore } from "./localProjects.js";

function bytes(blob: Blob): Promise<number[]> {
  return blob.arrayBuffer().then((buf) => Array.from(new Uint8Array(buf)));
}

function testStore() {
  return createLocalProjectStore({
    dbName: `3dsp-test-${crypto.randomUUID()}`,
    indexedDB: fakeIndexedDB,
  });
}

const manifest = buildProjectManifest(
  {
    sliceCount: 1,
    spacingWorld: 0.12,
    canvasSize: 512,
    planeWidthWorld: 2.4,
    planeHeightWorld: 2.4,
  },
  "2026-05-14T15:54:00.000Z",
);

describe("local project IndexedDB store", () => {
  it("persists project ZIP blobs and recent metadata", async () => {
    const store = testStore();
    const bundle = new Blob(
      [createProjectBundleZip({ manifest, pngSlices: [new Uint8Array([137, 80, 78, 71])] })],
      { type: "application/zip" },
    );
    const thumbnail = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

    const saved = await store.saveProject({
      name: "Offline castle",
      manifest,
      bundleBlob: bundle,
      thumbnailBlob: thumbnail,
      now: new Date("2026-05-14T16:00:00.000Z"),
    });

    const loaded = await store.loadProject(saved.id);
    const recents = await store.listRecentProjects();

    expect(loaded?.id).toBe(saved.id);
    expect(loaded?.name).toBe("Offline castle");
    expect(loaded?.manifest).toEqual(manifest);
    expect(await bytes(loaded!.bundleBlob)).toEqual(await bytes(bundle));
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({
      id: saved.id,
      name: "Offline castle",
      updatedAt: "2026-05-14T16:00:00.000Z",
    });
    expect(await bytes(recents[0]!.thumbnailBlob!)).toEqual([1, 2, 3]);
  });

  it("keeps recents sorted by most recently updated and honours limits", async () => {
    const store = testStore();
    const bundle = new Blob(
      [createProjectBundleZip({ manifest, pngSlices: [new Uint8Array([137, 80, 78, 71])] })],
      { type: "application/zip" },
    );

    const first = await store.saveProject({
      name: "First",
      manifest,
      bundleBlob: bundle,
      now: new Date("2026-05-14T16:00:00.000Z"),
    });
    const second = await store.saveProject({
      name: "Second",
      manifest,
      bundleBlob: bundle,
      now: new Date("2026-05-14T16:01:00.000Z"),
    });
    await store.saveProject({
      id: first.id,
      name: "First renamed",
      manifest,
      bundleBlob: bundle,
      now: new Date("2026-05-14T16:02:00.000Z"),
    });

    const recents = await store.listRecentProjects(1);

    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ id: first.id, name: "First renamed" });
    expect(recents[0]?.id).not.toBe(second.id);
  });
});
