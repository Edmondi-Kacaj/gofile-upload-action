import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GofileClient } from '../src/gofile/api';
import { runUpload } from '../src/upload';

/**
 * Lightweight stub: override methods we need without hitting the network.
 */
function stubClient(overrides: Partial<GofileClient> & object): GofileClient {
  const client = new GofileClient();
  Object.assign(client, overrides);
  return client;
}

describe('runUpload', () => {
  it('uses provided folder-id and creates named folder', async () => {
    const calls: string[] = [];
    const client = stubClient({
      getRootFolderId: async () => {
        calls.push('root');
        return 'should-not-be-used';
      },
      createFolder: async (p) => {
        calls.push(`create:${p.folderName}`);
        return {
          id: 'new-folder',
          type: 'folder' as const,
          name: p.folderName!,
          parentFolder: p.parentFolderId,
          code: 'abc12345'
        };
      },
      uploadFile: async (p) => {
        calls.push(`upload:${p.fileName}`);
        return {
          fileId: 'file-1',
          fileName: p.fileName,
          downloadPage: 'https://gofile.io/d/abc12345',
          parentFolder: p.folderId ?? '',
          md5: 'deadbeef',
          size: 4
        };
      },
      updateContent: async () => {
        calls.push('update');
      }
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'up-'));
    const file = path.join(tmp, 'a.txt');
    fs.writeFileSync(file, 'data');

    const result = await runUpload(client, {
      files: [file],
      folderName: 'release',
      folderId: 'given-id',
      access: 'public'
    });

    assert.equal(result.fileId, 'file-1');
    assert.equal(result.folderId, 'new-folder');
    assert.equal(result.downloadPage, 'https://gofile.io/d/abc12345');
    assert.ok(!calls.includes('root'), 'should not resolve root when folder-id is set');
    assert.ok(calls.includes('create:release'));
    assert.ok(calls.includes('upload:a.txt'));

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('resolves root when folder-id is omitted', async () => {
    const client = stubClient({
      getRootFolderId: async () => 'root-xyz',
      createFolder: async (p) => ({
        id: 'child',
        type: 'folder' as const,
        name: p.folderName!,
        parentFolder: p.parentFolderId,
        code: 'code0001'
      }),
      uploadFile: async (p) => ({
        fileId: 'f1',
        fileName: p.fileName,
        downloadPage: 'https://gofile.io/d/x',
        parentFolder: p.folderId ?? ''
      }),
      updateContent: async () => {}
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'up-'));
    const file = path.join(tmp, 'b.txt');
    fs.writeFileSync(file, 'x');

    const result = await runUpload(client, {
      files: [file],
      folderName: 'build',
      access: 'public'
    });

    assert.equal(result.folderId, 'child');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('applies password via updateContent', async () => {
    const updates: { attr: string; value: unknown }[] = [];
    const client = stubClient({
      getRootFolderId: async () => 'root',
      createFolder: async (p) => ({
        id: 'sec',
        type: 'folder' as const,
        name: p.folderName!,
        parentFolder: p.parentFolderId,
        code: 'c'
      }),
      uploadFile: async (p) => ({
        fileId: 'f',
        fileName: p.fileName,
        downloadPage: 'https://gofile.io/d/c',
        parentFolder: 'sec'
      }),
      updateContent: async (_id, attribute, attributeValue) => {
        updates.push({ attr: attribute, value: attributeValue });
      }
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'up-'));
    const file = path.join(tmp, 'c.txt');
    fs.writeFileSync(file, 'z');

    await runUpload(client, {
      files: [file],
      folderName: 'secret',
      access: 'password',
      password: 's3cret'
    });

    assert.ok(updates.some((u) => u.attr === 'password' && u.value === 's3cret'));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
