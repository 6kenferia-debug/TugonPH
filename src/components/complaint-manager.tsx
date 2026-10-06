import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { onRealtimeConnect, subscribeRealtime } from "../services/polling";
import { toast } from "sonner@2.0.3";
import { useAuth } from "./auth/auth-context";

interface Complaint {
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
}

interface ComplaintContextType {
  complaints: Complaint[];
  loading: boolean;
  addComplaint: (
    complaint: Omit<Complaint, "id" | "dateSubmitted">,
  ) => Promise<{ error?: string; ticketId?: string }>;
  updateComplaint: (
    id: string,
    updates: Partial<Complaint>,
  ) => Promise<{ error?: string }>;
  deleteComplaint: (id: string) => Promise<{ error?: string }>;
  uploadComplaintResolutionProof: (
    id: string,
    file: File,
  ) => Promise<{ error?: string; url?: string }>;
  fetchComplaints: () => Promise<void>;
}

type FetchComplaintsOptions = {
  suppressLoading?: boolean;
  suppressErrorToast?: boolean;
};

type ApiComplaint = Record<string, any>;

const ComplaintContext = createContext<ComplaintContextType | undefined>(
  undefined,
);

export function ComplaintProvider({ children }: { children: React.ReactNode }) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin, isGuest, loading: authLoading } = useAuth();
  const hasConnectedRef = useRef(false);

  const getCacheKey = (userId: string, admin: boolean) =>
    `tugonph.complaints.${admin ? "admin" : "user"}.${userId}`;

  const readCachedComplaints = (cacheKey: string): Complaint[] | null => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(transformComplaint) : null;
    } catch {
      return null;
    }
  };

  const writeCachedComplaints = (
    cacheKey: string | null,
    next: Complaint[],
  ) => {
    if (!cacheKey) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(next));
    } catch {
      // Keep the in-memory state when browser storage is unavailable.
    }
  };

  const setComplaintsAndCache = (
    next: Complaint[] | ((previous: Complaint[]) => Complaint[]),
    cacheKey: string | null,
  ) => {
    setComplaints((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      writeCachedComplaints(cacheKey, resolved);
      return resolved;
    });
  };

  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  const parseCoordinatesFromLocation = (location: unknown) => {
    if (typeof location !== "string") return undefined;
    const match = location.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (!match) return undefined;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
    return { lat, lng };
  };

  function transformComplaint(value: ApiComplaint): Complaint {
    let latitude = toNumber(value.latitude ?? value.lat);
    let longitude = toNumber(value.longitude ?? value.lng);
    const coordinates = value.coordinates;

    if (coordinates && typeof coordinates === "object") {
      latitude ??= toNumber(coordinates.lat ?? coordinates.latitude);
      longitude ??= toNumber(coordinates.lng ?? coordinates.longitude);
    } else if (typeof coordinates === "string") {
      try {
        const parsed = JSON.parse(coordinates);
        latitude ??= toNumber(parsed?.lat ?? parsed?.latitude);
        longitude ??= toNumber(parsed?.lng ?? parsed?.longitude);
      } catch {
        // Ignore malformed legacy cache values.
      }
    }

    if (latitude === undefined || longitude === undefined) {
      const parsed = parseCoordinatesFromLocation(value.location);
      latitude ??= parsed?.lat;
      longitude ??= parsed?.lng;
    }

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
      latitude,
      longitude,
      ...(latitude !== undefined && longitude !== undefined
        ? { coordinates: { lat: latitude, lng: longitude } }
        : {}),
    };
  }

  const cacheKey = user ? getCacheKey(user.id, isAdmin) : null;

  const fetchComplaintsInternal = async (
    options: FetchComplaintsOptions = {},
  ) => {
    const { suppressLoading = false, suppressErrorToast = false } = options;
    try {
      if (!suppressLoading) setLoading(true);
      if (!user) {
        setComplaints([]);
        return;
      }

      const { complaints: records } = await api.get<{ complaints: ApiComplaint[] }>(
        "/complaints",
      );
      setComplaintsAndCache(records.map(transformComplaint), cacheKey);
    } catch (error) {
      console.error("Error fetching complaints:", error);
      if (!suppressErrorToast) {
        toast.error(error instanceof Error ? error.message : "Failed to load complaints");
      }
    } finally {
      if (!suppressLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setComplaints([]);
      setLoading(false);
      hasConnectedRef.current = false;
      return;
    }

    const handleRealtimeChange = (value: { id: string; userId?: string | null }) => {
      if (!isAdmin && value.userId !== user.id) return;
      void fetchComplaintsInternal({ suppressLoading: true, suppressErrorToast: true });
    };
    const removeFromRealtime = (value: { id: string; userId?: string | null }) => {
      if (!isAdmin && value.userId !== user.id) return;
      setComplaintsAndCache(
        (previous) => previous.filter((item) => item.id !== value.id),
        cacheKey,
      );
    };

    const unsubscribeCreated = subscribeRealtime("complaint:created", handleRealtimeChange);
    const unsubscribeUpdated = subscribeRealtime("complaint:updated", handleRealtimeChange);
    const unsubscribeDeleted = subscribeRealtime("complaint:deleted", removeFromRealtime);
    const unsubscribeReconnect = onRealtimeConnect(() => {
      if (hasConnectedRef.current) {
        void fetchComplaintsInternal({ suppressLoading: true, suppressErrorToast: true });
      }
      hasConnectedRef.current = true;
    });

    const cached = cacheKey ? readCachedComplaints(cacheKey) : null;
    if (cached) {
      setComplaints(cached);
      setLoading(false);
    }
    void fetchComplaintsInternal({
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

  const fetchComplaints = async () => {
    await fetchComplaintsInternal();
  };

  const addComplaint = async (
    complaintData: Omit<Complaint, "id" | "dateSubmitted">,
  ) => {
    try {
      if (!user && !isGuest) {
        return { error: "You must be logged in to submit a complaint" };
      }

      const payload = {
        title: complaintData.title,
        description: complaintData.description,
        category: complaintData.category,
        location: complaintData.location,
        photo: complaintData.photo,
        contactInfo: complaintData.contactInfo,
        respondent: complaintData.respondent,
        coordinates: complaintData.coordinates ?? (
          complaintData.latitude !== undefined && complaintData.longitude !== undefined
            ? { lat: complaintData.latitude, lng: complaintData.longitude }
            : undefined
        ),
      };
      const { complaint } = await api.post<{ complaint: ApiComplaint }>(
        "/complaints",
        payload,
      );
      const created = transformComplaint(complaint);
      setComplaintsAndCache((previous) => [created, ...previous], cacheKey);
      return { ticketId: created.ticketId };
    } catch (error) {
      console.error("Error adding complaint:", error);
      const message = error instanceof Error ? error.message : "Failed to submit complaint";
      toast.error(message);
      return { error: message };
    }
  };

  const updateComplaint = async (id: string, updates: Partial<Complaint>) => {
    try {
      if (!user) return { error: "You must be logged in to update a complaint" };
      if (!isAdmin) return { error: "Only admins can update complaints" };

      const payload: Record<string, unknown> = { ...updates };
      delete payload.id;
      delete payload.ticketId;
      delete payload.dateSubmitted;
      delete payload.userId;
      delete payload.userName;
      if (updates.coordinates) {
        payload.latitude = updates.coordinates.lat;
        payload.longitude = updates.coordinates.lng;
      }
      delete payload.coordinates;

      const { complaint } = await api.put<{ complaint: ApiComplaint }>(
        `/complaints/${encodeURIComponent(id)}`,
        payload,
      );
      const updated = transformComplaint(complaint);
      setComplaintsAndCache(
        (previous) => previous.map((record) => record.id === id ? updated : record),
        cacheKey,
      );
      toast.success("Complaint updated successfully");
      return {};
    } catch (error) {
      console.error("Error updating complaint:", error);
      const message = error instanceof Error ? error.message : "Failed to update complaint";
      toast.error(message);
      return { error: message };
    }
  };

  const deleteComplaint = async (id: string) => {
    try {
      if (!user) return { error: "You must be logged in to delete a complaint" };
      if (!isAdmin) return { error: "Only admins can delete complaints" };

      await api.delete(`/complaints/${encodeURIComponent(id)}`);
      setComplaintsAndCache(
        (previous) => previous.filter((record) => record.id !== id),
        cacheKey,
      );
      toast.success("Complaint deleted successfully");
      return {};
    } catch (error) {
      console.error("Error deleting complaint:", error);
      const message = error instanceof Error ? error.message : "Failed to delete complaint";
      toast.error(message);
      return { error: message };
    }
  };

  const uploadComplaintResolutionProof = async (id: string, file: File) => {
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
      const { complaint } = await api.post<{ complaint: ApiComplaint }>(
        `/complaints/${encodeURIComponent(id)}/resolution-proof`,
        formData,
      );
      const updated = transformComplaint(complaint);
      setComplaintsAndCache(
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

  const value = {
    complaints,
    loading,
    addComplaint,
    updateComplaint,
    deleteComplaint,
    uploadComplaintResolutionProof,
    fetchComplaints,
  };

  return (
    <ComplaintContext.Provider value={value}>
      {children}
    </ComplaintContext.Provider>
  );
}

export function useComplaints() {
  const context = useContext(ComplaintContext);
  if (!context) {
    throw new Error("useComplaints must be used within a ComplaintProvider");
  }
  return context;
}