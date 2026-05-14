import type { ProjectManifestV1 } from "./exportBundle.js";

export const LOCAL_PROJECT_DB_NAME = "3dsp.localProjects.v1";

const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const RECENT_STORE = "recentProjects";
const DEFAULT_RECENT_LIMIT = 8;

export type LocalProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  manifest: ProjectManifestV1;
  bundleBlob: Blob;
};

export type RecentLocalProject = {
  id: string;
  name: string;
  updatedAt: string;
  thumbnailBlob?: Blob;
};

export type SaveLocalProjectInput = {
  id?: string;
  name: string;
  manifest: ProjectManifestV1;
  bundleBlob: Blob;
  thumbnailBlob?: Blob;
  now?: Date;
};

export type LocalProjectStore = {
  saveProject(input: SaveLocalProjectInput): Promise<LocalProjectRecord>;
  loadProject(id: string): Promise<LocalProjectRecord | null>;
  listRecentProjects(limit?: number): Promise<RecentLocalProject[]>;
};

export type LocalProjectStoreOptions = {
  dbName?: string;
  indexedDB?: IDBFactory;
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function randomProjectId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        const projects = db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        projects.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(RECENT_STORE)) {
        const recents = db.createObjectStore(RECENT_STORE, { keyPath: "id" });
        recents.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
  });
}

function normaliseLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_RECENT_LIMIT;
  if (!Number.isFinite(limit)) return DEFAULT_RECENT_LIMIT;
  return Math.max(0, Math.floor(limit));
}

export function createLocalProjectStore(options: LocalProjectStoreOptions = {}): LocalProjectStore {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error("IndexedDB is not available in this browser");
  const dbName = options.dbName ?? LOCAL_PROJECT_DB_NAME;

  async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openDatabase(factory, dbName);
    try {
      return await fn(db);
    } finally {
      db.close();
    }
  }

  return {
    saveProject(input) {
      return withDb(
        (db) =>
          new Promise<LocalProjectRecord>((resolve, reject) => {
            const id = input.id ?? randomProjectId();
            const updatedAt = (input.now ?? new Date()).toISOString();
            let saved: LocalProjectRecord | null = null;
            const tx = db.transaction([PROJECT_STORE, RECENT_STORE], "readwrite");
            const projects = tx.objectStore(PROJECT_STORE);
            const recents = tx.objectStore(RECENT_STORE);

            tx.oncomplete = () => {
              if (saved) resolve(saved);
              else reject(new Error("Project was not saved"));
            };
            tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
            tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));

            const existingRequest = projects.get(id);
            existingRequest.onsuccess = () => {
              const existing = existingRequest.result as LocalProjectRecord | undefined;
              saved = {
                id,
                name: input.name,
                createdAt: existing?.createdAt ?? updatedAt,
                updatedAt,
                manifest: input.manifest,
                bundleBlob: input.bundleBlob,
              };
              const recent: RecentLocalProject = {
                id,
                name: input.name,
                updatedAt,
                thumbnailBlob: input.thumbnailBlob,
              };
              projects.put(saved);
              recents.put(recent);
            };
            existingRequest.onerror = () => reject(existingRequest.error ?? new Error("Unable to read project"));
          }),
      );
    },

    loadProject(id) {
      return withDb(async (db) => {
        const tx = db.transaction(PROJECT_STORE, "readonly");
        const result = await requestToPromise<LocalProjectRecord | undefined>(tx.objectStore(PROJECT_STORE).get(id));
        await transactionDone(tx);
        return result ?? null;
      });
    },

    listRecentProjects(limit) {
      return withDb(async (db) => {
        const tx = db.transaction(RECENT_STORE, "readonly");
        const results = await requestToPromise<RecentLocalProject[]>(
          tx.objectStore(RECENT_STORE).getAll(),
        );
        await transactionDone(tx);
        return results
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, normaliseLimit(limit));
      });
    },
  };
}
