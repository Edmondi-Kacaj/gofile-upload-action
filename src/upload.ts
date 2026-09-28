/**
 * Upload orchestration for the Gofile Action.
 * Each step is logged so the workflow log is easy to follow.
 */

import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GofileClient } from './gofile/api';
import type { UploadedFile } from './gofile/types';

export interface UploadOptions {
  files: string[];
  folderName?: string;
  /** Existing folder UUID. If omitted, account root is used (when token present). */
  folderId?: string;
  access: 'public' | 'private' | 'password';
  password?: string;
  expiry?: number;
}

export interface UploadResult {
  downloadPage?: string;
  code?: string;
  fileId: string;
  folderId?: string;
  guestToken?: string;
  totalSize: number;
  md5?: string;
  isPublic: boolean;
  access: string;
  directLink?: string;
  fileCount: number;
}

export async function runUpload(
  client: GofileClient,
  options: UploadOptions
): Promise<UploadResult> {
  const { files, folderName, access, password, expiry } = options;

  core.startGroup('1. Resolve destination folder');
  let targetFolderId = options.folderId;

  if (targetFolderId) {
    core.info(`Using provided folder-id: ${targetFolderId}`);
  } else {
    core.info('No folder-id provided — looking up account root folder…');
    targetFolderId = await client.getRootFolderId();
    if (targetFolderId) {
      core.info(`Using account root folder: ${targetFolderId}`);
    } else {
      core.info('No root folder (guest mode). Gofile will create an account on the first upload.');
    }
  }
  core.endGroup();

  // Create a named subfolder under the parent when we already have one
  core.startGroup('2. Create folder (if needed)');
  let shareCode: string | undefined;

  if (folderName && targetFolderId) {
    core.info(`Creating folder "${folderName}" under ${targetFolderId}…`);
    const folder = await client.createFolder({
      parentFolderId: targetFolderId,
      folderName,
      public: access === 'public'
    });
    targetFolderId = folder.id;
    shareCode = folder.code;
    core.info(`Folder ready: id=${folder.id} code=${folder.code}`);
  } else if (folderName && !targetFolderId) {
    core.info(
      `Guest mode: named folder "${folderName}" will be created after the first upload returns a parent folder.`
    );
  } else {
    core.info('No folder-name set — uploading into the destination as-is.');
  }
  core.endGroup();

  // Upload files
  core.startGroup('3. Upload files');
  const uploaded: UploadedFile[] = [];
  let totalSize = 0;
  let guestToken: string | undefined;

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    const fileName = path.basename(filePath);

    core.info(`── Uploading ${fileName} (${formatBytes(stats.size)}) ──`);
    const buffer = fs.readFileSync(filePath);
    const result = await client.uploadFile({
      data: buffer,
      fileName,
      folderId: targetFolderId
    });

    // First guest upload: adopt token + parent so later files stay together
    if (result.guestToken && !guestToken) {
      guestToken = result.guestToken;
      client.setToken(guestToken);
      targetFolderId = result.parentFolder;
      shareCode = result.parentFolderCode ?? result.code;
      core.info(`Guest account established. parentFolder=${targetFolderId}`);

      // Create named folder now that we have a parent
      if (folderName && targetFolderId && uploaded.length === 0) {
        try {
          core.info(`Creating guest folder "${folderName}"…`);
          const folder = await client.createFolder({
            parentFolderId: targetFolderId,
            folderName,
            public: access === 'public'
          });
          targetFolderId = folder.id;
          shareCode = folder.code;
          core.info(`Guest folder created: id=${folder.id}`);
        } catch (err) {
          core.warning(
            `Could not create named folder after guest upload: ${err instanceof Error ? err.message : err}`
          );
        }
      }
    }

    uploaded.push(result);
    core.info(`Done: ${result.downloadPage || result.fileId}`);
  }

  if (uploaded.length === 0) {
    throw new Error('No files were uploaded.');
  }
  core.info(`Uploaded ${uploaded.length} file(s), total ${formatBytes(totalSize)}`);
  core.endGroup();

  const primary = uploaded[0]!;
  const folderId = targetFolderId ?? primary.parentFolder;

  // Access control
  core.startGroup('4. Apply access settings');
  if (folderId) {
    if (password) {
      core.info('Setting folder password…');
      await client.updateContent(folderId, 'password', password);
      core.info('Password set.');
    }
    if (expiry) {
      core.info(`Setting expiry to ${expiry} (${new Date(expiry * 1000).toISOString()})…`);
      await client.updateContent(folderId, 'expiry', String(expiry));
      core.info('Expiry set.');
    }
    if (access === 'private') {
      core.info('Setting folder to private…');
      await client.updateContent(folderId, 'public', false);
      core.info('Folder is private.');
    } else if (access === 'public' && !password) {
      core.info('Folder remains public.');
    }
  } else {
    core.warning('No folder id available — skipping access updates.');
  }
  core.endGroup();

  return {
    downloadPage: primary.downloadPage,
    code: shareCode ?? primary.code ?? primary.parentFolderCode,
    fileId: primary.fileId,
    folderId,
    guestToken: guestToken ?? primary.guestToken,
    totalSize,
    md5: primary.md5,
    isPublic: access === 'public',
    access,
    directLink: primary.directLink,
    fileCount: uploaded.length
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
