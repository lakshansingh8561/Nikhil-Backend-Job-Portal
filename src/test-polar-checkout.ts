import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { Membership, User } from "./database/models";
import { PolarService } from "./features/payments/polar.service";
import { Role } from "./common/enums";

async function testPolarCheckout() {
  await connectDatabase();

  const user = await User.findOne({ role: Role.RECRUITER }) || await User.findOne({ role: Role.JOB_SEEKER });
  if (!user) {
    console.log("No test user found.");
    process.exit(0);
  }

  const membership = await Membership.findOne({ role: user.role, price: { $gt: 0 } });
  if (!membership) {
    console.log("No paid membership plan found.");
    process.exit(0);
  }

  console.log(`Testing Polar Checkout for User: ${user.email} (${user.role}), Plan: "${membership.name}" (ID: ${membership._id})`);

  try {
    const res = await PolarService.createCheckoutSession(user._id.toString(), user.role as Role, {
      membershipId: membership._id.toString(),
    });
    console.log("✅ Polar Checkout Created Successfully:", res);
  } catch (err: any) {
    console.log("Polar Checkout Exception (API response):", err?.message || err);
  }

  process.exit(0);
}

testPolarCheckout().catch(console.error);
