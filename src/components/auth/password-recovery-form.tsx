import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Eye, EyeOff, Lock, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useAuth } from "./auth-context";
import { evaluatePasswordStrength } from "./password-strength";

interface PasswordRecoveryFormProps {
  onBackToLogin: () => void;
}

type RecoveryStep = "email" | "otp" | "password" | "success";

export function PasswordRecoveryForm({ onBackToLogin }: PasswordRecoveryFormProps) {
  const {
    requestPasswordRecovery,
    verifyPasswordRecoveryOtp,
    resetPassword,
  } = useAuth();
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordStrength = evaluatePasswordStrength(password);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((remaining) => remaining - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(onBackToLogin, 2000);
    return () => window.clearTimeout(timer);
  }, [step, onBackToLogin]);

  const handleRequestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await requestPasswordRecovery(email);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setStep("otp");
    setCooldown(60);
    toast.success("If an account exists for this email, a verification code has been sent.");
  };

  const handleResendCode = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError(null);
    const result = await requestPasswordRecovery(email);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCooldown(60);
    setOtp("");
    toast.success("If an account is eligible, a new verification code has been sent.");
  };

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await verifyPasswordRecoveryOtp(email, otp);
    setLoading(false);
    if (result.error || !result.resetToken) {
      setError(result.error || "Unable to verify this code.");
      return;
    }
    setResetToken(result.resetToken);
    setStep("password");
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordStrength.score < 70) {
      setError("Password is too weak. Please create a stronger password.");
      return;
    }
    if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match. Please make sure both fields are identical.");
      return;
    }
    setLoading(true);
    setError(null);
    setConfirmPasswordError(null);
    const result = await resetPassword(resetToken, password, confirmPassword);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setResetToken("");
    setStep("success");
    toast.success("Your password has been reset successfully.");
  };

  const strengthFeedback = password ? (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Password Strength:</span>
        <span className={`text-xs font-medium ${passwordStrength.color}`}>{passwordStrength.label}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            passwordStrength.score < 40
              ? "bg-red-500"
              : passwordStrength.score < 70
                ? "bg-yellow-500"
                : passwordStrength.score < 100
                  ? "bg-green-500"
                  : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(passwordStrength.score, 100)}%` }}
        />
      </div>
      {passwordStrength.feedback.length > 0 && (
        <div className="bg-muted/50 p-3 rounded-md space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">Required:</p>
          {passwordStrength.feedback.map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs">
              <X className="w-3 h-3 text-red-500" />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      )}
      {passwordStrength.score >= 70 && (
        <div className="flex items-center gap-2 text-xs text-green-600">
          <Check className="w-4 h-4" />
          <span>Great! Your password is {passwordStrength.label.toLowerCase()}</span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg shadow-[#35408E]/15">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {step === "email" && "Forgot Password"}
          {step === "otp" && "Verify Your Email"}
          {step === "password" && "Create New Password"}
          {step === "success" && "Password Reset"}
        </CardTitle>
        <CardDescription>
          {step === "email" && "Enter your account email to receive a recovery code"}
          {step === "otp" && `Enter the 6-digit code sent to ${email}`}
          {step === "password" && "Choose a strong password for your account"}
          {step === "success" && "Your password has been updated"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert className="border-destructive/50 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "email" && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="recovery-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="example@gmail.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send OTP"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-otp">6-digit verification code</Label>
              <Input
                id="recovery-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="text-center tracking-[0.4em]"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
              {loading ? "Verifying..." : "Verify OTP"}
            </Button>
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Didn't receive the code?</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading || cooldown > 0}
                onClick={() => void handleResendCode()}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
              </Button>
            </div>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-new-password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="recovery-new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a strong password"
                  className="pl-10 pr-10"
                  required
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {strengthFeedback}
            </div>
            <div className="space-y-2">
              <Label htmlFor="recovery-confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="recovery-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setConfirmPasswordError(null);
                  }}
                  placeholder="Confirm your new password"
                  className={`pl-10 pr-10 ${confirmPasswordError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  required
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {confirmPasswordError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {confirmPasswordError}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading || passwordStrength.score < 70}>
              {loading ? "Resetting Password..." : "Reset Password"}
            </Button>
          </form>
        )}

        {step === "success" && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <Check className="h-4 w-4" />
            <AlertDescription>Password reset successfully. Returning to login...</AlertDescription>
          </Alert>
        )}

        {step !== "success" && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={step === "email" || step === "password" ? onBackToLogin : () => {
              setError(null);
              setStep("email");
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === "otp" ? "Back to Email" : "Back to Login"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
