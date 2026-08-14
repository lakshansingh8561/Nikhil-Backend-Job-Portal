import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import axios from "axios";
import { env } from "./config/env";

async function checkTokenScopes() {
  const token = env.POLAR_ACCESS_TOKEN;
  console.log("POLAR_ACCESS_TOKEN:", token);

  try {
    const res = await axios.get("https://sandbox-api.polar.sh/v1/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("User me:", res.data);
  } catch (err: any) {
    console.log("users/me status:", err.response?.status, err.response?.data?.detail || err.message);
  }

  try {
    const res = await axios.get("https://sandbox-api.polar.sh/v1/organizations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Organizations:", res.data?.items?.map((o: any) => ({ id: o.id, name: o.name })));
  } catch (err: any) {
    console.log("organizations status:", err.response?.status, err.response?.data?.detail || err.message);
  }

  process.exit(0);
}

checkTokenScopes();
