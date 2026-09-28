import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { prepareUploadFiles } from '../src/archive';

describe('prepareUploadFiles', () => {
  let tmp: string;
  let fileA: string;
  let fileB: string;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gofile-test-'));
    fileA = path.join(tmp, 'a.txt');
    fileB = path.join(tmp, 'b.txt');
    fs.writeFileSync(fileA, 'hello');
    fs.writeFileSync(fileB, 'world');
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns single file as-is when compression=none', async () => {
    const result = await prepareUploadFiles({
      allPaths: [fileA],
      filePaths: [fileA],
      archiveName: path.join(tmp, 'out'),
      compression: 'none',
      compressionLevel: 6
    });
    assert.deepEqual(result, [fileA]);
  });

  it('zips when compression=auto and multiple paths', async () => {
    const result = await prepareUploadFiles({
      allPaths: [fileA, fileB],
      filePaths: [fileA, fileB],
      archiveName: path.join(tmp, 'bundle'),
      compression: 'auto',
      compressionLevel: 1
    });
    assert.equal(result.length, 1);
    assert.ok(result[0]!.endsWith('.zip'));
    assert.ok(fs.existsSync(result[0]!));
  });

  it('creates tar.gz when requested', async () => {
    const result = await prepareUploadFiles({
      allPaths: [fileA],
      filePaths: [fileA],
      archiveName: path.join(tmp, 'tarball'),
      compression: 'tar.gz',
      compressionLevel: 1
    });
    assert.equal(result.length, 1);
    assert.ok(result[0]!.endsWith('.tar.gz'));
    assert.ok(fs.existsSync(result[0]!));
  });
});
