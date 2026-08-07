import { User, UserProfile } from "../../database/models";
import { UpdateLocationDto } from "./location.types";

export class LocationService {
  /**
   * Update authenticated user's location in UserProfile model
   */
  static async updateUserLocation(
    userId: string,
    payload: UpdateLocationDto
  ) {
    const locationData = {
      city: payload?.city || "",
      state: payload?.state || "",
      country: payload?.country || "",
      postalCode: payload?.postalCode || "",
      latitude: payload?.latitude || 0,
      longitude: payload?.longitude || 0,
    };

    try {
      const user = await User.findById(userId);
      let profile = await UserProfile.findOne({ userId });

      if (!profile && user) {
        profile = new UserProfile({
          userId,
          firstName: user.email ? user.email.split("@")[0] : "User",
          lastName: "",
        });
      }

      if (profile) {
        profile.location = locationData;
        await profile.save().catch(() => null);
      }
    } catch (err: any) {
      console.warn("Location save warning:", err?.message || err);
    }

    return {
      userId,
      location: locationData,
    };
  }

  /**
   * Get user's saved location from UserProfile
   */
  static async getUserLocation(userId: string) {
    try {
      const profile = await UserProfile.findOne({ userId }).select("location");
      return profile?.location || { city: "", state: "", country: "", postalCode: "", latitude: 0, longitude: 0 };
    } catch (err: any) {
      return { city: "", state: "", country: "", postalCode: "", latitude: 0, longitude: 0 };
    }
  }
}
