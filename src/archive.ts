import archiverImport from 'archiver';
import type { Archiver, ArchiverOptions } from 'archiver';
import * as fs from 'node:fs';
import * as path from 'node:path';

// archiver is CJS; under tsx/esm the callable may be on .default
const archiver = (
  typeof archiverImport === 'function'
    ? archiverImport
    : (archiverImport as unknown as { default: typeof archiverImport }).default
) as (format: string, options?: ArchiverOptions) => Archiver;

async function createArchive(
  paths: string[],
  outputPath: string,
  format: 'zip' | 'tar',
  gzip = false,
  level = 6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver(format, { gzip, zlib: { level } });

    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);
    archive.pipe(output);

    for (const p of paths) {
      if (!fs.existsSync(p)) continue;
      const stats = fs.statSync(p);
      if (stats.isFile()) {
        archive.file(p, { name: path.basename(p) });
      } else if (stats.isDirectory()) {
        archive.directory(p, path.basename(p));
      }
    }
    archive.finalize();
  });
}

/** Compress when needed; return the list of paths to upload. */
export async function prepareUploadFiles(params: {
  allPaths: string[];
  filePaths: string[];
  archiveName: string;
  compression: string;
  compressionLevel: number;
}): Promise<string[]> {
  const { allPaths, filePaths, archiveName, compression, compressionLevel } = params;

  if (compression === 'zip' || (compression === 'auto' && allPaths.length > 1)) {
    const out = path.resolve(`${archiveName}.zip`);
    await createArchive(allPaths, out, 'zip', false, compressionLevel);
    return [out];
  }

  if (compression === 'tar.gz') {
    const out = path.resolve(`${archiveName}.tar.gz`);
    await createArchive(allPaths, out, 'tar', true, compressionLevel);
    return [out];
  }

  return filePaths;
}
