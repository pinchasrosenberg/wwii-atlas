// Static build for GitHub Pages: copies the client into dist/. The WWII content is not bundled; the site reads it
// at runtime from the public graph API declared in index.html (<meta name="ww2-graph-api">).
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ["index.html", "og.png", "og-supply-network.png", "src", "data", "vendor"]) {
  await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
}

// The runtime uses the generated terrain tiles. Keep the full-resolution source
// in the repository, but leave it out of the deployable bundle.
await rm(path.join(dist, "data", "terrain", "natural-earth-2-relief.jpg"));
await writeFile(path.join(dist, ".nojekyll"), "");

console.log("Built static site in dist/");
