import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Separator } from "../ui/separator";
import { Alert, AlertDescription } from "../ui/alert";
import {
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  X,
  Clock,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "./auth-context";
import { toast } from "sonner";
import { evaluatePasswordStrength as getPasswordStrength } from "./password-strength";

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberError, setPhoneNumberError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [middleNameError, setMiddleNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | null
  >(null);
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    label: string;
    color: string;
    feedback: string[];
  }>({ score: 0, label: "", color: "", feedback: [] });

  // Flow step: 'form' | 'otp' | 'pending'
  const [step, setStep] = useState<"form" | "otp" | "pending">("form");

  // OTP verification states
  const [otpDigits, setOtpDigits] = useState<string[]>([
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const {
    signUp,
    sendOtp,
    verifyEmailOtp,
    loginAsGuest,
  } = useAuth();

  const normalizePhone = (value: string) =>
    value.replace(/\D/g, "").slice(0, 11);

  const validatePhone = (value: string): string | null => {
    if (!value) return null;
    if (!/^\d+$/.test(value)) {
      return "Phone number must contain digits only";
    }
    if (value.length !== 11) {
      return "Phone number must be exactly 11 digits";
    }
    return null;
  };

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Validation function for name fields - only letters and spaces allowed
  const validateNameField = (
    value: string,
    fieldName: string,
  ): string | null => {
    if (!value.trim()) {
      return null;
    }
    const nameRegex = /^[a-zA-ZÀ-ÿ\s]+$/;
    if (!nameRegex.test(value)) {
      return `${fieldName} must contain only letters and spaces`;
    }
    return null;
  };

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    if (value) {
      setFirstNameError(validateNameField(value, "First name"));
    } else {
      setFirstNameError(null);
    }
  };

  const handleMiddleNameChange = (value: string) => {
    setMiddleName(value);
    setMiddleNameError(validateNameField(value, "Middle name"));
  };

  const handleLastNameChange = (value: string) => {
    setLastName(value);
    if (value) {
      setLastNameError(validateNameField(value, "Last name"));
    } else {
      setLastNameError(null);
    }
  };

  const evaluatePasswordStrength = (password: string) => {
    setPasswordStrength(getPasswordStrength(password));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    evaluatePasswordStrength(value);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !firstName || !lastName) {
      toast.error("Please fill in all required fields");
      return;
    }

    const firstNameValidation = validateNameField(firstName, "First name");
    const middleNameValidation = validateNameField(middleName, "Middle name");
    const lastNameValidation = validateNameField(lastName, "Last name");

    if (firstNameValidation || middleNameValidation || lastNameValidation) {
      setFirstNameError(firstNameValidation);
      setMiddleNameError(middleNameValidation);
      setLastNameError(lastNameValidation);
      toast.error("Please fix the validation errors in the name fields");
      return;
    }

    if (passwordStrength.score < 70) {
      toast.error("Password is too weak. Please create a stronger password.");
      return;
    }

    const phoneValidation = validatePhone(phoneNumber.trim());
    if (phoneValidation) {
      setPhoneNumberError(phoneValidation);
      toast.error(phoneValidation);
      return;
    }

    if (password !== confirmPassword) {
      setConfirmPasswordError(
        "Passwords do not match. Please make sure both fields are identical.",
      );
      toast.error("Passwords do not match");
      return;
    }

    setConfirmPasswordError(null);

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setEmailError(null);

    const fullName =
      `${firstName} ${middleName ? middleName + " " : ""}${lastName}`.trim();
    const { error, errorCode } = await signUp(
      email,
      password,
      fullName,
      phoneNumber || undefined,
    );

    if (error) {
      if (
        errorCode === "EMAIL_SERVICE_NOT_CONFIGURED" ||
        errorCode === "EMAIL_DELIVERY_FAILED"
      ) {
        setStep("otp");
        setCooldown(0);
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpError(null);
        toast.error(
          "Your account was saved, but the verification email could not be sent. Configure email delivery, then use Resend code.",
        );
        setLoading(false);
        return;
      }
      if (
        error.toLowerCase().includes("already") ||
        error.toLowerCase().includes("exists")
      ) {
        setEmailError(
          `This email address is already registered. Please sign in instead.`,
        );
        toast.error(`Email already registered. Please sign in instead.`);
      } else if (error.toLowerCase().includes("rate")) {
        toast.error("Too many attempts. Please wait before trying again.");
      } else {
        toast.error(error);
      }
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("otp");
    setCooldown(60);
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError(null);
    toast.success("📧 Verification code sent to your email.");
  };

  // ── OTP digit input handler ─────────────────────────────────────────────────
  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const newDigits = [...otpDigits];
      newDigits[index] = value.slice(-1);
      setOtpDigits(newDigits);
      setOtpError(null);
      if (value && index < 5) {
        otpInputRefs.current[index + 1]?.focus();
      }
    },
    [otpDigits],
  );

  const handleOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      }
    },
    [otpDigits],
  );

  const handleOtpPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 6);
      if (pasted.length > 0) {
        const newDigits = [...otpDigits];
        for (let i = 0; i < pasted.length; i++) {
          newDigits[i] = pasted[i];
        }
        setOtpDigits(newDigits);
        const focusIdx = Math.min(pasted.length, 5);
        otpInputRefs.current[focusIdx]?.focus();
      }
    },
    [otpDigits],
  );

  // ── Verify OTP + complete profile ─────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const otp = otpDigits.join("");
    if (otp.length !== 6) {
      setOtpError("Please enter all 6 digits");
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      const { verified, error: otpErr } = await verifyEmailOtp(email, otp);
      if (otpErr || !verified) {
        setOtpError(otpErr || "Verification failed.");
        return;
      }

      setStep("pending");
      toast.success(
        "🎉 Email verified! Your registration is pending admin approval.",
      );
    } catch {
      setOtpError("An unexpected error occurred. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    setOtpLoading(true);
    try {
      const { error } = await sendOtp(email);
      if (error) {
        toast.error(error);
      } else {
        setCooldown(60);
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpError(null);
        toast.success("📧 New OTP sent!");
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Step 3: Pending Approval Screen ─────────────────────────────────────────
  if (step === "pending") {
    return (
      <Card className="w-full max-w-md mx-auto shadow-lg shadow-[#35408E]/15">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100  flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600 " />
          </div>
          <CardTitle className="text-2xl">Registration Submitted</CardTitle>
          <CardDescription>
            Your account is pending admin approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50  ">
            <Clock className="h-4 w-4 text-amber-600 " />
            <AlertDescription className="text-amber-800  text-sm">
              <strong>What happens next?</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>An admin will review your registration</li>
                <li>
                  You will be able to log in once your account is approved
                </li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-3 p-4 bg-green-50  border border-green-200  rounded-lg">
            <Check className="w-5 h-5 text-green-600  shrink-0" />
            <p className="text-sm text-green-800 ">
              ✅ Email verified &bull; registration awaiting admin review.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={onSwitchToLogin}
            className="w-full"
          >
            Back to Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Step 2: OTP Verification Screen ─────────────────────────────────────────
  if (step === "otp") {
    const otpFull = otpDigits.join("").length === 6;

    return (
      <Card className="w-full max-w-md mx-auto shadow-lg shadow-[#35408E]/15">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-blue-100  flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-blue-600 " />
          </div>
          <CardTitle className="text-2xl">Verify Your Email</CardTitle>
          <CardDescription>
            We sent a 6-digit code to{" "}
            <strong className="text-foreground">{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 6 OTP digit boxes */}
          <div className="flex justify-center gap-2">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpInputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={i === 0 ? handleOtpPaste : undefined}
                className={`w-12 h-14 text-center text-2xl font-bold rounded-lg border-2 bg-background transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                  otpError
                    ? "border-destructive focus:ring-destructive/50"
                    : digit
                      ? "border-primary"
                      : "border-border"
                }`}
              />
            ))}
          </div>

          {otpError && (
            <Alert className="border-destructive/50 text-destructive ">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{otpError}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleVerifyOtp}
            disabled={!otpFull || otpLoading}
            className="w-full"
          >
            {otpLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Verifying…
              </>
            ) : (
              "Verify & Complete Registration"
            )}
          </Button>

          {/* Resend OTP */}
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Didn't receive the code?
            </p>
            {cooldown > 0 ? (
              <p className="text-sm text-muted-foreground">
                Resend in{" "}
                <span className="font-semibold text-foreground">
                  {cooldown}s
                </span>
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResendOtp}
                disabled={otpLoading}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Resend Code
              </Button>
            )}
          </div>

          {/* Back to form */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setStep("form");
              setOtpError(null);
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Registration
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Registration Form ────────────────────────────────────────────────────────
  return (
    <Card className="w-full max-w-md mx-auto shadow-lg shadow-[#35408E]/15">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Join TugonPH</CardTitle>
        <CardDescription>
          Create your account to start making a difference in your community
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {emailError && (
          <Alert className="border-destructive/50 text-destructive  [&>svg]:text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{emailError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => handleFirstNameChange(e.target.value)}
                  placeholder="First name"
                  className={`pl-10 ${
                    firstNameError
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }`}
                  required
                />
              </div>
              {firstNameError && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {firstNameError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => handleLastNameChange(e.target.value)}
                placeholder="Last name"
                className={
                  lastNameError
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
                required
              />
              {lastNameError && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {lastNameError}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="middleName">Middle Name</Label>
            <Input
              id="middleName"
              type="text"
              value={middleName}
              onChange={(e) => handleMiddleNameChange(e.target.value)}
              placeholder="Middle name (optional)"
              className={
                middleNameError
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
            />
            {middleNameError && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {middleNameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="example@gmail.com"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={phoneNumber}
                onChange={(e) => {
                  const normalized = normalizePhone(e.target.value);
                  setPhoneNumber(normalized);
                  setPhoneNumberError(validatePhone(normalized));
                }}
                placeholder="Enter your phone number"
                className={`pl-10 ${
                  phoneNumberError
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
              />
            </div>
            {phoneNumberError && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {phoneNumberError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="Create a strong password"
                className="pl-10 pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>

            {password && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Password Strength:
                  </span>
                  <span
                    className={`text-xs font-medium ${passwordStrength.color}`}
                  >
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="h-2 bg-gray-200  rounded-full overflow-hidden">
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
                    style={{
                      width: `${Math.min(passwordStrength.score, 100)}%`,
                    }}
                  />
                </div>
                {passwordStrength.feedback.length > 0 && (
                  <div className="bg-muted/50 p-3 rounded-md space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Required:
                    </p>
                    {passwordStrength.feedback.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 text-xs"
                      >
                        <X className="w-3 h-3 text-red-500" />
                        <span className="text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                )}
                {passwordStrength.score >= 70 && (
                  <div className="flex items-center gap-2 text-xs text-green-600 ">
                    <Check className="w-4 h-4" />
                    <span>
                      Great! Your password is{" "}
                      {passwordStrength.label.toLowerCase()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              Confirm Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmPasswordError) setConfirmPasswordError(null);
                }}
                placeholder="Confirm your password"
                className={`pl-10 pr-10 ${
                  confirmPasswordError
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
            {confirmPasswordError && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {confirmPasswordError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading ||
              !!firstNameError ||
              !!middleNameError ||
              !!lastNameError ||
              (!!password && passwordStrength.score < 70)
            }
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              <>Submit Registration</>
            )}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={loginAsGuest}
          disabled={loading}
          className="w-full"
        >
          Continue as Guest
        </Button>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">
            Already have an account?{" "}
          </span>
          <Button
            variant="link"
            onClick={onSwitchToLogin}
            className="p-0 h-auto text-primary"
          >
            Sign in
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
