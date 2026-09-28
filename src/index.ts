import * as core from '@actions/core';
import { resolveFiles } from './glob';
import { prepareUploadFiles } from './archive';
import { GofileClient } from './gofile/api';
import { runUpload } from './upload';

function parseExpiry(raw: string): number | undefined {
  if (!raw) return undefined;
  if (!isNaN(Number(raw))) return Number(raw);

  const m = raw.match(/^(\d+)([dhm])$/);
  if (!m) {
    core.warning(
      `Invalid expiry "${raw}". Use a Unix timestamp or relative value like 7d, 24h, 30m.`
    );
    return undefined;
  }
  const n = parseInt(m[1]!, 10);
  const now = Math.floor(Date.now() / 1000);
  if (m[2] === 'd') return now + n * 86400;
  if (m[2] === 'h') return now + n * 3600;
  if (m[2] === 'm') return now + n * 60;
  return undefined;
}

async function run(): Promise<void> {
  try {
    core.startGroup('0. Read inputs');
    const workingDir = core.getInput('working-directory') || '.';
    process.chdir(workingDir);
    core.info(`Working directory: ${process.cwd()}`);

    const pathInputs = core.getMultilineInput('path', { required: true });
    const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'artifact';
    const folderName = core.getInput('folder-name') || repoName;
    const archiveName = core.getInput('name') || folderName;
    const token = core.getInput('token') || process.env.GOFILE_TOKEN || undefined;
    const folderId = core.getInput('folder-id') || undefined;
    const compression = core.getInput('compression') || 'auto';
    const compressionLevel = parseInt(core.getInput('compression-level') || '6', 10);
    const ifNoFilesFound = (core.getInput('if-no-files-found') || 'warn') as
      | 'warn'
      | 'error'
      | 'ignore';
    const includeHiddenFiles = core.getBooleanInput('include-hidden-files');
    const region = core.getInput('region') || 'auto';
    const password = core.getInput('password') || undefined;
    const expiry = parseExpiry(core.getInput('expiry'));
    const maxRetries = parseInt(core.getInput('max-retries') || '3', 10);
    const retryDelayMs = parseInt(core.getInput('initial-retry-delay-ms') || '1000', 10);

    let access = (core.getInput('access') || 'public') as 'public' | 'private' | 'password';
    if (password) access = 'password';
    else if (core.getInput('public') === 'false') access = 'private';

    core.info(`path: ${pathInputs.join(', ')}`);
    core.info(`folder-name: ${folderName}`);
    core.info(`compression: ${compression} (level ${compressionLevel})`);
    core.info(`region: ${region}`);
    core.info(`access: ${access}`);
    core.info(`token: ${token ? '(provided)' : '(none — guest upload)'}`);
    core.info(`folder-id: ${folderId ?? '(resolve root / guest)'}`);
    if (expiry) core.info(`expiry: ${expiry}`);
    core.endGroup();

    // Resolve files
    core.startGroup('Resolve files');
    const resolved = await resolveFiles({
      patterns: pathInputs,
      ifNoFilesFound,
      includeHiddenFiles
    });
    if (!resolved) {
      core.info('No files matched — stopping.');
      core.endGroup();
      return;
    }
    core.info(`Matched ${resolved.all.length} path(s), ${resolved.files.length} file(s).`);
    for (const p of resolved.all.slice(0, 20)) {
      core.info(`  • ${p}`);
    }
    if (resolved.all.length > 20) {
      core.info(`  … and ${resolved.all.length - 20} more`);
    }
    core.endGroup();

    // Archive
    core.startGroup('Prepare upload payload');
    const filesToUpload = await prepareUploadFiles({
      allPaths: resolved.all,
      filePaths: resolved.files,
      archiveName,
      compression,
      compressionLevel
    });
    if (filesToUpload.length === 0) {
      core.warning('Matched only directories and compression is off — nothing to upload.');
      core.endGroup();
      return;
    }
    core.info(`Files to upload (${filesToUpload.length}):`);
    for (const f of filesToUpload) core.info(`  • ${f}`);
    core.endGroup();

    // Upload
    const client = new GofileClient({
      token,
      region,
      maxRetries,
      retryDelayMs
    });

    const result = await runUpload(client, {
      files: filesToUpload,
      folderName,
      folderId,
      access,
      password,
      expiry
    });

    // Outputs
    core.startGroup('5. Set outputs');
    core.setOutput('download-page', result.downloadPage ?? '');
    core.setOutput('share-url', result.downloadPage ?? '');
    core.setOutput('code', result.code ?? '');
    core.setOutput('file-id', result.fileId);
    core.setOutput('parent-folder', result.folderId ?? '');
    core.setOutput('parent-folder-code', result.code ?? '');
    core.setOutput('folder-name', folderName);
    core.setOutput('guest-token', result.guestToken ?? '');
    core.setOutput('size', String(result.totalSize));
    core.setOutput('md5', result.md5 ?? '');
    core.setOutput('is-public', String(result.isPublic));
    core.setOutput('access', result.access);
    core.setOutput('direct-link', result.directLink ?? '');
    core.setOutput('file-count', String(result.fileCount));

    if (result.downloadPage) {
      core.info(`Share URL: ${result.downloadPage}`);
    }
    if (result.guestToken) {
      core.setSecret(result.guestToken);
      core.info('Guest token stored as output and masked in logs.');
    }
    core.endGroup();

    core.info('✓ Upload finished successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.error(`Upload failed: ${message}`);
    if (error instanceof Error && error.stack) {
      core.debug(error.stack);
    }
    core.setFailed(message);
  }
}

run();
