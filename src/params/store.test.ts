import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createStore, defineParams, num, pick, type StorageLike } from "./index.ts";

const schema = defineParams({
  cardCount: num({ def: 100, min: 10, max: 250, step: 1, group: "cards" }),
  wall: num({ def: 3, min: 2, max: 4.4, step: 0.2, group: "shell" }),
  lidStyle: pick(["friction", "snap", "magnet"] as const, { def: "friction", group: "lid" }),
});

// An in-memory Storage so the round-trip is exercised without a browser (happy-dom does not expose
// localStorage in this runner). Browser usage omits `storage` and gets the global localStorage.
function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("createStore", () => {
  let storage: ReturnType<typeof memStorage>;
  beforeEach(() => {
    storage = memStorage();
  });

  test("composes the key from base + version", () => {
    expect(createStore(schema, { key: "deck:params", version: 1, storage }).key).toBe(
      "deck:params:v1",
    );
    expect(createStore(schema, { key: "deck:params", storage }).key).toBe("deck:params");
  });

  test("load returns defaults when nothing is stored", () => {
    const store = createStore(schema, { key: "deck:params", version: 1, storage });
    expect(store.load()).toEqual(store.defaults);
  });

  test("save/load round-trips a valid config", () => {
    const store = createStore(schema, { key: "deck:params", version: 1, storage });
    store.save({ cardCount: 60, wall: 2.4, lidStyle: "snap" });
    expect(store.load()).toEqual({ cardCount: 60, wall: 2.4, lidStyle: "snap" });
  });

  test("clear forgets the persisted blob so load falls back to defaults", () => {
    const store = createStore(schema, { key: "deck:params", version: 1, storage });
    store.save({ cardCount: 60, wall: 2.4, lidStyle: "snap" });
    store.clear();
    expect(store.load()).toEqual(store.defaults);
  });

  test("load sanitizes a stored blob (bad JSON'd values / junk keys / bad pick)", () => {
    const store = createStore(schema, { key: "deck:params", version: 1, storage });
    storage.setItem(
      store.key,
      JSON.stringify({ cardCount: null, wall: 2.4, lidStyle: "banana", junk: 1 }),
    );
    const out = store.load();
    expect(out.cardCount).toBe(100); // null -> default
    expect(out.wall).toBe(2.4);
    expect(out.lidStyle).toBe("friction"); // unknown option -> default
    expect("junk" in out).toBe(false);
  });

  test("load survives malformed JSON in storage", () => {
    const store = createStore(schema, { key: "deck:params", version: 1, storage });
    storage.setItem(store.key, "{not json");
    expect(store.load()).toEqual(store.defaults);
  });

  test("degrades to defaults when no storage is available at all", () => {
    const store = createStore(schema, { key: "deck:params", version: 1, storage: undefined });
    // No global localStorage in this runner -> load/save/clear are safe no-ops.
    expect(() => store.save({ cardCount: 60, wall: 2.4, lidStyle: "snap" })).not.toThrow();
    expect(store.load()).toEqual(store.defaults);
  });

  test("a version bump isolates the old blob", () => {
    const v1 = createStore(schema, { key: "deck:params", version: 1, storage });
    v1.save({ cardCount: 60, wall: 2.4, lidStyle: "snap" });
    const v2 = createStore(schema, { key: "deck:params", version: 2, storage });
    expect(v2.load()).toEqual(v2.defaults); // different key -> no stale read
  });
});
