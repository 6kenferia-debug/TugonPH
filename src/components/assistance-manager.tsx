import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { onRealtimeConnect, subscribeRealtime } from "../services/socket";
import { toast } from "sonner@2.0.3";
import { useAuth } from "./auth/auth-context";

export interface AssistanceRequest {
  id: string;
  ticketId?: string;
  title: string;
  description: string;
  category: string;
  location: string;
  photo?: string;
  contactInfo: string;
  status: "pending" | "in-progress" | "resolved" | "rejected";
  dateSubmitted: string;
  priority: "low" | "medium" | "high";
  adminNotes?: string;
  resolutionProofImage?: string;
  resolutionProofUploadedAt?: string;
  resolutionProofUploadedBy?: string;
  respondent?: string;
  userId?: string;
  userName?: string;
  latitude?: number;
  longitude?: number;
  coordinates?: { lat: number; lng: number };
  recordType: "assistance";
}

interface AssistanceContextType {
  assistanceRequests: AssistanceRequest[];
  loading: boolean;
  addAssistanceRequest: (
    request: Omit<AssistanceRequest, "id" | "dateSubmitted" | "recordType">,
  ) => Promise<{ error?: string; ticketId?: string }>;
  updateAssistanceRequest: (
    id: string,
    updates: Partial<AssistanceRequest>,
  ) => Promise<{ error?: string }>;
  deleteAssistanceRequest: (id: string) => Promise<{ error?: string }>;
  uploadAssistanceResolutionProof: (
    id: string,
    file: File,
  ) => Promise<{ error?: string; url?: string }>;
  fetchAssistanceRequests: () => Promise<void>;
}

const AssistanceContext = createContext<AssistanceContextType | undefined>(undefined);
type FetchOptions = { suppressLoading?: boolean; suppressErrorToast?: boolean };
type ApiAssistanceRequest = Record<string, any>;

