import { EventEmitter } from 'node:events';
import type { ServerEvent } from './types.js';

/**
 * Central event bus. The listener bridge and account manager publish
 * ServerEvents here; consumers = DB writer, WS broadcaster, webhook dispatcher.
 * Consumers MUST wrap their handlers in try/catch so one consumer throwing
 * cannot crash the process (Red Team #1/#5).
 */
export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Avoid MaxListeners warnings with several consumers + WS clients.
    this.emitter.setMaxListeners(100);
  }

  publish(event: ServerEvent): void {
    this.emitter.emit('event', event);
  }

  subscribe(handler: (event: ServerEvent) => void): () => void {
    const safe = (event: ServerEvent) => {
      try {
        handler(event);
      } catch (err) {
        // Never let a consumer error propagate to the emitter / process.
        console.error('[event-bus] consumer error:', err);
      }
    };
    this.emitter.on('event', safe);
    return () => this.emitter.off('event', safe);
  }
}
