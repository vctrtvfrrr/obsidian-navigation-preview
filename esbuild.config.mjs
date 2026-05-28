import esbuild from "esbuild";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  platform: "node",
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "ES2018",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  logLevel: "info",
  treeShaking: true,
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}