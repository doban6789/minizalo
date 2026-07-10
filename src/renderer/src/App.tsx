import { useEffect, useState, useCallback } from 'react';
import { loadApi, type Api, type ServerEvent } from './api.js';
import { AccountsTab } from './components/AccountsTab.js';
import { ScenariosTab } from './components/ScenariosTab.js';
import { WebhooksTab } from './components/WebhooksTab.js';
import { SettingsTab } from './components/SettingsTab.js';

export interface Account {
  id: string;
  label: string;
  phone: string | null;
  status: string;
  avatar: string | null;
  ownId: string | null;
  lastSeen: number | null;
  note: string | null;
}

type Tab = 'accounts' | 'scenarios' | 'webhooks' | 'settings';

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const refreshAccounts = useCallback(async (a: Api) => {
    try {
      const res = await a.getAccounts();
      setAccounts(res.accounts);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    loadApi()
      .then((a) => {
        if (!a) {
          setError('Không kết nối được core (chưa khởi động?)');
          return;
        }
        setApi(a);
        void refreshAccounts(a);
        dispose = a.openStream((e: ServerEvent) => {
          if (e.kind === 'account_status') void refreshAccounts(a);
          else if (e.kind === 'listener_stopped')
            setWarning(`Listener của một tài khoản đã dừng (có thể bạn mở Zalo Web ở nơi khác). ${String(e.reason ?? '')}`);
          else if (e.kind === 'core_status' && e.status === 'shutting_down') setError('Core đang tắt.');
        });
      })
      .catch((e) => setError((e as Error).message));
    return () => dispose?.();
  }, [refreshAccounts]);

  if (error) return <div className="content"><div className="banner">{error}</div></div>;
  if (!api) return <div className="content"><p className="muted">Đang kết nối core…</p></div>;

  return (
    <div className="app">
      <div className="tabs">
        <strong style={{ padding: '6px 10px' }}>MiniZalo</strong>
        <div className="spacer" />
        {(['accounts', 'scenarios', 'webhooks', 'settings'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'accounts' ? 'Tài khoản' : t === 'scenarios' ? 'Tình huống' : t === 'webhooks' ? 'Webhook' : 'Cài đặt'}
          </button>
        ))}
      </div>
      <div className="content">
        {warning && (
          <div className="banner">
            ⚠ {warning} <button onClick={() => setWarning(null)}>Ẩn</button>
          </div>
        )}
        {tab === 'accounts' && <AccountsTab api={api} accounts={accounts} onChange={() => refreshAccounts(api)} />}
        {tab === 'scenarios' && <ScenariosTab api={api} />}
        {tab === 'webhooks' && <WebhooksTab api={api} />}
        {tab === 'settings' && <SettingsTab api={api} />}
      </div>
    </div>
  );
}
