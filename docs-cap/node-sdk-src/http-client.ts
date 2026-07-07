import { APIError } from './errors';
import type { Logger } from './types';

export type AuthType = 'none' | 'sdk-key';

export interface HttpRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: any;
  authType?: AuthType;
  authVal?: string;
}

export class HttpClient {
  private base: string;
  private logger: Logger;

  constructor(baseURL: string, logger: Logger) {
    this.base = baseURL + '/backend/v1';
    this.logger = logger;
  }

  async do<T = any>(req: HttpRequest): Promise<T | undefined> {
    let bodyStr: string | undefined;
    if (req.body != null) {
      bodyStr = JSON.stringify(req.body);
    } else if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      bodyStr = '{}';
    }

    let fullURL = this.base + req.path;
    if (req.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query)) {
        if (v) params.set(k, v);
      }
      const qs = params.toString();
      if (qs) fullURL += '?' + qs;
    }

    const headers: Record<string, string> = {};
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
    }

    if (req.authType === 'sdk-key') {
      headers['X-SDK-Key'] = req.authVal!;
    }

    this.logger.debug('http request', { method: req.method, url: fullURL });

    const resp = await fetch(fullURL, {
      method: req.method,
      headers,
      body: bodyStr,
    });

    const respBody = await resp.text();

    if (resp.status >= 400) {
      try {
        const parsed = JSON.parse(respBody);
        if (parsed.reason) {
          throw new APIError(resp.status, parsed.code ?? resp.status, parsed.reason, parsed.message ?? '');
        }
      } catch (e) {
        if (e instanceof APIError) throw e;
      }
      throw new APIError(resp.status, resp.status, 'UNKNOWN', respBody);
    }

    if (respBody) {
      return JSON.parse(respBody) as T;
    }
    return undefined;
  }
}

export function buildQuery(
  page: number,
  pageSize: number,
  extras?: Record<string, string | undefined>
): Record<string, string> {
  const q: Record<string, string> = {};
  if (page > 0) q.page = String(page);
  if (pageSize > 0) q.page_size = String(pageSize);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v) q[k] = v;
    }
  }
  return q;
}
