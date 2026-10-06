import { useState, useEffect, useMemo, useRef } from "react";
import { AuthProvider, useAuth } from "./components/auth/auth-context";
import {
  ComplaintProvider,
  useComplaints,
} from "./components/complaint-manager";
import {
  AssistanceProvider,
  useAssistance,
} from "./components/assistance-manager";
import { LoginForm } from "./components/auth/login-form";
import { SignupForm } from "./components/auth/signup-form";
import AuthLayout from "./components/auth/auth-layout";
import { ProfileManagement } from "./components/auth/profile-management";
import { UserManagement } from "./components/auth/user-management";
import { ResidentSettings } from "./components/resident-settings";
import { Header } from "./components/header";
import { TicketBadge } from "./components/ticket-badge";
import { UnifiedDashboard } from "./components/unified-dashboard";
import { ComplaintForm } from "./components/complaint-form";
import { AssistanceForm } from "./components/assistance-form";
import { AdminPanel } from "./components/admin-panel";
import { DataAnalytics } from "./components/data-analytics";
import { HeatmapDashboard } from "./components/heatmap-dashboard";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import {
  CheckCircle,
  CheckCheck,
  Clock,
  Bell,
  MapPin,
  MessageSquare,
  Phone,
  Shield,
  User,
  XCircle,
  Eye,
} from "lucide-react";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { api } from "./services/api";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";

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
  recordType?: "assistance";
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  type?: "complaint" | "assistance" | "system";
  sourceId?: string;
  imageUrl?: string;
  requestTitle?: string;
  ticketId?: string;
  status?: string;
}

// No sample data - only real data will be displayed

