/**
 * docs/studio-reference/ is the single authored source for the component
 * reference implementations and the token contract.
 *
 * Two copies are generated from it, and neither should ever be hand-edited:
 *   public/studio-reference/   served at /studio-reference/*, framed by
 *                              /systems/studio
 *   styles/studio-contract.css the build input imported by app/globals.css
 *
 * This runs on prebuild. It exists because the two copies drifted once
 * already: public/ was copied before the motion-pause listener was added, so
 * the catalogue's motion toggle was a dead control on every embedded
 * reference while every check still passed.
 */
import { copyFile, mkdir, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "docs", "studio-reference")
const publicDir = join(root, "public", "studio-reference")

await mkdir(publicDir, { recursive: true })
await mkdir(join(root, "styles"), { recursive: true })

const files = await readdir(src)
// .md files are documentation — they stay out of public/
const assets = files.filter((f) => f.endsWith(".html") || f.endsWith(".css"))

for (const file of assets) {
  await copyFile(join(src, file), join(publicDir, file))
}
await copyFile(join(src, "contract.css"), join(root, "styles", "studio-contract.css"))

console.log(`studio-reference: synced ${assets.length} files to public/ and the contract to styles/`)
