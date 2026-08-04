import { User } from "../../database/models";
import { ApiError } from "../../common/utils/ApiError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { UpdateLocationDto } from "./location.types";

export class LocationService {
  /**
   * Update authenticated user's location in MongoDB
   */
  static async updateUserLocation(
    userId: string,
    payload: UpdateLocationDto
  ) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found.");
    }

    user.location = {
      city: payload.city || "",
      state: payload.state || "",
      country: payload.country || "",
      postalCode: payload.postalCode || "",
      latitude: payload.latitude || 0,
      longitude: payload.longitude || 0,
    };

    await user.save();

    return {
      userId: user._id,
      location: user.location,
    };
  }

  /**
   * Get user's saved location
   */
  static async getUserLocation(userId: string) {
    const user = await User.findById(userId).select("location");
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found.");
    }
    return user.location || null;
  }
}
