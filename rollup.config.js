import alias from "@rollup/plugin-alias";
import { babel } from "@rollup/plugin-babel";

export default [
  {
    input: "src/core/index.js",
    output: { file: "dist/core.js", format: "es" },
    external: ["flatqueue"],
    plugins: [babel({ babelHelpers: "runtime" })],
  },
  {
    input: "src/opaque-value/index.js",
    output: { file: "dist/opaque-value.js", format: "es" },
    external: ["./core"],
    plugins: [
      alias({ entries: { "../core": "./core" } }),
      babel({ babelHelpers: "runtime" }),
    ],
  },
];
