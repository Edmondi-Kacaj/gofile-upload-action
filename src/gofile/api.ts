/**
 * Gofile.io REST client.
 * Official docs: https://gofile.io/api
 *
 * Base API:  https://api.gofile.io
 * Uploads:   https://upload.gofile.io (or regional hosts)
 */

import * as core from '@actions/core';
import { HttpClient } from './http';
import type {
  Account,
  AccountId,
  ContentAttribute,
  DirectLink,
  Folder,
  UploadedFile
} from './types';

const API = 'https://api.gofile.io';

/** Upload hosts by region */
const UPLOAD_HOSTS: Record<string, string> = {
  auto: 'upload.gofile.io',
  'eu-par': 'upload-eu-par.gofile.io',
  'na-phx': 'upload-na-phx.gofile.io',
  'na-nyc': 'upload-na-nyc.gofile.io',
  'ap-sgp': 'upload-ap-sgp.gofile.io',
  'ap-hkg': 'upload-ap-hkg.gofile.io',
  'ap-tyo': 'upload-ap-tyo.gofile.io',
  'ap-syd': 'upload-ap-syd.gofile.io',
  'sa-sao': 'upload-sa-sao.gofile.io'
};

export interface GofileClientOptions {
  /** API token. Omit for guest uploads. */
  token?: string;
  /** Upload region. Default: auto */
  region?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class GofileClient {
  private readonly http: HttpClient;
  private readonly region: string;

  constructor(options: GofileClientOptions = {}) {
    this.http = new HttpClient({
      token: options.token,
      maxRetries: options.maxRetries,
      retryDelayMs: options.retryDelayMs
    });
    this.region = options.region ?? 'auto';
  }

  /** Use a guestToken returned by the first anonymous upload. */
  setToken(token: string): void {
    this.http.setToken(token);
    core.info('Using guest token for subsequent requests.');
  }

  get isAuthenticated(): boolean {
    return this.http.hasToken;
  }

  // ── Accounts ─────────────────────────────────────────────────────

  /**
   * GET /accounts/getid
   * Returns the account id for the current token.
   */
  async getAccountId(): Promise<string> {
    core.info('API: GET /accounts/getid');
    const data = await this.http.get<AccountId>(`${API}/accounts/getid`);
    core.info(`Account id: ${data.id}`);
    return data.id;
  }

  /**
   * GET /accounts/{id}
   * Full account details including rootFolder.
   */
  async getAccount(accountId: string): Promise<Account> {
    core.info(`API: GET /accounts/${accountId}`);
    const account = await this.http.get<Account>(`${API}/accounts/${accountId}`);
    core.info(`Account tier: ${account.tier}, rootFolder: ${account.rootFolder ?? '(none)'}`);
    return account;
  }

  /**
   * Resolve the authenticated account's root folder UUID.
   * Returns undefined when there is no token (guest mode).
   */
  async getRootFolderId(): Promise<string | undefined> {
    if (!this.isAuthenticated) {
      core.info('No token — skipping root folder lookup (guest mode).');
      return undefined;
    }
    try {
      const id = await this.getAccountId();
      const account = await this.getAccount(id);
      if (!account.rootFolder) {
        core.warning('Account response has no rootFolder field.');
        return undefined;
      }
      return account.rootFolder;
    } catch (err) {
      core.warning(`Could not resolve root folder: ${err instanceof Error ? err.message : err}`);
      return undefined;
    }
  }

  /**
   * POST /accounts
   * Create a guest account (empty body). Returns id, token, rootFolder.
   */
  async createGuestAccount(): Promise<Account & { token: string; rootFolder: string }> {
    core.info('API: POST /accounts (create guest)');
    return this.http.postJson(`${API}/accounts`, {});
  }

  // ── Folders ──────────────────────────────────────────────────────

  /**
   * POST /contents/createFolder
   */
  async createFolder(params: {
    parentFolderId: string;
    folderName?: string;
    public?: boolean;
  }): Promise<Folder> {
    core.info(
      `API: POST /contents/createFolder  name=${params.folderName ?? '(auto)'}  parent=${params.parentFolderId}`
    );
    const folder = await this.http.postJson<Folder>(`${API}/contents/createFolder`, params);
    core.info(`Created folder id=${folder.id} code=${folder.code}`);
    return folder;
  }

  // ── Upload ───────────────────────────────────────────────────────

  /**
   * POST https://{region}/contents/uploadfile
   * Multipart form: file (+ optional folderId).
   * Without a token, Gofile creates a guest account and returns guestToken.
   */
  async uploadFile(params: {
    data: Blob | Buffer;
    fileName: string;
    folderId?: string;
  }): Promise<UploadedFile> {
    const host = UPLOAD_HOSTS[this.region] ?? UPLOAD_HOSTS.auto;
    const url = `https://${host}/contents/uploadfile`;

    core.info(`API: POST ${url}  file=${params.fileName}  folderId=${params.folderId ?? '(new)'}`);

    const blob =
      params.data instanceof Blob ? params.data : new Blob([new Uint8Array(params.data)]);

    const form = new FormData();
    form.append('file', blob, params.fileName);
    if (params.folderId) {
      form.append('folderId', params.folderId);
    }

    const raw = await this.http.postForm<Record<string, unknown>>(url, form);

    // Normalize id / fileId field names from the API
    const file: UploadedFile = {
      fileId: String(raw.fileId ?? raw.id ?? ''),
      fileName: String(raw.fileName ?? raw.name ?? params.fileName),
      downloadPage: String(raw.downloadPage ?? ''),
      parentFolder: String(raw.parentFolder ?? ''),
      parentFolderCode: raw.parentFolderCode ? String(raw.parentFolderCode) : undefined,
      code: raw.code ? String(raw.code) : undefined,
      md5: raw.md5 ? String(raw.md5) : undefined,
      size: typeof raw.size === 'number' ? raw.size : undefined,
      guestToken: raw.guestToken ? String(raw.guestToken) : undefined,
      directLink: raw.directLink ? String(raw.directLink) : undefined
    };

    core.info(
      `Uploaded fileId=${file.fileId}  page=${file.downloadPage || '(none)'}  parent=${file.parentFolder}`
    );
    if (file.guestToken) {
      core.info('Response included a guestToken.');
    }
    return file;
  }

  // ── Content attributes ───────────────────────────────────────────

  /**
   * PUT /contents/{id}/update
   * Set one attribute per call (public, password, expiry, name, …).
   */
  async updateContent(
    contentId: string,
    attribute: ContentAttribute,
    attributeValue: string | boolean | number
  ): Promise<void> {
    // Never log password values
    const display = attribute === 'password' ? '***' : String(attributeValue);
    core.info(`API: PUT /contents/${contentId}/update  ${attribute}=${display}`);
    await this.http.putJson(`${API}/contents/${contentId}/update`, {
      attribute,
      attributeValue
    });
  }

  // ── Delete / move / copy ─────────────────────────────────────────

  /**
   * DELETE /contents
   * body: { contentsId: "id1,id2,…" }
   */
  async deleteContents(contentIds: string[]): Promise<void> {
    core.info(`API: DELETE /contents  ids=${contentIds.join(',')}`);
    await this.http.deleteJson(`${API}/contents`, {
      contentsId: contentIds.join(',')
    });
  }

  /**
   * PUT /contents/move  (Premium)
   */
  async moveContents(contentIds: string[], folderId: string): Promise<void> {
    core.info(`API: PUT /contents/move  ids=${contentIds.join(',')} → ${folderId}`);
    await this.http.putJson(`${API}/contents/move`, {
      contentsId: contentIds.join(','),
      folderId
    });
  }

  /**
   * POST /contents/copy  (Premium)
   */
  async copyContents(contentIds: string[], folderId: string): Promise<void> {
    core.info(`API: POST /contents/copy  ids=${contentIds.join(',')} → ${folderId}`);
    await this.http.postJson(`${API}/contents/copy`, {
      contentsId: contentIds.join(','),
      folderId
    });
  }

  // ── Read / search ────────────────────────────────────────────────

  /**
   * GET /contents/{contentId}  (Premium for listings)
   */
  async getContent(contentId: string): Promise<unknown> {
    core.info(`API: GET /contents/${contentId}`);
    return this.http.get(`${API}/contents/${contentId}`);
  }

  /**
   * GET /contents/search  (Premium)
   */
  async search(contentId: string, searchedString: string): Promise<unknown> {
    const qs = new URLSearchParams({ contentId, searchedString });
    core.info(`API: GET /contents/search?${qs}`);
    return this.http.get(`${API}/contents/search?${qs}`);
  }

  // ── Direct links (Premium) ───────────────────────────────────────

  /**
   * POST /contents/{id}/directlinks
   */
  async createDirectLink(
    contentId: string,
    options: {
      expireTime?: number;
      sourceIpsAllowed?: string[];
      domainsAllowed?: string[];
      domainsBlocked?: string[];
    } = {}
  ): Promise<DirectLink> {
    core.info(`API: POST /contents/${contentId}/directlinks`);
    const link = await this.http.postJson<DirectLink>(
      `${API}/contents/${contentId}/directlinks`,
      options
    );
    core.info(`Direct link: ${link.directLink}`);
    return link;
  }

  /**
   * DELETE /contents/{id}/directlinks/{directLinkId}
   */
  async deleteDirectLink(contentId: string, directLinkId: string): Promise<void> {
    core.info(`API: DELETE /contents/${contentId}/directlinks/${directLinkId}`);
    await this.http.deleteJson(`${API}/contents/${contentId}/directlinks/${directLinkId}`);
  }
}
