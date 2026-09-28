/**
 * Thin HTTP wrapper for the Gofile API.
 * Retries only on rate-limit (429) and server errors (5xx).
 * All other errors fail immediately.
 */

import * as core from '@actions/core';

interface GofileEnvelope {
  status?: string;
  data?: unknown;
}

export class GofileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 0
  ) {
    super(message);
    this.name = 'GofileError';
  }
}

export interface HttpConfig {
  token?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class HttpClient {
  private token?: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(config: HttpConfig = {}) {
    this.token = config.token?.trim() || undefined;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
  }

  setToken(token?: string): void {
    this.token = token?.trim() || undefined;
  }

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  async request<T>(url: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined)
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (networkError) {
      // Network failures are retryable
      if (attempt < this.maxRetries) {
        await this.backoff(attempt, `network error: ${networkError}`);
        return this.request<T>(url, init, attempt + 1);
      }
      throw new GofileError(
        'network',
        `Network request failed: ${networkError instanceof Error ? networkError.message : networkError}`
      );
    }

    // Retry only 429 and 5xx
    if (response.status === 429 || response.status >= 500) {
      if (attempt < this.maxRetries) {
        await this.backoff(attempt, `HTTP ${response.status}`);
        return this.request<T>(url, init, attempt + 1);
      }
      throw new GofileError(
        `HTTP_${response.status}`,
        `Server error after ${this.maxRetries} retries: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const raw: unknown = await response.json().catch(() => ({}));
    const body: GofileEnvelope =
      raw !== null && typeof raw === 'object' ? (raw as GofileEnvelope) : {};

    // Non-retryable HTTP errors (4xx except we already handled 429)
    if (!response.ok) {
      throw new GofileError(
        `HTTP_${response.status}`,
        `HTTP ${response.status}: ${body?.status || response.statusText}`,
        response.status
      );
    }

    // Gofile envelope: { status: "ok" | "error-…", data }
    if (body.status && body.status !== 'ok') {
      // Only rate-limit status is retryable at the API layer
      if (body.status === 'error-rateLimit' && attempt < this.maxRetries) {
        await this.backoff(attempt, body.status);
        return this.request<T>(url, init, attempt + 1);
      }
      throw new GofileError(body.status, gofileErrorMessage(body.status), response.status);
    }

    return (body.data !== undefined ? body.data : body) as T;
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'GET' });
  }

  postJson<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  }

  putJson<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  }

  deleteJson<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  }

  /** multipart/form-data — do not set Content-Type (fetch adds the boundary) */
  postForm<T>(url: string, form: FormData): Promise<T> {
    return this.request<T>(url, { method: 'POST', body: form });
  }

  private async backoff(attempt: number, reason: string): Promise<void> {
    const delay = this.retryDelayMs * 2 ** attempt + Math.random() * 200;
    core.warning(
      `Retryable error (${reason}). Attempt ${attempt + 1}/${this.maxRetries}, waiting ${Math.round(delay)}ms…`
    );
    await new Promise((r) => setTimeout(r, delay));
  }
}

function gofileErrorMessage(status: string): string {
  const messages: Record<string, string> = {
    'error-token': 'Invalid or missing API token.',
    'error-accountId': 'Account ID does not match the token.',
    'error-notPremium': 'This endpoint requires a Premium account.',
    'error-rateLimit': 'Rate limit exceeded.',
    'error-limits': 'Account quota exceeded (storage or content count).',
    'error-notFound': 'Content not found.',
    'error-owner': 'Content belongs to another account.',
    'error-notOwner': 'Content belongs to another account.',
    'error-rootFolder': 'Cannot modify the account root folder this way.'
  };
  return messages[status] ?? `Gofile API error: ${status}`;
}
