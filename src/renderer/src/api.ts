/** Renderer-side REST/WS client. Config comes from the preload bridge. */

export interface Config {
  baseUrl: string;
  apiKey: string;
}

declare global {
  interface Window {
    minizalo: { getConfig: () => Promise<Config | null> };
  }
}

export interface ServerEvent {
  kind: string;
  [k: string]: unknown;
}

export class Api {
  constructor(private cfg: Config) {}

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { 'x-api-key': this.cfg.apiKey, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  }

  getAccounts = () => this.req('GET', '/accounts');
  createAccount = (label: string, phone?: string) => this.req('POST', '/accounts', { label, phone });
  loginQr = (id: string) => this.req('POST', `/accounts/${id}/login/qr`);
  logout = (id: string) => this.req('POST', `/accounts/${id}/logout`);
  removeAccount = (id: string) => this.req('DELETE', `/accounts/${id}`);

  getMessages = (accountId: string, threadId?: string) =>
    this.req('GET', `/messages?accountId=${encodeURIComponent(accountId)}${threadId ? `&threadId=${encodeURIComponent(threadId)}` : ''}`);
  send = (accountId: string, body: { to: string; threadType: string; text?: string; imageBase64?: string }) =>
    this.req('POST', `/accounts/${accountId}/messages`, body);

  getScenarios = () => this.req('GET', '/scenarios');
  searchScenarios = (q: string) => this.req('GET', `/scenarios/search?q=${encodeURIComponent(q)}`);
  addScenario = (s: Record<string, string>) => this.req('POST', '/scenarios', s);
  updateScenario = (id: string, s: Record<string, string>) => this.req('PUT', `/scenarios/${id}`, s);
  deleteScenario = (id: string) => this.req('DELETE', `/scenarios/${id}`);

  getWebhooks = () => this.req('GET', '/webhooks');
  addWebhook = (url: string, events: string) => this.req('POST', '/webhooks', { url, events });
  testWebhook = (id: string) => this.req('POST', `/webhooks/${id}/test`);
  deleteWebhook = (id: string) => this.req('DELETE', `/webhooks/${id}`);

  /** Open the event stream. Auth is sent as the first WS frame (never in URL). */
  openStream(onEvent: (e: ServerEvent) => void): () => void {
    let closed = false;
    let ws: WebSocket | null = null;
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(this.cfg.baseUrl.replace(/^http/, 'ws') + '/stream');
      ws.onopen = () => ws?.send(JSON.stringify({ apiKey: this.cfg.apiKey }));
      ws.onmessage = (ev) => {
        try {
          onEvent(JSON.parse(ev.data));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }
}

export async function loadApi(): Promise<Api | null> {
  const cfg = await window.minizalo.getConfig();
  return cfg ? new Api(cfg) : null;
}
