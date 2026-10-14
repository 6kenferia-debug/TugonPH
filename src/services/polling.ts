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
type RequestSnapshot = RealtimeRequest & { updatedAt: string };

const eventListeners = new Map<RealtimeEventName, Set<EventListener>>();
const connectionListeners = new Set<ConnectionListener>();
const pollIntervals = new Map<string, ReturnType<typeof setInterval>>();
const snapshots = new Map<string, Map<string, RequestSnapshot>>();
const pollingResources = new Set<string>();
const resourceConnections = new Map<string, boolean>();
let connectedToken: string | null = null;
let isConnected = false;
let connectionGeneration = 0;

const POLL_INTERVAL = 7000;
const RESOURCES = ["complaints", "assistance-requests"];

export function connectRealtime(token = getAuthToken()): void {
  if (!token || typeof window === "undefined") {
    disconnectRealtime();
    return;
  }
  if (connectedToken === token) return;

  disconnectRealtime();
  connectedToken = token;
  const generation = connectionGeneration;
  for (const resource of RESOURCES) resourceConnections.set(resource, false);
  startPolling("complaints", token, generation);
  startPolling("assistance-requests", token, generation);
}

function startPolling(resource: string, token: string, generation: number): void {
  void pollResource(resource, token, generation);
  const interval = setInterval(
    () => void pollResource(resource, token, generation),
    POLL_INTERVAL,
  );
  pollIntervals.set(resource, interval);
}

async function pollResource(
  resource: string,
  token: string,
  generation: number,
): Promise<void> {
  const pollingKey = `${generation}:${resource}`;
  if (pollingResources.has(pollingKey) || generation !== connectionGeneration) return;
  pollingResources.add(pollingKey);

  try {
    const response = await fetch(`${API_BASE_URL}/polling/${resource}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (generation !== connectionGeneration) return;

    if (response.status === 401 || response.status === 403) {
      clearAuthToken();
      window.dispatchEvent(new Event(authExpiredEventName));
      disconnectRealtime();
      return;
    }
    if (!response.ok) {
      throw new Error(`Polling ${resource} failed with status ${response.status}.`);
    }

    const records = await response.json() as RequestSnapshot[];
    if (generation !== connectionGeneration) return;
    const previous = snapshots.get(resource);
    const current = new Map(records.map((record) => [record.id, record]));

    if (previous) {
      const eventNames = resource === "complaints"
        ? {
            created: "complaint:created",
            updated: "complaint:updated",
            deleted: "complaint:deleted",
          }
        : {
            created: "assistance:created",
            updated: "assistance:updated",
            deleted: "assistance:deleted",
          };
      for (const record of records) {
        const oldRecord = previous.get(record.id);
        if (!oldRecord) {
          emitToListeners(eventNames.created, record);
        } else if (oldRecord.updatedAt !== record.updatedAt) {
          emitToListeners(eventNames.updated, record);
        }
      }
      for (const oldRecord of previous.values()) {
        if (!current.has(oldRecord.id)) {
          emitToListeners(eventNames.deleted, oldRecord);
        }
      }
    }

    snapshots.set(resource, current);
    updateResourceConnection(resource, true);
  } catch (error) {
    if (generation === connectionGeneration) {
      updateResourceConnection(resource, false);
      console.error(`Polling error for ${resource}:`, error);
    }
  } finally {
    pollingResources.delete(pollingKey);
  }
}

function updateResourceConnection(resource: string, connected: boolean): void {
  resourceConnections.set(resource, connected);
  const allConnected = RESOURCES.every((name) => resourceConnections.get(name));
  if (isConnected === allConnected) return;
  isConnected = allConnected;
  if (isConnected) {
    for (const listener of connectionListeners) listener();
  }
}

function emitToListeners(eventName: RealtimeEventName, payload: EventPayload): void {
  const listeners = eventListeners.get(eventName);
  if (!listeners) return;
  for (const listener of listeners) listener(payload);
}

export function disconnectRealtime(): void {
  pollIntervals.forEach((interval) => clearInterval(interval));
  pollIntervals.clear();
  snapshots.clear();
  resourceConnections.clear();
  connectionGeneration += 1;
  connectedToken = null;
  isConnected = false;
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

  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) eventListeners.delete(eventName);
  };
}

export function onRealtimeConnect(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  if (isConnected) listener();
  return () => {
    connectionListeners.delete(listener);
  };
}

export function isRealtimeConnected(): boolean {
  return isConnected;
}
