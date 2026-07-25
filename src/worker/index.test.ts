import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, test } from "vite-plus/test";
import {
  createBuildClient,
  geometryTransferables,
  packGeometry,
  serveBuilds,
  unpackGeometry,
  type WorkerLike,
  type WorkerScopeLike,
} from "./index.ts";

// --- geometry packing --------------------------------------------------------

function sampleGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3),
  );
  g.setAttribute("normal", new BufferAttribute(new Float32Array(12).fill(0), 3));
  g.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 2, 1, 3]), 1));
  g.addGroup(0, 3, 0);
  g.addGroup(3, 3, 1);
  return g;
}

describe("packGeometry / unpackGeometry", () => {
  test("round-trips attributes, index and material groups", () => {
    const src = sampleGeometry();
    const out = unpackGeometry(packGeometry(src));
    expect(Array.from(out.getAttribute("position").array)).toEqual(
      Array.from(src.getAttribute("position").array),
    );
    expect(out.getAttribute("normal").itemSize).toBe(3);
    expect(Array.from(out.index?.array ?? [])).toEqual([0, 1, 2, 2, 1, 3]);
    expect(out.groups).toEqual(src.groups);
  });

  test("copies out subarray views so transfer can't corrupt shared buffers", () => {
    const backing = new Float32Array(9);
    backing.set([1, 2, 3], 3);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(backing.subarray(3, 6), 3));
    const packed = packGeometry(g);
    const arr = packed.attributes.position?.array;
    expect(Array.from(arr ?? [])).toEqual([1, 2, 3]);
    expect(arr?.byteOffset).toBe(0);
    expect(arr?.buffer.byteLength).toBe(3 * 4);
  });

  test("geometryTransferables lists each buffer once", () => {
    const packed = packGeometry(sampleGeometry());
    const transfer = geometryTransferables([packed, packed]);
    // position + normal + index buffers, no duplicates from the repeated geometry.
    expect(transfer).toHaveLength(3);
  });
});

// --- client scheduling -------------------------------------------------------

type Sent = { t: string; seq?: number; req?: unknown };

function fakeWorker(): WorkerLike & {
  sent: Sent[];
  emit: (msg: unknown) => void;
  terminated: boolean;
} {
  let listener: ((e: { data: unknown }) => void) | null = null;
  const self = {
    sent: [] as Sent[],
    terminated: false,
    emit: (msg: unknown) => listener?.({ data: msg }),
    postMessage: (m: unknown) => void self.sent.push(m as Sent),
    terminate: () => {
      self.terminated = true;
    },
    addEventListener: (_: "message", cb: (e: { data: unknown }) => void) => {
      listener = cb;
    },
  };
  return self;
}

describe("createBuildClient", () => {
  test("holds requests until the worker is ready, then coalesces to the latest", () => {
    const w = fakeWorker();
    const client = createBuildClient<string, string>(() => w);
    const results: string[] = [];
    client.onResult((r) => results.push(r));

    client.request("a");
    expect(w.sent).toHaveLength(0); // not ready yet
    w.emit({ t: "ready" });
    expect(w.sent).toEqual([{ t: "build", seq: 0, req: "a" }]);

    // Two edits while "a" is building: "b" is dropped, only "c" survives.
    client.request("b");
    client.request("c");
    expect(w.sent).toHaveLength(1);
    w.emit({ t: "done", seq: 0, res: "built:a" });
    expect(results).toEqual(["built:a"]);
    expect(w.sent).toEqual([
      { t: "build", seq: 0, req: "a" },
      { t: "build", seq: 1, req: "c" },
    ]);
    w.emit({ t: "done", seq: 1, res: "built:c" });
    expect(results).toEqual(["built:a", "built:c"]);
    expect(w.sent).toHaveLength(2); // nothing pending, nothing extra sent
  });

  test("keeps serving after a build error and reports it", () => {
    const w = fakeWorker();
    const client = createBuildClient<string, string>(() => w);
    const errors: string[] = [];
    const results: string[] = [];
    client.onError((m) => errors.push(m));
    client.onResult((r) => results.push(r));
    w.emit({ t: "ready" });

    client.request("bad");
    client.request("good");
    w.emit({ t: "error", seq: 0, message: "boom" });
    expect(errors).toEqual(["boom"]);
    w.emit({ t: "done", seq: 1, res: "built:good" });
    expect(results).toEqual(["built:good"]);
  });

  test("unsubscribe stops delivery; dispose terminates the worker", () => {
    const w = fakeWorker();
    const client = createBuildClient<string, string>(() => w);
    const results: string[] = [];
    const off = client.onResult((r) => results.push(r));
    w.emit({ t: "ready" });
    client.request("a");
    off();
    w.emit({ t: "done", seq: 0, res: "built:a" });
    expect(results).toEqual([]);
    client.dispose();
    expect(w.terminated).toBe(true);
  });
});

// --- server --------------------------------------------------------------

function fakeScope(): WorkerScopeLike & {
  sent: { msg: Sent; transfer: Transferable[] }[];
  emit: (msg: unknown) => void;
} {
  let listener: ((e: { data: unknown }) => void) | null = null;
  const self = {
    sent: [] as { msg: Sent; transfer: Transferable[] }[],
    emit: (msg: unknown) => listener?.({ data: msg }),
    postMessage: (msg: unknown, transfer: Transferable[] = []) =>
      void self.sent.push({ msg: msg as Sent, transfer }),
    addEventListener: (_: "message", cb: (e: { data: unknown }) => void) => {
      listener = cb;
    },
  };
  return self;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("serveBuilds", () => {
  test("signals ready after init, builds in order, and passes the transfer list", async () => {
    const scope = fakeScope();
    let initDone = false;
    const buf = new ArrayBuffer(8);
    serveBuilds<string, string>((req) => `built:${req}`, {
      init: async () => {
        await tick();
        initDone = true;
      },
      transfer: () => [buf],
      scope,
    });
    scope.emit({ t: "build", seq: 0, req: "a" }); // arrives before init resolves
    await tick();
    await tick();
    expect(initDone).toBe(true);
    expect(scope.sent.map((s) => s.msg)).toEqual([
      { t: "ready" },
      { t: "done", seq: 0, res: "built:a" },
    ]);
    expect(scope.sent[1]?.transfer).toEqual([buf]);
  });

  test("a throwing handler reports the error and keeps serving", async () => {
    const scope = fakeScope();
    serveBuilds<string, string>(
      (req) => {
        if (req === "bad") throw new Error("degenerate params");
        return `built:${req}`;
      },
      { scope },
    );
    await tick();
    scope.emit({ t: "build", seq: 0, req: "bad" });
    scope.emit({ t: "build", seq: 1, req: "ok" });
    await tick();
    await tick();
    expect(scope.sent.map((s) => s.msg)).toEqual([
      { t: "ready" },
      { t: "error", seq: 0, message: "degenerate params" },
      { t: "done", seq: 1, res: "built:ok" },
    ]);
  });

  test("a failing init is reported instead of hanging silently", async () => {
    const scope = fakeScope();
    serveBuilds<string, string>((req) => `built:${req}`, {
      init: () => Promise.reject(new Error("no wasm")),
      scope,
    });
    await tick();
    expect(scope.sent.map((s) => s.msg)).toEqual([
      { t: "error", seq: -1, message: "init failed: no wasm" },
    ]);
  });
});
