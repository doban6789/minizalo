import type { AccountRepository } from '../repositories/account-repository.js';
import type { MessageRepository } from '../repositories/message-repository.js';
import type { WebhookRepository } from '../repositories/webhook-repository.js';
import type { ScenarioRepository } from '../repositories/scenario-repository.js';
import type { AccountManager } from '../zalo/account-manager.js';
import type { EventBus } from '../event-bus.js';

/** Everything the HTTP/WS routes need, assembled at bootstrap. */
export interface CoreContext {
  apiKey: string;
  /** Per-start instance nonce — CLI verifies this via /health before sending the key (#6). */
  nonce: string;
  version: string;
  cryptoPersistent: boolean;
  accounts: AccountRepository;
  messages: MessageRepository;
  webhooks: WebhookRepository;
  scenarios: ScenarioRepository;
  accountManager: AccountManager;
  bus: EventBus;
}
