import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.connectionPromise = null;
  }

  connect(serverUrl = 'http://localhost:3001') {
    console.log('Attempting to connect to:', serverUrl);
    
    if (this.socket && this.isConnected) {
      console.log('Already connected, returning existing socket');
      return Promise.resolve(this.socket);
    }

    if (this.connectionPromise) {
      console.log('Connection already in progress, returning existing promise');
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      if (this.socket) {
        console.log('Disconnecting existing socket');
        this.socket.disconnect();
      }

      console.log('Creating new socket connection');
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('✅ Connected to server successfully');
        this.isConnected = true;
        this.connectionPromise = null;
        resolve(this.socket);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server:', reason);
        this.isConnected = false;
        this.connectionPromise = null;
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        this.isConnected = false;
        this.connectionPromise = null;
        reject(error);
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          console.error('❌ Connection timeout after 15 seconds');
          this.connectionPromise = null;
          reject(new Error('Connection timeout'));
        }
      }, 15000);
    });

    return this.connectionPromise;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.connectionPromise = null;
    }
  }

  emit(event, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
      return true;
    } else {
      console.warn('Socket not connected, cannot emit:', event);
      return false;
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  getSocket() {
    return this.socket;
  }
}

export default new SocketService();

