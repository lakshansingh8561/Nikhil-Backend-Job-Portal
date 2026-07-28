  import { z } from "zod";
  import { Role } from "../../common/enums/role.enum";

  export const registerSchema = z.object({
    email: z
      .email("Invalid email address")
      .trim()
      .toLowerCase(),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(32, "Password cannot exceed 32 characters")
      .regex(/[A-Z]/, "Password must contain one uppercase letter")
      .regex(/[a-z]/, "Password must contain one lowercase letter")
      .regex(/[0-9]/, "Password must contain one number")
      .regex(
        /[!@#$%^&*(),.?":{}|<>]/,
        "Password must contain one special character"
      ),

    role: z.enum(Role),
  });

  export const loginSchema = z.object({
    email: z.email().trim().toLowerCase(),

    password: z.string().min(1, "Password is required"),
  });
  export const refreshToken = z.object({
    refreshToken: z
      .string()
      .min(1, "Refresh token is required."),
  });


  export const AuthValidation = {
    register: registerSchema,
    login: loginSchema,
    refresh:refreshToken 
  };
