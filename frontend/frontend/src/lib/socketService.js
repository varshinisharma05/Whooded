// frontend/src/lib/socketService.js

import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.connectionPromise = null;
    this.pendingListeners = new Map();
  }

  _chooseServerUrl(explicitServerUrl) {
    const defaultLocal = 'http://localhost:3001';
    const envUrl =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_BACKEND_URL
        ? import.meta.env.VITE_BACKEND_URL
        : null;

    const isLocalHostname =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

    const isDevMode =
    (typeof import.meta !== 'undefined' &&
     import.meta.env &&
     import.meta.env.MODE === 'development') ||
     isLocalHostname;

    if (explicitServerUrl) return explicitServerUrl;
    if (isDevMode || isLocalHostname) return defaultLocal;
    if (envUrl) return envUrl;
    if (typeof window !== 'undefined') return window.location.origin;
    return defaultLocal;
  }

  async connect(explicitServerUrl) {
    if (this.socket && this.socket.connected) {
      this.isConnected = true;
      return this.socket;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const serverUrl = this._chooseServerUrl(explicitServerUrl);
    console.log('[SocketService] Connecting to:', serverUrl);

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.socket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          withCredentials: false
        });

        // Re-attach all buffered listeners
        this.pendingListeners.forEach((cb, event) => {
          this.socket.on(event, cb);
        });
        this.pendingListeners.clear();

        this.socket.on('connect', () => {
          console.log('[SocketService] Connected:', this.socket.id);
          this.isConnected = true;
          this.connectionPromise = null;
          resolve(this.socket);
        });

        this.socket.on('disconnect', (reason) => {
          console.warn('[SocketService] Disconnected:', reason);
          this.isConnected = false;
        });

        this.socket.on('connect_error', (err) => {
          console.error('[SocketService] connect_error:', err.message);
          if (this.socket.io.engine.reconnectionAttempts >= 5) {
            reject(err);
          }
        });

      } catch (err) {
        console.error('[SocketService] Failed to start connection:', err);
        this.connectionPromise = null;
        reject(err);
      }
    });

    return this.connectionPromise;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
      return true;
    }
    console.warn(`[SocketService] emit failed (not connected): ${event}`);
    return false;
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      this.pendingListeners.set(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    } else {
      this.pendingListeners.delete(event);
    }
  }

  getSocket() {
    return this.socket;
  }
}

export default new SocketService();