export function AssistanceProvider({ children }: { children: React.ReactNode }) {
  const [assistanceRequests, setAssistanceRequests] = useState<AssistanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin, isGuest, loading: authLoading } = useAuth();
  const hasConnectedRef = useRef(false);

  const getCacheKey = (userId: string, admin: boolean) =>
    `barangaycare.assistance.${admin ? "admin" : "user"}.${userId}`;
  const cacheKey = user ? getCacheKey(user.id, isAdmin) : null;

  const readCache = (key: string): AssistanceRequest[] | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(transform) : null;
    } catch {
      return null;
    }
  };

  const writeCache = (key: string | null, next: AssistanceRequest[]) => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep the in-memory state when browser storage is unavailable.
    }
  };

  const setAndCache = (
    next: AssistanceRequest[] | ((previous: AssistanceRequest[]) => AssistanceRequest[]),
    key: string | null,
  ) => {
    setAssistanceRequests((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      writeCache(key, resolved);
      return resolved;
    });
  };

  function transform(value: ApiAssistanceRequest): AssistanceRequest {
    const latitude = value.latitude ?? value.lat;
    const longitude = value.longitude ?? value.lng;
    return {
      id: String(value.id ?? value._id ?? ""),
      ticketId: value.ticketId ?? value.ticket_id,
      title: value.title,
      description: value.description,
      category: value.category,
      location: value.location,
      photo: value.photo,
      contactInfo: value.contactInfo ?? value.contact_info,
      status: value.status,
      dateSubmitted: value.dateSubmitted ?? value.date_submitted,
      priority: value.priority,
      adminNotes: value.adminNotes ?? value.admin_notes,
      resolutionProofImage: value.resolutionProofImage ?? value.resolution_proof_image,
      resolutionProofUploadedAt: value.resolutionProofUploadedAt ?? value.resolution_proof_uploaded_at,
      resolutionProofUploadedBy: value.resolutionProofUploadedBy ?? value.resolution_proof_uploaded_by,
      respondent: value.respondent,
      userId: value.userId ?? value.user_id,
      userName: value.userName ?? value.user_name,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      coordinates: latitude != null && longitude != null
        ? { lat: Number(latitude), lng: Number(longitude) }
        : undefined,
      recordType: "assistance",
    };
  }

  const fetchInternal = async (options: FetchOptions = {}) => {
    const { suppressLoading = false, suppressErrorToast = false } = options;
    try {
      if (!suppressLoading) setLoading(true);
      if (!user) {
        setAssistanceRequests([]);
        return;
      }

      const { assistanceRequests: records } = await api.get<{
        assistanceRequests: ApiAssistanceRequest[];
      }>("/assistance");
      setAndCache(records.map(transform), cacheKey);
    } catch (error) {
      console.error("Error fetching assistance requests:", error);
      if (!suppressErrorToast) {
        toast.error(error instanceof Error ? error.message : "Failed to load assistance requests");
      }
    } finally {
      if (!suppressLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAssistanceRequests([]);
      setLoading(false);
      hasConnectedRef.current = false;
      return;
    }

    const handleRealtimeChange = (value: { id: string; userId?: string | null }) => {
      if (!isAdmin && value.userId !== user.id) return;
      void fetchInternal({ suppressLoading: true, suppressErrorToast: true });
    };
    const removeFromRealtime = (value: { id: string; userId?: string | null }) => {
      if (!isAdmin && value.userId !== user.id) return;
      setAndCache(
        (previous) => previous.filter((item) => item.id !== value.id),
        cacheKey,
      );
    };

    const unsubscribeCreated = subscribeRealtime("assistance:created", handleRealtimeChange);
    const unsubscribeUpdated = subscribeRealtime("assistance:updated", handleRealtimeChange);
    const unsubscribeDeleted = subscribeRealtime("assistance:deleted", removeFromRealtime);
    const unsubscribeReconnect = onRealtimeConnect(() => {
      if (hasConnectedRef.current) {
        void fetchInternal({ suppressLoading: true, suppressErrorToast: true });
      }
      hasConnectedRef.current = true;
    });

    const cached = cacheKey ? readCache(cacheKey) : null;
    if (cached) {
      setAssistanceRequests(cached);
      setLoading(false);
    }
    void fetchInternal({
      suppressLoading: Boolean(cached),
      suppressErrorToast: Boolean(cached),
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeReconnect();
    };
  }, [user, isAdmin, authLoading]);

  const fetchAssistanceRequests = async () => {
    await fetchInternal();
  };

  const addAssistanceRequest = async (
    requestData: Omit<AssistanceRequest, "id" | "dateSubmitted" | "recordType">,
  ) => {
    try {
      if (!user && !isGuest) {
        return { error: "You must be logged in to submit a request" };
      }

      const payload = {
        title: requestData.title,
        description: requestData.description,
        category: requestData.category,
        location: requestData.location,
        photo: requestData.photo,
        contactInfo: requestData.contactInfo,
        respondent: requestData.respondent,
        coordinates: requestData.coordinates ?? (
          requestData.latitude !== undefined && requestData.longitude !== undefined
            ? { lat: requestData.latitude, lng: requestData.longitude }
            : undefined
        ),
      };
      const { assistanceRequest } = await api.post<{
        assistanceRequest: ApiAssistanceRequest;
      }>("/assistance", payload);
      const created = transform(assistanceRequest);
      setAndCache((previous) => [created, ...previous], cacheKey);
      return { ticketId: created.ticketId };
    } catch (error) {
      console.error("Error adding assistance request:", error);
      const message = error instanceof Error ? error.message : "Failed to submit assistance request";
      toast.error(message);
      return { error: message };
    }
  };

  const updateAssistanceRequest = async (
    id: string,
    updates: Partial<AssistanceRequest>,
  ) => {
    try {
      if (!user) return { error: "You must be logged in to update a request" };
      if (!isAdmin) return { error: "Only admins can update requests" };

      const payload: Record<string, unknown> = { ...updates };
      delete payload.id;
      delete payload.ticketId;
      delete payload.dateSubmitted;
      delete payload.userId;
      delete payload.userName;
      delete payload.recordType;
      if (updates.coordinates) {
        payload.latitude = updates.coordinates.lat;
        payload.longitude = updates.coordinates.lng;
      }
      delete payload.coordinates;

      const { assistanceRequest } = await api.put<{
        assistanceRequest: ApiAssistanceRequest;
      }>(`/assistance/${encodeURIComponent(id)}`, payload);
      const updated = transform(assistanceRequest);
      setAndCache(
        (previous) => previous.map((record) => record.id === id ? updated : record),
        cacheKey,
      );
      toast.success("Assistance request updated successfully");
      return {};
    } catch (error) {
      console.error("Error updating assistance request:", error);
      const message = error instanceof Error ? error.message : "Failed to update assistance request";
      toast.error(message);
      return { error: message };
    }
  };

  const deleteAssistanceRequest = async (id: string) => {
    try {
      if (!user) return { error: "You must be logged in to delete" };
      if (!isAdmin) return { error: "Only admins can delete requests" };

      await api.delete(`/assistance/${encodeURIComponent(id)}`);
      setAndCache(
        (previous) => previous.filter((record) => record.id !== id),
        cacheKey,
      );
      toast.success("Assistance request deleted successfully");
      return {};
    } catch (error) {
      console.error("Error deleting assistance request:", error);
      const message = error instanceof Error ? error.message : "Failed to delete assistance request";
      toast.error(message);
      return { error: message };
    }
  };

  const uploadAssistanceResolutionProof = async (id: string, file: File) => {
    if (!user) return { error: "You must be logged in to upload proof" };
    if (!isAdmin) return { error: "Only admins can upload proof images" };

    const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if ((file.type && !allowedTypes.has(file.type)) || !allowedExtensions.has(extension)) {
      return { error: "Please upload a JPG, JPEG, PNG, or WEBP image." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { error: "Resolution proof image must be 10MB or smaller." };
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const { assistanceRequest } = await api.post<{
        assistanceRequest: ApiAssistanceRequest;
      }>(`/assistance/${encodeURIComponent(id)}/resolution-proof`, formData);
      const updated = transform(assistanceRequest);
      setAndCache(
        (previous) => previous.map((record) => record.id === id ? updated : record),
        cacheKey,
      );
      toast.success("Resolution proof uploaded successfully");
      return { url: updated.resolutionProofImage };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload resolution proof";
      toast.error(message);
      return { error: message };
    }
  };

  return (
    <AssistanceContext.Provider value={{
      assistanceRequests,
      loading,
      addAssistanceRequest,
      updateAssistanceRequest,
      deleteAssistanceRequest,
      uploadAssistanceResolutionProof,
      fetchAssistanceRequests,
    }}>
      {children}
    </AssistanceContext.Provider>
  );
}

export function useAssistance() {
  const context = useContext(AssistanceContext);
  if (!context) throw new Error("useAssistance must be used within an AssistanceProvider");
  return context;
}