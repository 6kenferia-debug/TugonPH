import { useState } from "react";
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
import {
  Settings,
  Bell,
  Globe,
  Save,
} from "lucide-react";
import { toast } from "sonner@2.0.3";

export function ResidentSettings() {

  // Settings state
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    statusUpdates: true,
  });

  const [preferences, setPreferences] = useState({
    autoLocation: true,
  });

  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
    setUnsavedChanges(true);
  };

  const handlePreferenceChange = (key: string, value: string | boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setUnsavedChanges(true);
  };

  const handleSaveSettings = () => {
    // In a real app, this would save to backend
    toast.success("Successfully saved!");
    setUnsavedChanges(false);
  };

  const resetSettings = () => {
    // Reset to defaults
    setNotifications({
      email: true,
      push: true,
      statusUpdates: true,
    });
    setPreferences({
      autoLocation: true,
    });
    setUnsavedChanges(true);
    toast.success("Successfully updated!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground p-4 sm:p-6 rounded-lg">
        <h1 className="text-xl sm:text-2xl flex items-center space-x-2">
          <Settings className="w-6 h-6" />
          <span>{"Settings"}</span>
        </h1>
        <p className="mt-2 opacity-90 text-sm sm:text-base">
          Customize your TugonPH experience
        </p>
      </div>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="w-5 h-5" />
            <span>{"Notifications"}</span>
          </CardTitle>
          <CardDescription>
            Choose how you want to be notified about updates
          </CardDescription>
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
                onCheckedChange={(checked) =>
                  handleNotificationChange("email", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive browser push notifications
                </p>
              </div>
              <Switch
                checked={notifications.push}
                onCheckedChange={(checked) =>
                  handleNotificationChange("push", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Status Updates</Label>
                <p className="text-sm text-muted-foreground">
                  When your requests are updated
                </p>
              </div>
              <Switch
                checked={notifications.statusUpdates}
                onCheckedChange={(checked) =>
                  handleNotificationChange("statusUpdates", checked)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Globe className="w-5 h-5" />
            <span>{"General Settings"}</span>
          </CardTitle>
          <CardDescription>
            Set your location and other preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Auto-detect Location</Label>
              <p className="text-sm text-muted-foreground">
                Automatically fill location from your device
              </p>
            </div>
            <Switch
              checked={preferences.autoLocation}
              onCheckedChange={(checked) =>
                handlePreferenceChange("autoLocation", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 pt-4">
        <Button
          onClick={handleSaveSettings}
          disabled={!unsavedChanges}
          className="flex items-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>{"Save"}</span>
        </Button>

        <Button variant="outline" onClick={resetSettings}>
          {"Reset"}
        </Button>
      </div>

      {unsavedChanges && (
        <div className="bg-yellow-50  border border-yellow-200  rounded-lg p-4">
          <p className="text-sm text-yellow-800 ">
            You have unsaved changes. Don't forget to save your settings.
          </p>
        </div>
      )}
    </div>
  );
}
