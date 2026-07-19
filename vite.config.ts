import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: [
      "src/index.ts",
      "src/csg/index.ts",
      "src/params/index.ts",
      "src/viewer/index.ts",
      "src/readout/index.ts",
      "src/export/index.ts",
      "src/laser/index.ts",
      "src/laser/preview.ts",
      "src/testkit/index.ts",
    ],
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
