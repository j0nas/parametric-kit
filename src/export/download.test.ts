// @vitest-environment happy-dom
import { BoxGeometry } from "three";
import { afterEach, expect, test } from "vite-plus/test";
import { downloadBlob, downloadText, exportSTL } from "./index.ts";

// Stub the object-URL lifecycle and the anchor click so we can observe what a download wired up,
// without a real navigation. Returns a capture plus a restore() run after each test.
type Capture = { blobs: Blob[]; urls: string[]; revoked: string[]; downloads: string[] };
let restore = (): void => {};

function patch(): Capture {
  const cap: Capture = { blobs: [], urls: [], revoked: [], downloads: [] };
  const realCreateURL = URL.createObjectURL.bind(URL);
  const realRevokeURL = URL.revokeObjectURL.bind(URL);
  const realCreateEl = document.createElement.bind(document);
  URL.createObjectURL = (obj: Blob | MediaSource): string => {
    cap.blobs.push(obj as Blob);
    const u = `blob:mock/${cap.urls.length}`;
    cap.urls.push(u);
    return u;
  };
  URL.revokeObjectURL = (u: string): void => {
    cap.revoked.push(u);
  };
  document.createElement = ((tag: string) => {
    const el = realCreateEl(tag);
    if (tag === "a") {
      (el as HTMLAnchorElement).click = function click(this: HTMLAnchorElement): void {
        cap.downloads.push(this.download);
      };
    }
    return el;
  }) as typeof document.createElement;
  restore = () => {
    URL.createObjectURL = realCreateURL;
    URL.revokeObjectURL = realRevokeURL;
    document.createElement = realCreateEl as typeof document.createElement;
  };
  return cap;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => restore());

test("downloadBlob clicks a download anchor and revokes the object URL afterwards", async () => {
  const cap = patch();
  downloadBlob("model.stl", new Blob([new Uint8Array([1, 2, 3])]));
  expect(cap.urls).toHaveLength(1);
  expect(cap.downloads).toEqual(["model.stl"]);
  expect(cap.revoked).toEqual([]); // revoke is deferred
  await tick();
  expect(cap.revoked).toEqual(cap.urls);
});

test("downloadText builds a UTF-8 text blob with the given mime", async () => {
  const cap = patch();
  downloadText("cut-list.csv", "a,b\n1,2", "text/csv");
  expect(cap.downloads).toEqual(["cut-list.csv"]);
  expect(cap.blobs).toHaveLength(1);
  const blob = cap.blobs[0]!;
  expect(blob.type).toBe("text/csv;charset=utf-8");
  expect(await blob.text()).toBe("a,b\n1,2");
  await tick();
});

test("exportSTL downloads a binary-STL blob under the given filename", async () => {
  const cap = patch();
  exportSTL(new BoxGeometry(1, 1, 1), "cube.stl");
  expect(cap.downloads).toEqual(["cube.stl"]);
  const blob = cap.blobs[0]!;
  expect(blob.type).toBe("application/octet-stream");
  expect(blob.size).toBe(84 + 50 * 12);
  await tick();
});
