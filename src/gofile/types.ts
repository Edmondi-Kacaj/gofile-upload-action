/** Types matching Gofile API responses. Docs: https://gofile.io/api */

export interface AccountId {
  id: string;
}

export interface Account {
  id: string;
  email?: string;
  tier: string;
  rootFolder?: string;
  token?: string;
}

export interface Folder {
  id: string;
  type: 'folder';
  name: string;
  parentFolder: string;
  code: string;
  createTime?: number;
  modTime?: number;
}

export interface UploadedFile {
  /** File UUID (API may return `id` or `fileId`) */
  fileId: string;
  fileName: string;
  downloadPage: string;
  parentFolder: string;
  parentFolderCode?: string;
  code?: string;
  md5?: string;
  size?: number;
  guestToken?: string;
  directLink?: string;
}

export interface DirectLink {
  id: string;
  directLink: string;
  expireTime?: number;
  sourceIpsAllowed?: string[];
  domainsAllowed?: string[];
  domainsBlocked?: string[];
}

export type ContentAttribute =
  | 'name'
  | 'description'
  | 'tags'
  | 'public'
  | 'password'
  | 'expiry'
  | 'modTime';
