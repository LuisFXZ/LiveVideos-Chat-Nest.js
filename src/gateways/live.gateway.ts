import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private liveRooms = new Map<string, Set<string>>();
  private streamers = new Map<string, string>();

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    // Limpiar las salas y notificar si el streamer se desconecta
    this.liveRooms.forEach((clients, room) => {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        if (this.streamers.get(room) === client.id) {
          this.server.to(room).emit('streamerDisconnected');
          this.streamers.delete(room);
        }
        if (clients.size === 0) {
          this.liveRooms.delete(room);
        }
      }
    });
  }

  @SubscribeMessage('joinLive')
  handleJoinLive(client: Socket, liveId: string) {
    const roomId = `live_${liveId}`;
    client.join(roomId);
    
    if (!this.liveRooms.has(roomId)) {
      this.liveRooms.set(roomId, new Set());
    }
    this.liveRooms.get(roomId).add(client.id);

    // Si hay un streamer activo, notificar al nuevo usuario
    const streamerId = this.streamers.get(roomId);
    if (streamerId) {
      client.emit('streamerConnected', { streamerId });
    }

    return { event: 'joinedLive', data: { liveId, viewerCount: this.liveRooms.get(roomId).size } };
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
  handleStartStream(client: Socket, { liveId }) {
    const roomId = `live_${liveId}`;
    
    // Verificar si ya existe un streamer en esta sala
    if (this.streamers.has(roomId)) {
      client.emit('error', { message: 'Ya existe un streamer en esta sala' });
      return;
    }

    // Registrar al streamer
    this.streamers.set(roomId, client.id);
    
    // Notificar a todos los usuarios en la sala que hay un nuevo streamer
    this.server.to(roomId).emit('newStreamer', { 
      streamerId: client.id
    });

    // Confirmar al streamer que se ha iniciado correctamente
    client.emit('streamStarted', { 
      success: true, 
      roomId,
      viewerCount: this.liveRooms.get(roomId)?.size || 0
    });

    console.log(`Nuevo streamer ${client.id} en sala ${roomId}`);
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
