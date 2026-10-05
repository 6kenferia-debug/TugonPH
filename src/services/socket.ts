import { io, type Socket } from "socket.io-client";
import {
  API_BASE_URL,
  authExpiredEventName,
  clearAuthToken,
  getAuthToken,
} from "./api";

export interface RealtimeRequest {
  id: string;
  userId?: string | null;
}

export interface DeletedRequest {
  id: string;
  userId?: string | null;
}

export type RealtimeEventName =
  | "complaint:created"
  | "complaint:updated"
  | "complaint:deleted"
  | "assistance:created"
  | "assistance:updated"
  | "assistance:deleted";

type EventPayload = RealtimeRequest | DeletedRequest;
type EventListener = (payload: EventPayload) => void;
type ConnectionListener = () => void;

const eventListeners = new Map<RealtimeEventName, Set<EventListener>>();
const connectionListeners = new Set<ConnectionListener>();
let socket: Socket | null = null;
let connectedToken: string | null = null;

function attachListeners(nextSocket: Socket) {
  for (const [eventName, listeners] of eventListeners) {
    for (const listener of listeners) nextSocket.on(eventName, listener);
  }
  for (const listener of connectionListeners) nextSocket.on("connect", listener);
}

export function connectRealtime(token = getAuthToken()): void {
  if (!token || typeof window === "undefined") {
    disconnectRealtime();
    return;
  }
  if (socket && connectedToken === token) {
    if (!socket.active) socket.connect();
    return;
  }

  disconnectRealtime();
  const socketOrigin = new URL(API_BASE_URL, window.location.origin).origin;
  connectedToken = token;
  socket = io(socketOrigin, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
  });
  attachListeners(socket);
  socket.on("connect_error", (error) => {
    if (error.data?.code !== "AUTHENTICATION_FAILED") return;
    clearAuthToken();
    window.dispatchEvent(new Event(authExpiredEventName));
    disconnectRealtime();
  });
  socket.on("auth:expired", () => {
    clearAuthToken();
    window.dispatchEvent(new Event(authExpiredEventName));
    disconnectRealtime();
  });
}

export function disconnectRealtime(): void {
  if (!socket) {
    connectedToken = null;
    return;
  }
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  connectedToken = null;
}

export function subscribeRealtime(
  eventName: RealtimeEventName,
  listener: EventListener,
): () => void {
  let listeners = eventListeners.get(eventName);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(eventName, listeners);
  }
  listeners.add(listener);
  socket?.on(eventName, listener);

  return () => {
    socket?.off(eventName, listener);
    listeners?.delete(listener);
    if (listeners?.size === 0) eventListeners.delete(eventName);
  };
}

export function onRealtimeConnect(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  socket?.on("connect", listener);
  return () => {
    socket?.off("connect", listener);
    connectionListeners.delete(listener);
  };
}

export function isRealtimeConnected(): boolean {
  return Boolean(socket?.connected);
}