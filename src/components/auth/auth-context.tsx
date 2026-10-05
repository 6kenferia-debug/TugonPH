import { createContext, useContext, useEffect, useState } from "react";
import {
  api,
  ApiError,
  authExpiredEventName,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "../../services/api";
import { connectRealtime, disconnectRealtime } from "../../services/polling";

interface User {
  id: string;
  email: string;
  name: string;
  role: "resident" | "admin";
  phoneNumber?: string;
  profilePictureUrl?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  accountStatus?: string;
  addressRejectionReason?: string;
  emailVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  pendingUser: User | null;
  loading: boolean;
  isAdmin: boolean;
  isGuest: boolean;
  signUp: (
    email: string,
    password: string,
    name: string,
    phoneNumber?: string,
  ) => Promise<{ error?: string; pending?: boolean }>;
  sendOtp: (email: string) => Promise<{ error?: string }>;
  verifyEmailOtp: (
    email: string,
    token: string,
  ) => Promise<{ verified?: boolean; error?: string }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error?: string; accountStatus?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInWithFacebook: () => Promise<{ error?: string }>;
  loginAsGuest: () => void;
  signOut: () => Promise<void>;
  updateProfile: (
    name: string,
    phoneNumber?: string,
  ) => Promise<{ error?: string }>;
  uploadProfilePicture: (file: File) => Promise<{ error?: string }>;
  deleteAccount: () => Promise<{ error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const profileApiUnavailable =
  "Profile changes are not available until the MongoDB profile API is migrated.";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    let mounted = true;
    const resetAuthentication = () => {
      setUser(null);
      setPendingUser(null);
      setIsAdmin(false);
    };
    const handleAuthExpired = () => resetAuthentication();

    window.addEventListener(authExpiredEventName, handleAuthExpired);

    const restoreSession = async () => {
      try {
        if (localStorage.getItem("guestMode") === "true") {
          setIsGuest(true);
          return;
        }

        setIsGuest(false);
        if (!getAuthToken()) {
          resetAuthentication();
          return;
        }

        const { user: profile } = await api.get<{ user: User }>("/auth/me");
        if (!mounted) return;
        setUser(profile);
        setIsAdmin(profile.role === "admin");
        setPendingUser(null);
      } catch {
        clearAuthToken();
        if (mounted) resetAuthentication();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void restoreSession();
    return () => {
      mounted = false;
      window.removeEventListener(authExpiredEventName, handleAuthExpired);
    };
  }, []);

  useEffect(() => {
    if (user && !isGuest && getAuthToken()) {
      connectRealtime();
    } else {
      disconnectRealtime();
    }
  }, [user?.id, user?.role, isGuest]);

  const signUp = async (
    email: string,
    password: string,
    name: string,
    phoneNumber?: string,
  ): Promise<{ error?: string; pending?: boolean }> => {
    try {
      await api.post<{ message: string; email: string; requiresOtp: boolean }>(
        "/auth/register",
        { email, password, name, phoneNumber },
        { auth: false },
      );
      return { pending: true };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Registration failed.",
      };
    }
  };

  const sendOtp = async (email: string): Promise<{ error?: string }> => {
    try {
      await api.post<{ message: string }>(
        "/auth/resend-verification",
        { email },
        { auth: false },
      );
      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to send a new verification code.",
      };
    }
  };

  const verifyEmailOtp = async (
    email: string,
    token: string,
  ): Promise<{ verified?: boolean; error?: string }> => {
    try {
      const result = await api.post<{ verified: boolean; message: string }>(
        "/auth/verify-email",
        { email, otp: token },
        { auth: false },
      );
      return { verified: result.verified };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Email verification failed.",
      };
    }
  };

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error?: string; accountStatus?: string }> => {
    try {
      const result = await api.post<{ token: string; user: User }>(
        "/auth/login",
        { email, password },
        { auth: false },
      );
      setAuthToken(result.token);
      localStorage.removeItem("guestMode");
      setUser(result.user);
      setPendingUser(null);
      setIsAdmin(result.user.role === "admin");
      setIsGuest(false);
      return {};
    } catch (error) {
      if (error instanceof ApiError) {
        const statusByCode: Record<string, string> = {
          ACCOUNT_PENDING: "pending",
          ACCOUNT_REJECTED: "rejected",
          EMAIL_UNVERIFIED: "unverified",
        };
        const accountStatus = statusByCode[error.code || ""];
        if (accountStatus) return { error: accountStatus, accountStatus };
        return { error: error.message };
      }
      return { error: "Unable to reach the TugonPH API." };
    }
  };

  const signInWithGoogle = async () => ({
    error: "Google sign-in is not configured for MongoDB authentication.",
  });

  const signInWithFacebook = async () => ({
    error: "Facebook sign-in is not configured for MongoDB authentication.",
  });

  const loginAsGuest = () => {
    clearAuthToken();
    disconnectRealtime();
    localStorage.setItem("guestMode", "true");
    setIsGuest(true);
    setUser(null);
    setPendingUser(null);
    setIsAdmin(false);
  };

  const signOut = async () => {
    clearAuthToken();
    disconnectRealtime();
    localStorage.removeItem("guestMode");
    setIsGuest(false);
    setUser(null);
    setPendingUser(null);
    setIsAdmin(false);
  };

  const updateProfile = async () => ({ error: profileApiUnavailable });
  const uploadProfilePicture = async (file: File) => {
    if (!user) return { error: "Not authenticated" };
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { profile } = await api.put<{ profile: User }>(
        "/auth/profile/picture",
        formData,
      );
      setUser(profile);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Profile picture upload failed." };
    }
  };

  const deleteAccount = async () => ({ error: profileApiUnavailable });

  const refreshProfile = async () => {
    if (!getAuthToken()) return;
    try {
      const { user: profile } = await api.get<{ user: User }>("/auth/me");
      setUser(profile);
      setIsAdmin(profile.role === "admin");
    } catch {
      clearAuthToken();
      setUser(null);
      setPendingUser(null);
      setIsAdmin(false);
    }
  };

  const value: AuthContextType = {
    user,
    pendingUser,
    loading,
    isAdmin,
    isGuest,
    signUp,
    sendOtp,
    verifyEmailOtp,
    signIn,
    signInWithGoogle,
    signInWithFacebook,
    loginAsGuest,
    signOut,
    updateProfile,
    uploadProfilePicture,
    deleteAccount,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}