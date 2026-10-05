import { API_BASE_URL, getAuthToken } from "./api";

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
let pollIntervals: Map<string, NodeJS.Timer> = new Map();
let lastCheckTimes: Map<string, number> = new Map();
let isConnected = false;

const POLL_INTERVAL = 7000; // 7 seconds

function attachListeners() {
  for (const listener of connectionListeners) {
    listener();
  }
  isConnected = true;
}

export function connectRealtime(token = getAuthToken()): void {
  if (!token || typeof window === "undefined") {
    disconnectRealtime();
    return;
  }

  disconnectRealtime();
  attachListeners();

  // Start polling for complaints
  startPolling("complaints", token);
  // Start polling for assistance requests
  startPolling("assistance-requests", token);
}

function startPolling(resource: string, token: string) {
  // Initial call
  pollResource(resource, token);

  // Set up interval
  const interval = setInterval(() => {
    pollResource(resource, token);
  }, POLL_INTERVAL);

  pollIntervals.set(resource, interval);
}

async function pollResource(resource: string, token: string) {
  try {
    const lastCheck = lastCheckTimes.get(resource) || 0;
    const response = await fetch(
      `${API_BASE_URL}/polling/${resource}?since=${lastCheck}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401) {
      disconnectRealtime();
      return;
    }

    if (!response.ok) return;

    const data = await response.json();
    lastCheckTimes.set(resource, Date.now());

    // Process changes
    if (data.created?.length) {
      for (const item of data.created) {
        const eventName = `${resource === "complaints" ? "complaint" : "assistance"}:created` as RealtimeEventName;
        emitToListeners(eventName, { id: item.id, userId: item.userId });
      }
    }

    if (data.updated?.length) {
      for (const item of data.updated) {
        const eventName = `${resource === "complaints" ? "complaint" : "assistance"}:updated` as RealtimeEventName;
        emitToListeners(eventName, { id: item.id, userId: item.userId });
      }
    }

    if (data.deleted?.length) {
      for (const item of data.deleted) {
        const eventName = `${resource === "complaints" ? "complaint" : "assistance"}:deleted` as RealtimeEventName;
        emitToListeners(eventName, { id: item.id, userId: item.userId });
      }
    }
  } catch (error) {
    console.error(`Polling error for ${resource}:`, error);
  }
}

function emitToListeners(eventName: RealtimeEventName, payload: EventPayload) {
  const listeners = eventListeners.get(eventName);
  if (listeners) {
    for (const listener of listeners) {
      listener(payload);
    }
  }
}

export function disconnectRealtime(): void {
  pollIntervals.forEach((interval) => clearInterval(interval));
  pollIntervals.clear();
  lastCheckTimes.clear();
  isConnected = false;
}

export function subscribeRealtime(
  eventName: RealtimeEventName,
  listener: EventListener
): () => void {
  let listeners = eventListeners.get(eventName);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(eventName, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) eventListeners.delete(eventName);
  };
}

export function onRealtimeConnect(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  if (isConnected) {
    listener();
  }
  return () => {
    connectionListeners.delete(listener);
  };
}

export function isRealtimeConnected(): boolean {
  return isConnected;
}