function AppContent() {
  const { user, pendingUser, loading, isAdmin, isGuest, refreshProfile } =
    useAuth();
  const {
    complaints,
    loading: complaintsLoading,
    addComplaint,
    updateComplaint,
    deleteComplaint,
    uploadComplaintResolutionProof,
    fetchComplaints,
  } = useComplaints();
  const {
    assistanceRequests,
    loading: assistanceLoading,
    addAssistanceRequest,
    fetchAssistanceRequests,
    updateAssistanceRequest,
    deleteAssistanceRequest,
    uploadAssistanceResolutionProof,
  } = useAssistance();
  const [currentView, setCurrentView] = useState("dashboard");
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(
    null,
  );
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [requestHistory, setRequestHistory] = useState<Array<{
    id: string;
    action: string;
    previousValue: string | null;
    newValue: string | null;
    details: string;
    performedByName: string;
    performedByRole: string;
    createdAt: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [guestSubmissionType, setGuestSubmissionType] = useState<
    "complaint" | "assistance"
  >("complaint");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const previousComplaintSnapshot = useRef<
    Map<
      string,
      {
        status: string;
        adminNotes: string | null;
        resolutionProofImage: string | null;
      }
    >
  >(new Map());
  const previousAssistanceSnapshot = useRef<
    Map<
      string,
      {
        status: string;
        adminNotes: string | null;
        resolutionProofImage: string | null;
      }
    >
  >(new Map());
  const notificationsInitialized = useRef(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const notificationsStorageKey = user
    ? `barangaycare.notifications.${isAdmin ? "admin" : "user"}.${user.id}`
    : null;

  const persistNotifications = (next: AppNotification[]) => {
    if (notificationsStorageKey) {
      localStorage.setItem(notificationsStorageKey, JSON.stringify(next));
    }
    return next;
  };

  const buildSnapshot = (
    items: Array<{
      id: string;
      status: string;
      adminNotes?: string | null;
      resolutionProofImage?: string | null;
    }>,
  ) => {
    const snapshot = new Map<
      string,
      {
        status: string;
        adminNotes: string | null;
        resolutionProofImage: string | null;
      }
    >();
    for (const item of items) {
      snapshot.set(item.id, {
        status: item.status,
        adminNotes: item.adminNotes || null,
        resolutionProofImage: item.resolutionProofImage || null,
      });
    }
    return snapshot;
  };

  const createNotification = (
    title: string,
    message: string,
    meta: Pick<
      AppNotification,
      "type" | "sourceId" | "imageUrl" | "requestTitle" | "ticketId" | "status"
    > = {},
  ): AppNotification => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    createdAt: new Date().toISOString(),
    read: false,
    ...meta,
  });

  const ticketSentence = (ticketId?: string | null) =>
    ticketId ? ` Ticket ID: ${ticketId}.` : "";

  // Redirect admins to Admin Dashboard after login
  useEffect(() => {
    if (user && isAdmin && currentView === "dashboard") {
      setCurrentView("admin");
    }
  }, [user, isAdmin, currentView]);

  useEffect(() => {
    if (!notificationsStorageKey) {
      setNotifications([]);
      previousComplaintSnapshot.current = new Map();
      previousAssistanceSnapshot.current = new Map();
      notificationsInitialized.current = false;
      return;
    }

    try {
      const stored = localStorage.getItem(notificationsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as AppNotification[];
        setNotifications(parsed);
      } else {
        setNotifications([]);
      }
    } catch {
      setNotifications([]);
    }

    previousComplaintSnapshot.current = new Map();
    previousAssistanceSnapshot.current = new Map();
    notificationsInitialized.current = false;
  }, [notificationsStorageKey]);

  useEffect(() => {
    if (!user) return;

    const refreshLatest = () => {
      void Promise.all([fetchComplaints(), fetchAssistanceRequests()]);
    };

    const intervalId = window.setInterval(refreshLatest, 15000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshLatest();
      }
    };
    const onFocus = () => {
      refreshLatest();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, fetchComplaints, fetchAssistanceRequests]);

  useEffect(() => {
    if (!user) return;
    if (complaintsLoading || assistanceLoading) return;

    const statusLabel = (value: string) => value.replace("-", " ");
    const requestNotificationMeta = (request: Complaint, type: "complaint" | "assistance") => ({
      type,
      sourceId: request.id,
      imageUrl: request.resolutionProofImage,
      requestTitle: request.title,
      ticketId: request.ticketId,
      status: request.status,
    });
    const assistanceStatusTitle = (value: string) => {
      if (value === "resolved") return "Assistance request approved";
      if (value === "rejected") return "Assistance request rejected";
      return "Assistance request updated";
    };

    if (!notificationsInitialized.current) {
      const complaintSeeds = complaints
        .filter((complaint) => {
          if (isAdmin) return true;
          return complaint.userId === user.id;
        })
        .slice(0, 10)
        .map((complaint) => {
          if (isAdmin) {
            return {
              id: `seed-admin-complaint-${complaint.id}`,
              title: "New complaint submitted",
              message: `${complaint.userName || "A resident"} filed "${complaint.title}" (${complaint.status}).${ticketSentence(complaint.ticketId)}`,
              createdAt: complaint.dateSubmitted,
              read: true,
              ...requestNotificationMeta(complaint, "complaint"),
            } as AppNotification;
          }

          return {
            id: `seed-user-complaint-${complaint.id}`,
            title: "Complaint status",
            message: `"${complaint.title}" is currently ${statusLabel(complaint.status)}.${ticketSentence(complaint.ticketId)}`,
            createdAt: complaint.dateSubmitted,
            read: true,
            ...requestNotificationMeta(complaint, "complaint"),
          } as AppNotification;
        });

      const assistanceSeeds = assistanceRequests
        .filter((request) => {
          if (isAdmin) return true;
          return request.userId === user.id;
        })
        .slice(0, 10)
        .map((request) => {
          if (isAdmin) {
            return {
              id: `seed-admin-assistance-${request.id}`,
              title: "New assistance request submitted",
              message: `${request.userName || "A resident"} requested "${request.title}" (${request.status}).${ticketSentence(request.ticketId)}`,
              createdAt: request.dateSubmitted,
              read: true,
              ...requestNotificationMeta(request, "assistance"),
            } as AppNotification;
          }

          return {
            id: `seed-user-assistance-${request.id}`,
            title: "Assistance request status",
            message: `"${request.title}" is currently ${statusLabel(request.status)}.${ticketSentence(request.ticketId)}`,
            createdAt: request.dateSubmitted,
            read: true,
            ...requestNotificationMeta(request, "assistance"),
          } as AppNotification;
        });

      const seeded = [...complaintSeeds, ...assistanceSeeds]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 20);

      setNotifications((prev) => {
        if (prev.length > 0) return prev;
        return persistNotifications(seeded);
      });

      previousComplaintSnapshot.current = buildSnapshot(complaints);
      previousAssistanceSnapshot.current = buildSnapshot(assistanceRequests);
      notificationsInitialized.current = true;
      return;
    }

    const prevComplaints = previousComplaintSnapshot.current;
    const prevAssistance = previousAssistanceSnapshot.current;
    const fresh: AppNotification[] = [];

    for (const complaint of complaints) {
      const previous = prevComplaints.get(complaint.id);

      if (isAdmin) {
        if (!previous) {
          fresh.push(
            createNotification(
              "New complaint submitted",
              `${complaint.userName || "A resident"} filed "${complaint.title}" in ${complaint.category}.${ticketSentence(complaint.ticketId)}`,
              requestNotificationMeta(complaint, "complaint"),
            ),
          );
        }

        const currentProof = complaint.resolutionProofImage || null;
        if (previous && currentProof && previous.resolutionProofImage !== currentProof) {
          fresh.push(
            createNotification(
              "Complaint proof uploaded",
              `Resolution proof was uploaded for "${complaint.title}".${ticketSentence(complaint.ticketId)}`,
              requestNotificationMeta(complaint, "complaint"),
            ),
          );
        }
      } else {
        if (complaint.userId !== user.id) continue;

        if (!previous) {
          fresh.push(
            createNotification(
              "Complaint received",
              `Your complaint "${complaint.title}" was recorded as ${statusLabel(complaint.status)}.${ticketSentence(complaint.ticketId)}`,
              requestNotificationMeta(complaint, "complaint"),
            ),
          );
          continue;
        }

        if (previous.status !== complaint.status) {
          fresh.push(
            createNotification(
              "Complaint status updated",
              `"${complaint.title}" changed from ${statusLabel(previous.status)} to ${statusLabel(complaint.status)}.${ticketSentence(complaint.ticketId)}`,
              requestNotificationMeta(complaint, "complaint"),
            ),
          );
        }

        const currentProof = complaint.resolutionProofImage || null;
        if (currentProof && previous.resolutionProofImage !== currentProof) {
          fresh.push(
            createNotification(
              "Resolution proof uploaded",
              `Your complaint "${complaint.title}" now includes an admin proof image.${ticketSentence(complaint.ticketId)}`,
              requestNotificationMeta(complaint, "complaint"),
            ),
          );
        }

        const currentNotes = complaint.adminNotes || null;
        if (currentNotes && previous.adminNotes !== currentNotes) {
          fresh.push(
            createNotification(
              "Admin response received",
              `An admin updated "${complaint.title}" with new notes.${ticketSentence(complaint.ticketId)}`,
              requestNotificationMeta(complaint, "complaint"),
            ),
          );
        }
      }
    }

    for (const request of assistanceRequests) {
      const previous = prevAssistance.get(request.id);

      if (isAdmin) {
        if (!previous) {
          fresh.push(
            createNotification(
              "New assistance request submitted",
              `${request.userName || "A resident"} requested "${request.title}" in ${request.category}.${ticketSentence(request.ticketId)}`,
              requestNotificationMeta(request, "assistance"),
            ),
          );
        }

        if (previous && previous.status !== request.status) {
          fresh.push(
            createNotification(
              "Assistance request status changed",
              `"${request.title}" moved from ${statusLabel(previous.status)} to ${statusLabel(request.status)}.${ticketSentence(request.ticketId)}`,
              requestNotificationMeta(request, "assistance"),
            ),
          );
        }

        const currentProof = request.resolutionProofImage || null;
        if (previous && currentProof && previous.resolutionProofImage !== currentProof) {
          fresh.push(
            createNotification(
              "Assistance proof uploaded",
              `Resolution proof was uploaded for "${request.title}".${ticketSentence(request.ticketId)}`,
              requestNotificationMeta(request, "assistance"),
            ),
          );
        }

        const currentNotes = request.adminNotes || null;
        if (currentNotes && previous?.adminNotes !== currentNotes) {
          fresh.push(
            createNotification(
              "Assistance request updated",
              `Notes were updated for "${request.title}".${ticketSentence(request.ticketId)}`,
              requestNotificationMeta(request, "assistance"),
            ),
          );
        }
        continue;
      }

      if (request.userId !== user.id) continue;

      if (!previous) {
        fresh.push(
          createNotification(
            "Assistance request submitted",
            `Your assistance request "${request.title}" was recorded as ${statusLabel(request.status)}.${ticketSentence(request.ticketId)}`,
            requestNotificationMeta(request, "assistance"),
          ),
        );
        continue;
      }

      if (previous.status !== request.status) {
        fresh.push(
          createNotification(
            assistanceStatusTitle(request.status),
            `"${request.title}" changed from ${statusLabel(previous.status)} to ${statusLabel(request.status)}.${ticketSentence(request.ticketId)}`,
            requestNotificationMeta(request, "assistance"),
          ),
        );
      }

      const currentProof = request.resolutionProofImage || null;
      if (currentProof && previous.resolutionProofImage !== currentProof) {
        fresh.push(
          createNotification(
            "Resolution proof uploaded",
            `Your assistance request "${request.title}" now includes an admin proof image.${ticketSentence(request.ticketId)}`,
            requestNotificationMeta(request, "assistance"),
          ),
        );
      }

      const currentNotes = request.adminNotes || null;
      if (currentNotes && previous.adminNotes !== currentNotes) {
        fresh.push(
          createNotification(
            "Assistance response received",
            `An admin updated "${request.title}" with new notes.${ticketSentence(request.ticketId)}`,
            requestNotificationMeta(request, "assistance"),
          ),
        );
      }
    }

    if (fresh.length > 0) {
      setNotifications((prevNotifications) => {
        const next = [...fresh, ...prevNotifications].slice(0, 100);
        return persistNotifications(next);
      });
    }

    previousComplaintSnapshot.current = buildSnapshot(complaints);
    previousAssistanceSnapshot.current = buildSnapshot(assistanceRequests);
  }, [
    complaints,
    assistanceRequests,
    complaintsLoading,
    assistanceLoading,
    isAdmin,
    user,
  ]);

  const markAllNotificationsRead = () => {
    setNotifications((prev) =>
      persistNotifications(prev.map((item) => ({ ...item, read: true }))),
    );
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      persistNotifications(
        prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
      ),
    );
  };

  useEffect(() => {
    if (currentView !== "notifications") return;
    if (unreadNotificationCount === 0) return;
    markAllNotificationsRead();
  }, [currentView]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchComplaints(), fetchAssistanceRequests()]);
      toast.success("Latest data loaded");
    } catch {
      toast.error("Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const resetPullState = () => {
    pullStartYRef.current = null;
    isPullingRef.current = false;
    setPullDistance(0);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (currentView === "submit" || currentView === "assistance") return;
    if (refreshing) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "input, textarea, select, button, label, [role='button'], [contenteditable='true']",
      )
    ) {
      return;
    }
    const scrollElement = mainScrollRef.current;
    if (!scrollElement || scrollElement.scrollTop > 0) return;
    pullStartYRef.current = event.touches[0]?.clientY ?? null;
    isPullingRef.current = false;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    if (currentView === "submit" || currentView === "assistance") return;
    if (refreshing) return;
    const scrollElement = mainScrollRef.current;
    const startY = pullStartYRef.current;
    if (!scrollElement || startY === null || scrollElement.scrollTop > 0)
      return;

    const currentY = event.touches[0]?.clientY;
    if (currentY === undefined) return;

    const distance = currentY - startY;
    if (distance <= 0) return;

    isPullingRef.current = true;
    event.preventDefault();
    setPullDistance(Math.min(distance * 0.6, 120));
  };

  const handleTouchEnd = async () => {
    if (currentView === "submit" || currentView === "assistance") {
      resetPullState();
      return;
    }
    if (!isPullingRef.current) {
      resetPullState();
      return;
    }

    const shouldRefresh = pullDistance >= 80;
    resetPullState();

    if (shouldRefresh && !refreshing) {
      await handleRefresh();
    }
  };

  const handleSubmitComplaint = async (
    newComplaint: Omit<Complaint, "id" | "dateSubmitted">,
  ) => {
    const { error, ticketId } = await addComplaint(newComplaint);
    if (error) {
      toast.error(error);
      return { error };
    } else {
      toast.success(
        `Complaint submitted successfully. Ticket ID: ${ticketId || "Pending"}`,
      );
      setCurrentView("dashboard");
      return {};
    }
  };

  const handleSubmitAssistance = async (requestData: any) => {
    const { error, ticketId } = await addAssistanceRequest(requestData);
    if (error) {
      toast.error(error);
      return { error };
    } else {
      toast.success(
        `Assistance request submitted. Ticket ID: ${ticketId || "Pending"}`,
      );
      setCurrentView("dashboard");
      return {};
    }
  };

  const handleUpdateComplaint = async (
    id: string,
    updates: Partial<Complaint>,
  ) => {
    const { error } = await updateComplaint(id, updates);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Request updated successfully!");
    }
  };

  const handleDeleteComplaint = async (id: string) => deleteComplaint(id);

  const handleViewDetails = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setShowDetailsDialog(true);
  };

  const handleViewHistory = async (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setShowHistoryDialog(true);
    setHistoryLoading(true);
    setHistoryError(null);
    setRequestHistory([]);
    const requestType = complaint.recordType === "assistance" ? "assistance" : "complaints";
    try {
      const { history } = await api.get<{ history: Array<{
        id: string;
        action: string;
        previousValue: string | null;
        newValue: string | null;
        details: string;
        performedByName: string;
        performedByRole: string;
        createdAt: string;
      }> }>(`/${requestType}/${encodeURIComponent(complaint.id)}/history`);
      setRequestHistory(history || []);
    } catch (error) {
      console.error('Failed to load complaint history:', error);
      const message = error instanceof Error ? error.message : "Unknown API error";
      setHistoryError(message);
      toast.error(`Unable to load request history: ${message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getNotificationTicket = (
    notification: AppNotification,
  ): Complaint | null => {
    if (!notification.sourceId) return null;

    if (notification.type === "complaint") {
      return (
        complaints.find((complaint) => complaint.id === notification.sourceId) ??
        null
      );
    }

    if (notification.type === "assistance") {
      return assistanceRequests.find(
        (request) => request.id === notification.sourceId,
      ) ?? null;
    }

    return null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800  ";
      case "in-progress":
        return "bg-blue-100 text-blue-800  ";
      case "resolved":
        return "bg-green-100 text-green-800  ";
      case "rejected":
        return "bg-red-100 text-red-800  ";
      default:
        return "bg-gray-100 text-gray-800  ";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const pendingCount = complaints.filter((c) => c.status === "pending").length;

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading TugonPH...</p>
        </div>
      </div>
    );
  }

  // Show guest complaint form if in guest mode
  if (isGuest) {
    const guestFormTitle =
      guestSubmissionType === "complaint"
        ? "Submit your complaint anonymously"
        : "Submit your assistance request anonymously";

    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          {/* Exit Guest Mode Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              localStorage.removeItem("guestMode");
              window.location.reload();
            }}
            className="absolute top-4 right-4 hover:bg-destructive/10"
            title="Exit Guest Mode"
          >
            <span className="sr-only">Exit Guest Mode</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Button>

          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <img
                src="/no-bg-icon.png"
                alt="TugonPH Logo"
                className="w-10 h-10"
              />
              <span className="text-2xl font-semibold text-foreground">
                TugonPH - Guest Mode
              </span>
            </div>
            <p className="text-muted-foreground mb-4">{guestFormTitle}</p>
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              <Button
                type="button"
                variant={
                  guestSubmissionType === "complaint" ? "default" : "outline"
                }
                onClick={() => setGuestSubmissionType("complaint")}
              >
                Complaint
              </Button>
              <Button
                type="button"
                variant={
                  guestSubmissionType === "assistance" ? "default" : "outline"
                }
                onClick={() => setGuestSubmissionType("assistance")}
              >
                Assistance
              </Button>
            </div>
            <div className="bg-blue-50  p-4 rounded-lg max-w-2xl mx-auto">
              <p className="text-sm text-blue-800 ">
                ⓘ You are submitting as a guest. Your submission will be
                recorded as "Anonymous" and you won't be able to track its
                status.
                <br />
                <a
                  href="#"
                  onClick={() => {
                    localStorage.removeItem("guestMode");
                    window.location.reload();
                  }}
                  className="font-medium underline"
                >
                  Create an account
                </a>{" "}
                to track your complaints and receive updates.
              </p>
            </div>
          </div>
          {guestSubmissionType === "complaint" ? (
            <ComplaintForm onSubmit={handleSubmitComplaint} />
          ) : (
            <AssistanceForm onSubmit={handleSubmitAssistance} />
          )}
        </div>
        <Toaster />
      </div>
    );
  }

  // Show authentication forms if user is not logged in
  if (!user) {
    if (pendingUser) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100  flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-amber-600 " />
              </div>
              <CardTitle>Account Pending Approval</CardTitle>
              <CardDescription>
                Your email is verified. An admin still needs to approve your
                account before you can use TugonPH.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                className="w-full"
                onClick={() => void refreshProfile()}
              >
                Check Approval Status
              </Button>
            </CardContent>
          </Card>
          <Toaster />
        </div>
      );
    }

    return (
      <>
        <AuthLayout>
          {authView === "login" ? (
            <LoginForm onSwitchToSignup={() => setAuthView("signup")} />
          ) : (
            <SignupForm onSwitchToLogin={() => setAuthView("login")} />
          )}
        </AuthLayout>
        <Toaster />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        isAdmin={isAdmin}
        pendingCount={pendingCount}
        unreadNotificationCount={unreadNotificationCount}
      />

      <main
        ref={mainScrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetPullState}
        className="flex-1 overflow-y-auto overscroll-y-contain max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8"
      >
        {currentView === "dashboard" && !isAdmin && (
          <UnifiedDashboard
            complaints={complaints}
            assistanceRequests={assistanceRequests}
            onViewDetails={handleViewDetails}
            isAdmin={isAdmin}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}

        {currentView === "submit" && (
          <ComplaintForm onSubmit={handleSubmitComplaint} />
        )}

        {currentView === "assistance" && (
          <AssistanceForm onSubmit={handleSubmitAssistance} />
        )}

        {currentView === "admin" && (
          <AdminPanel
            complaints={complaints}
            assistanceRequests={assistanceRequests}
            onUpdateComplaint={handleUpdateComplaint}
            onDeleteComplaint={handleDeleteComplaint}
            onUpdateAssistance={updateAssistanceRequest}
            onDeleteAssistance={deleteAssistanceRequest}
            onUploadComplaintResolutionProof={uploadComplaintResolutionProof}
            onUploadAssistanceResolutionProof={uploadAssistanceResolutionProof}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            onOpenHeatmap={() => setCurrentView("heatmap")}
          />
        )}

        {currentView === "heatmap" && isAdmin && (
          <HeatmapDashboard
            complaints={complaints}
            assistanceRequests={assistanceRequests}
          />
        )}

        {currentView === "notifications" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground p-4 sm:p-6 rounded-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl flex items-center gap-2">
                    <Bell className="w-6 h-6" />
                    {"Notifications"}
                  </h1>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={markAllNotificationsRead}
                  disabled={unreadNotificationCount === 0}
                >
                  <CheckCheck className="w-4 h-4 mr-2" />
                  {"Mark all read"}
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-4 sm:p-6 space-y-3">
                {notifications.length === 0 &&
                (complaintsLoading || assistanceLoading) ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Bell className="w-10 h-10 mx-auto mb-3 opacity-60" />
                    {"Loading notifications..."}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Bell className="w-10 h-10 mx-auto mb-3 opacity-60" />
                    {"No notifications yet"}
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const ticket = getNotificationTicket(notification);

                    return (
                      <div
                        key={notification.id}
                        className={`flex w-full items-start gap-3 rounded-lg border p-4 transition-colors bg-card ${
                          notification.read ? "border-border" : "border-primary/30"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => markNotificationRead(notification.id)}
                          className="flex min-w-0 flex-1 flex-col gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex min-w-0 gap-3">
                            {notification.imageUrl && (
                              <ImageWithFallback
                                src={notification.imageUrl}
                                alt="Resolution proof preview"
                                className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {isAdmin ? (
                                  <Shield className="w-4 h-4 text-primary shrink-0" />
                                ) : (
                                  <User className="w-4 h-4 text-primary shrink-0" />
                                )}
                                <p className="font-medium text-foreground truncate">
                                  {notification.title}
                                </p>
                                {!notification.read && (
                                  <Badge
                                    variant="default"
                                    className="text-[10px] px-1.5 py-0 h-5"
                                  >
                                    {"New"}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {notification.message}
                              </p>
                              {(notification.requestTitle ||
                                notification.ticketId ||
                                notification.status) && (
                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                  {notification.requestTitle && (
                                    <Badge
                                      variant="secondary"
                                      className="max-w-full truncate"
                                    >
                                      {notification.requestTitle}
                                    </Badge>
                                  )}
                                  {notification.ticketId && (
                                    <Badge variant="outline">
                                      {notification.ticketId}
                                    </Badge>
                                  )}
                                  {notification.status && (
                                    <Badge
                                      variant="outline"
                                      className="capitalize"
                                    >
                                      {notification.status.replace("-", " ")}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 self-end text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {new Date(notification.createdAt).toLocaleString()}
                          </div>
                        </button>
                        {ticket && (
                          <div className="shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(ticket)}
                              className="flex items-center space-x-2"
                            >
                              <Eye className="w-4 h-4" />
                              <span>{"View Status"}</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {currentView === "analytics" && (
          <DataAnalytics
            complaints={complaints}
            assistanceRequests={assistanceRequests}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}

        {currentView === "users" && <UserManagement />}

        {currentView === "profile" && <ProfileManagement />}

        {currentView === "settings" && <ResidentSettings />}
      </main>

      {/* Request Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle>{"Request Details"}</DialogTitle>
            <DialogDescription>
              {"Complete information about this community request"}
            </DialogDescription>
          </DialogHeader>

          {selectedComplaint && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-medium">
                    {selectedComplaint.title}
                  </h3>
                  <div className="mt-2">
                    <TicketBadge
                      ticketId={selectedComplaint.ticketId}
                      showPending
                    />
                  </div>
                  <div className="flex items-center space-x-3 mt-2">
                    <Badge
                      className={`${getStatusColor(
                        selectedComplaint.status,
                      )} border-0`}
                    >
                      {selectedComplaint.status}
                    </Badge>
                    <div className="flex items-center space-x-1">
                      <div
                        className={`w-3 h-3 rounded-full ${getPriorityColor(
                          selectedComplaint.priority,
                        )}`}
                      />
                      <span className="text-sm text-gray-600">
                        {selectedComplaint.priority}{" "}
                        {"priority"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2">
                  {"Description"}
                </h4>
                <p className="text-foreground">
                  {selectedComplaint.description}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-1">
                    {"Category"}
                  </h4>
                  <Badge variant="outline">{selectedComplaint.category}</Badge>
                </div>
                <div>
                  <h4 className="font-medium mb-2 flex items-center space-x-2">
                    <Clock className="w-4 h-4" />
                    <span>{"Submitted At"}</span>
                  </h4>
                  <p className="text-foreground">
                    {new Date(selectedComplaint.dateSubmitted).toLocaleString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      },
                    )}
                  </p>
                </div>
                {selectedComplaint.respondent && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center space-x-2">
                      <User className="w-4 h-4" />
                      <span>{"Respondent"}</span>
                    </h4>
                    <p className="text-foreground">
                      {selectedComplaint.respondent}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => void handleViewHistory(selectedComplaint)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {"View History"}
                </Button>
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center space-x-2">
                  <MapPin className="w-4 h-4" />
                  <span>{"Location"}</span>
                </h4>
                <p className="text-foreground">{selectedComplaint.location}</p>
              </div>

              {selectedComplaint.photo && (
                <div>
                  <h4 className="font-medium mb-2">
                    {"Photo Evidence"}
                  </h4>
                  <ImageWithFallback
                    src={selectedComplaint.photo}
                    alt="Request evidence"
                    className="rounded-lg max-w-full sm:max-w-md"
                  />
                </div>
              )}

              {selectedComplaint.resolutionProofImage && (
                <div className="rounded-lg border border-green-200 bg-green-50/70 p-4  ">
                  <h4 className="font-medium mb-2 text-green-900 ">
                    Resolution Proof Image
                  </h4>
                  <ImageWithFallback
                    src={selectedComplaint.resolutionProofImage}
                    alt="Resolution proof"
                    className="rounded-lg w-full max-h-[420px] object-contain bg-background"
                  />
                </div>
              )}

              <div>
                <h4 className="font-medium mb-2 flex items-center space-x-2">
                  <Phone className="w-4 h-4" />
                  <span>{"Contact Information"}</span>
                </h4>
                <p className="text-foreground">
                  {selectedComplaint.contactInfo}
                </p>
              </div>

              {selectedComplaint.adminNotes && (
                <div className="bg-blue-50  p-4 rounded-lg">
                  <h4 className="font-medium mb-2 text-blue-900 ">
                    {"Admin Notes"}
                  </h4>
                  <p className="text-blue-800 ">
                    {selectedComplaint.adminNotes}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center space-x-2">
                  {selectedComplaint.status === "resolved" ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : selectedComplaint.status === "rejected" ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-500" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {selectedComplaint.status === "resolved"
                      ? "This request has been resolved"
                      : selectedComplaint.status === "rejected"
                        ? "This request has been rejected"
                        : "This request is being processed"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={(open) => {
        setShowHistoryDialog(open);
        if (!open) setRequestHistory([]);
      }}>
        <DialogContent className="flex w-full max-w-2xl max-h-[90vh] min-w-0 flex-col overflow-hidden bg-card px-4 sm:px-6">
          <DialogHeader className="min-w-0 shrink-0">
            <DialogTitle>{"Request History"}</DialogTitle>
            <DialogDescription className="break-words [overflow-wrap:anywhere]">
              {selectedComplaint ? `Activity timeline for ${selectedComplaint.title}` : "Activity timeline"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-2">
            {historyLoading ? (
              <div className="min-w-0 py-6 text-center text-muted-foreground">Loading history...</div>
            ) : historyError ? (
              <div role="alert" className="min-w-0 break-words py-6 text-center text-destructive [overflow-wrap:anywhere]">
                Unable to load request history: {historyError}
              </div>
            ) : requestHistory.length === 0 ? (
              <div className="min-w-0 py-6 text-center text-muted-foreground">No request activity recorded yet.</div>
            ) : (
              <div className="space-y-4">
                {requestHistory.map((entry) => {
                  const valueLabel = (value: string | null) => value && value !== "null" ? value : "—";
                  const entrySummary = entry.details && entry.details.trim() ? entry.details : entry.action;

                  return (
                    <div key={entry.id} className="w-full min-w-0 rounded-lg border border-border bg-card p-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium text-foreground [overflow-wrap:anywhere]">{entry.action}</p>
                          {(entry.previousValue !== null || entry.newValue !== null) && (
                            <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                              {valueLabel(entry.previousValue)} → {valueLabel(entry.newValue)}
                            </p>
                          )}
                          {entry.details && (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">{entrySummary}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 min-w-0 space-y-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        <p className="break-words [overflow-wrap:anywhere]">
                          <span className="font-medium text-foreground">By:</span> {entry.performedByName} ({entry.performedByRole})
                        </p>
                        <p className="break-words [overflow-wrap:anywhere]">
                          {new Date(entry.createdAt).toLocaleString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ComplaintProvider>
        <AssistanceProvider>
          <AppContent />
        </AssistanceProvider>
      </ComplaintProvider>
    </AuthProvider>
  );
}
