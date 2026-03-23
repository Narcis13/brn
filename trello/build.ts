const result = await Bun.build({
  entrypoints: ["./src/ui/index.tsx"],
  outdir: "./public/dist",
  target: "browser",
  format: "esm",
  minify: process.argv.includes("--minify"),
  sourcemap: "external",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Built ${result.outputs.length} file(s) to trello/public/dist/`);
