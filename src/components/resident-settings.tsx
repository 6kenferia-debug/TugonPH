import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Settings,
  Bell,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "./auth/auth-context";
import { evaluatePasswordStrength } from "./auth/password-strength";

export function ResidentSettings() {
  const {
    user,
    updateEmailNotifications,
    changePassword,
    deleteAccount,
    signOut,
  } = useAuth();
  const [notifications, setNotifications] = useState({
    email: true,
  });
  const [savingEmailNotifications, setSavingEmailNotifications] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmNewPasswordError, setConfirmNewPasswordError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const passwordStrength = evaluatePasswordStrength(newPassword);

  useEffect(() => {
    setNotifications({ email: user?.emailNotifications ?? true });
  }, [user?.id, user?.emailNotifications]);

  const handleEmailNotificationChange = async (enabled: boolean) => {
    const previousValue = notifications.email;
    setNotifications((prev) => ({ ...prev, email: enabled }));
    setSavingEmailNotifications(true);

    const result = await updateEmailNotifications(enabled);
    if (result.error) {
      setNotifications((prev) => ({ ...prev, email: previousValue }));
      toast.error(result.error);
    } else {
      toast.success(`Email notifications ${enabled ? "enabled" : "disabled"}.`);
    }
    setSavingEmailNotifications(false);
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError("Please fill in all password fields.");
      return;
    }
    if (passwordStrength.score < 70) {
      setPasswordError("Password is too weak. Please create a stronger password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setConfirmNewPasswordError("Passwords do not match. Please make sure both fields are identical.");
      return;
    }

    setPasswordLoading(true);
    setPasswordError(null);
    setConfirmNewPasswordError(null);
    const result = await changePassword(currentPassword, newPassword, confirmNewPassword);
    setPasswordLoading(false);
    if (result.error) {
      setPasswordError(result.error);
      toast.error(result.error);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    toast.success("Password changed successfully.");
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    const { error, warning } = await deleteAccount();

    if (error) {
      toast.error(error);
    } else {
      if (warning) {
        toast.warning(warning);
      } else {
        toast.success("Account deleted successfully");
      }
      await signOut();
    }
    setDeletingAccount(false);
    setDeleteDialogOpen(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground p-4 sm:p-6 rounded-lg">
        <h1 className="text-xl sm:text-2xl flex items-center space-x-2">
          <Settings className="w-6 h-6" />
          <span>{"Settings"}</span>
        </h1>
      </div>

      {/* Notification Settings */}
      <Card className="shadow-lg shadow-[#35408E]/15">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="w-5 h-5" />
            <span>{"Notifications"}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive updates via email
                </p>
              </div>
              <Switch
                checked={notifications.email}
                disabled={savingEmailNotifications}
                onCheckedChange={handleEmailNotificationChange}
              />
            </div>

          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg shadow-[#35408E]/15">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Lock className="w-5 h-5" />
            <span>Change Password</span>
          </CardTitle>
          <CardDescription>
            Verify your current password and choose a new secure password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <Alert className="border-destructive/50 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Create a strong password"
                  className="pl-10 pr-10"
                  required
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {newPassword && (
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
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="confirm-new-password"
                  type={showConfirmNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(event) => {
                    setConfirmNewPassword(event.target.value);
                    setConfirmNewPasswordError(null);
                  }}
                  placeholder="Confirm your new password"
                  className={`pl-10 pr-10 ${confirmNewPasswordError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  required
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}>
                  {showConfirmNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {confirmNewPasswordError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {confirmNewPasswordError}
                </p>
              )}
            </div>
            <Button type="submit" disabled={passwordLoading} className="flex items-center space-x-2">
              <Lock className="w-4 h-4" />
              <span>{passwordLoading ? "Changing Password..." : "Change Password"}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/20 shadow-lg shadow-[#35408E]/15">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5" />
            <span>Danger Zone</span>
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              Once you delete your account, there is no going back. All your
              complaints, data, and account information will be permanently
              removed.
            </AlertDescription>
          </Alert>

          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                className="flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-destructive">
                  Delete Account
                </DialogTitle>
                <DialogDescription>
                  Are you absolutely sure you want to delete your account? This
                  action cannot be undone and will permanently remove:
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 text-sm">
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Your profile and personal information</li>
                  <li>All your submitted complaints and requests</li>
                  <li>Your account history and activity</li>
                  <li>Access to the TugonPH system</li>
                </ul>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deletingAccount}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deletingAccount ? "Deleting..." : "Delete Account"}</span>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

    </div>
  );
}
