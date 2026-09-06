// WebRTC Direct Peer-to-Peer Sync Service
// Uses standard WebRTC DataChannels for direct, instant (real-time) sync between devices.

declare const Peer: any;

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SyncMessage {
  type: 'FULL_SYNC' | 'DAY_UPDATE' | 'DELETE_DAY';
  payload: any;
  timestamp: number;
}

class P2PSyncService {
  private peer: any = null;
  private connections: any[] = [];
  public myPeerId: string = '';
  public status: SyncStatus = 'disconnected';
  public connectedPeersCount: number = 0;

  private statusListeners: Array<(status: SyncStatus, peerId: string, count: number) => void> = [];
  private dataListeners: Array<(msg: SyncMessage) => void> = [];

  constructor() {
    this.initPeer();
  }

  public initPeer() {
    if (typeof (window as any).Peer === 'undefined') {
      // Retry in 500ms if script is still loading asynchronously
      setTimeout(() => this.initPeer(), 500);
      return;
    }

    if (this.peer && !this.peer.destroyed) {
      return;
    }

    try {
      this.status = 'connecting';
      this.notifyStatus();

      const PeerClass = (window as any).Peer;
      this.peer = new PeerClass({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id: string) => {
        this.myPeerId = id;
        this.status = 'disconnected';
        console.log('✅ WebRTC Peer Ready. Room ID:', id);
        this.notifyStatus();
      });

      this.peer.on('connection', (conn: any) => {
        console.log('Incoming connection from:', conn.peer);
        this.setupConnection(conn);
      });

      this.peer.on('error', (err: any) => {
        console.error('PeerJS error:', err);
        this.status = 'error';
        this.notifyStatus();
      });

      this.peer.on('disconnected', () => {
        this.status = 'disconnected';
        this.notifyStatus();
      });
    } catch (e) {
      console.error('Failed to initialize PeerJS:', e);
      this.status = 'error';
      this.notifyStatus();
    }
  }

  private setupConnection(conn: any) {
    conn.on('open', () => {
      console.log('Data channel open with:', conn.peer);
      this.connections.push(conn);
      this.status = 'connected';
      this.connectedPeersCount = this.connections.length;
      this.notifyStatus();

      // Request immediate full sync from the connected device
      this.broadcast({
        type: 'FULL_SYNC',
        payload: null,
        timestamp: Date.now()
      });
    });

    conn.on('data', (data: any) => {
      console.log('Received P2P data:', data);
      this.dataListeners.forEach((cb) => cb(data));
    });

    conn.on('close', () => {
      this.connections = this.connections.filter((c) => c !== conn);
      this.connectedPeersCount = this.connections.length;
      if (this.connections.length === 0) {
        this.status = 'disconnected';
      }
      this.notifyStatus();
    });

    conn.on('error', (err: any) => {
      console.error('Connection error with peer:', err);
    });
  }

  public connectToPeer(remotePeerId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.peer || this.peer.destroyed) {
        this.initPeer();
      }

      const cleanId = remotePeerId.trim();
      if (!cleanId || cleanId === this.myPeerId) {
        resolve(false);
        return;
      }

      this.status = 'connecting';
      this.notifyStatus();

      try {
        const conn = this.peer.connect(cleanId, { reliable: true });
        this.setupConnection(conn);

        conn.on('open', () => resolve(true));
        setTimeout(() => {
          if (this.status !== 'connected') {
            resolve(false);
          }
        }, 8000);
      } catch (err) {
        console.error('Connect failed:', err);
        this.status = 'error';
        this.notifyStatus();
        resolve(false);
      }
    });
  }

  public broadcast(msg: SyncMessage) {
    if (this.connections.length === 0) return;
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }

  public onStatusChange(callback: (status: SyncStatus, peerId: string, count: number) => void) {
    this.statusListeners.push(callback);
    callback(this.status, this.myPeerId, this.connectedPeersCount);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  public onDataReceived(callback: (msg: SyncMessage) => void) {
    this.dataListeners.push(callback);
    return () => {
      this.dataListeners = this.dataListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyStatus() {
    this.statusListeners.forEach((cb) => cb(this.status, this.myPeerId, this.connectedPeersCount));
  }
}

export const p2pSync = new P2PSyncService();
