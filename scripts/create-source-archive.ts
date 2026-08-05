import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { ZipArchive } from 'archiver';

const files = (await Bun.$`git ls-files`.text()).trim().split('\n');

// Fixed name (no version in the filename): the version is already recorded by the AMO
// submission itself and by git, and a stable path lets web-ext:sign reference it
// directly with --upload-source-code without any shell-side version interpolation.
const archiveName = `builds/source.zip`;
const output = createWriteStream(archiveName);
const archive = new ZipArchive({ zlib: { level: 9 } });

archive.pipe(output);
for (const file of files) {
  archive.file(file, { name: file });
}
await archive.finalize();
await once(output, 'close');

console.log(archiveName);
