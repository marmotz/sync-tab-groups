import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { ZipArchive } from 'archiver';
import packageJson from '../package.json' with { type: 'json' };

const files = (await Bun.$`git ls-files`.text()).trim().split('\n');

const archiveName = `builds/sync_tab_groups-${packageJson.version}-source.zip`;
const output = createWriteStream(archiveName);
const archive = new ZipArchive({ zlib: { level: 9 } });

archive.pipe(output);
for (const file of files) {
  archive.file(file, { name: file });
}
await archive.finalize();
await once(output, 'close');

console.log(archiveName);
