import { useState } from "react";
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
import {
  User,
  Phone,
  Mail,
  Save,
  Camera,
  Upload,
  Loader2,
} from "lucide-react";
import { useAuth } from "./auth-context";
import { toast } from "sonner@2.0.3";

export function ProfileManagement() {
  const {
    user,
    updateProfile,
    isAdmin,
    uploadProfilePicture,
  } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || "");
  const [phoneNumberError, setPhoneNumberError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

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

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    const phoneValidation = validatePhone(phoneNumber.trim());
    if (phoneValidation) {
      setPhoneNumberError(phoneValidation);
      toast.error(phoneValidation);
      return;
    }

    setLoading(true);
    const { error } = await updateProfile(name, phoneNumber);

    if (error) {
      toast.error(error);
    } else {
      toast.success("Profile updated successfully");
      setEditMode(false);
    }
    setLoading(false);
  };

  const handleCancelEdit = () => {
    setName(user?.name || "");
    setPhoneNumber(user?.phoneNumber || "");
    setPhoneNumberError(null);
    setEditMode(false);
  };

  const handleProfilePictureUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast.error("Image size must be less than 5MB");
          return;
        }

        // Validate file type
        if (!file.type.startsWith("image/")) {
          toast.error("Please select a valid image file");
          return;
        }

        setUploadingImage(true);
        const { error } = await uploadProfilePicture(file);
        setUploadingImage(false);

        if (error) {
          toast.error(error);
        } else {
          toast.success("Profile picture updated successfully!");
        }
      }
    };
    input.click();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground p-4 sm:p-6 rounded-lg">
        <h1 className="text-xl sm:text-2xl flex items-center space-x-2">
          <User className="w-6 h-6" />
          <span>Profile Management</span>
        </h1>
      </div>
      <Card className="shadow-lg shadow-[#35408E]/15">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="w-5 h-5" />
            <span>Profile Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Picture Section */}
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl overflow-hidden">
                {user?.profilePictureUrl ? (
                  <img
                    src={user.profilePictureUrl}
                    alt="Profile"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to initials if image fails to load
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.textContent =
                        user?.name?.charAt(0).toUpperCase() || "?";
                    }}
                  />
                ) : (
                  user?.name?.charAt(0).toUpperCase()
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                onClick={handleProfilePictureUpload}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </Button>
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-medium">{user?.name}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleProfilePictureUpload}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Change Picture
                  </>
                )}
              </Button>
            </div>
          </div>

          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              {editMode ? (
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                />
              ) : (
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-md">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>{user.name}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              {editMode ? (
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
                  className={
                    phoneNumberError
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
              ) : (
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-md">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{user.phoneNumber || "Not provided"}</span>
                </div>
              )}
              {editMode && phoneNumberError && (
                <p className="text-xs text-destructive">{phoneNumberError}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email Address</Label>
            <div className="flex items-center space-x-2 p-3 bg-muted rounded-md">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span>{user.email}</span>
              <span className="text-xs text-muted-foreground">
                (Cannot be changed)
              </span>
            </div>
          </div>

          {/* Account Information Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Account Status
              </Label>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium">Active</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Account Type
              </Label>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">
                  {isAdmin ? "Administrator" : "Resident"}
                </span>
                {isAdmin && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                    Admin
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Account Created
              </Label>
              <span className="text-sm">
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Last Updated
              </Label>
              <span className="text-sm">
                {new Date(user.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            {editMode ? (
              <>
                <Button
                  onClick={handleSaveProfile}
                  disabled={loading}
                  className="flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{loading ? "Saving..." : "Save Changes"}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setEditMode(true)}
                className="flex items-center space-x-2"
              >
                <User className="w-4 h-4" />
                <span>Edit Profile</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
