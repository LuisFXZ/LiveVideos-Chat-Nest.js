import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LiveService } from '../services/live.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LiveGateway.name);

  constructor(
    private readonly liveService: LiveService
  ) {}

  @WebSocketServer()
  server: Server;

  private liveRooms = new Map<string, Set<string>>();
  private streamers = new Map<string, string>();
  private viewerCounts = new Map<string, number>();

  handleConnection(client: Socket) {
    try {
      this.logger.log(`Client connected: ${client.id}`);
    } catch (error) {
      this.logger.error(`Error in handleConnection: ${error.message}`);
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      this.logger.log(`Client disconnected: ${client.id}`);
      for (const [roomId, clients] of this.liveRooms.entries()) {
        if (clients.has(client.id)) {
          clients.delete(client.id);
          this.updateViewerCount(roomId);
          
          if (this.streamers.get(roomId) === client.id) {
            const liveId = parseInt(roomId.replace('live_', ''));
            if (!isNaN(liveId)) {
              await this.liveService.updateLiveStatus(liveId, false);
              this.server.to(roomId).emit('streamerDisconnected');
              this.streamers.delete(roomId);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error in handleDisconnect: ${error.message}`);
    }
  }

  private updateViewerCount(roomId: string) {
    try {
      const count = this.liveRooms.get(roomId)?.size || 0;
      this.viewerCounts.set(roomId, count);
      this.server.to(roomId).emit('viewerCountUpdate', { count });
    } catch (error) {
      this.logger.error(`Error in updateViewerCount: ${error.message}`);
    }
  }

  @SubscribeMessage('joinLive')
  async handleJoinLive(client: Socket, liveId: string) {
    try {
      const roomId = `live_${liveId}`;
      client.join(roomId);
      
      if (!this.liveRooms.has(roomId)) {
        this.liveRooms.set(roomId, new Set());
      }
      this.liveRooms.get(roomId).add(client.id);
      
      this.updateViewerCount(roomId);

      const streamerId = this.streamers.get(roomId);
      if (streamerId) {
        this.server.to(streamerId).emit('newViewer', {
          viewerId: client.id
        });
      }

      return { 
        success: true,
        viewerCount: this.viewerCounts.get(roomId) || 0,
        hasActiveStreamer: !!streamerId
      };
    } catch (error) {
      this.logger.error(`Error in handleJoinLive: ${error.message}`);
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('leaveLive')
  handleLeaveLive(client: Socket, liveId: string) {
    const roomId = `live_${liveId}`;
    client.leave(roomId);
    const room = this.liveRooms.get(roomId);
    if (room) {
      room.delete(client.id);
      if (this.streamers.get(roomId) === client.id) {
        this.server.to(roomId).emit('streamerDisconnected');
        this.streamers.delete(roomId);
      }
      if (room.size === 0) {
        this.liveRooms.delete(roomId);
      }
    }
  }

  @SubscribeMessage('startStream')
  async handleStartStream(client: Socket, payload: { liveId: number }) {
    try {
      const { liveId } = payload;
      const roomId = `live_${liveId}`;
      
      if (this.streamers.has(roomId)) {
        throw new WsException('Ya existe un streamer en esta sala');
      }

      await this.liveService.updateLiveStatus(liveId, true);
      this.streamers.set(roomId, client.id);
      
      this.server.to(roomId).emit('newStreamer', { 
        streamerId: client.id,
        viewerCount: this.viewerCounts.get(roomId) || 0
      });

      return { 
        success: true,
        roomId,
        viewerCount: this.viewerCounts.get(roomId) || 0
      };
    } catch (error) {
      this.logger.error(`Error in handleStartStream: ${error.message}`);
      throw new WsException(error.message);
    }
  }

  @SubscribeMessage('streamOffer')
  handleStreamOffer(client: Socket, { liveId, offer, viewerId }) {
    const roomId = `live_${liveId}`;
    client.to(viewerId).emit('streamOffer', {
      offer,
      streamerId: client.id
    });
  }

  @SubscribeMessage('requestStream')
  handleRequestStream(client: Socket, { liveId, offer }) {
    const roomId = `live_${liveId}`;
    const streamerId = this.streamers.get(roomId);
    
    if (!streamerId) {
      client.emit('error', { message: 'No hay streamer disponible' });
      return;
    }

    console.log(`Viewer ${client.id} solicitando stream de ${streamerId}`);
    
    // Enviar la solicitud al streamer
    client.to(streamerId).emit('viewerRequest', {
      offer,
      viewerId: client.id
    });
  }

  @SubscribeMessage('streamAnswer')
  handleStreamAnswer(client: Socket, { answer, viewerId }) {
    client.to(viewerId).emit('streamAnswer', { 
      answer, 
      streamerId: client.id 
    });
  }

  @SubscribeMessage('iceCandidate')
  handleIceCandidate(client: Socket, { candidate, targetId }) {
    client.to(targetId).emit('iceCandidate', { 
      candidate, 
      senderId: client.id 
    });
  }

  @SubscribeMessage('newComment')
  handleNewComment(client: Socket, { liveId, comment }) {
    this.server.to(`live_${liveId}`).emit('commentAdded', {
      ...comment,
      userId: client.id,
      timestamp: new Date()
    });
  }
}
