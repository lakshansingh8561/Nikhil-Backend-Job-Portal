import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { CompanyMember, Company } from "./database/models";

async function cleanBadMemberships() {
  await connectDatabase();

  console.log("Cleaning corrupted CompanyMember records...");
  const members = await CompanyMember.find();
  let deletedCount = 0;

  for (const m of members) {
    const comp = await Company.findById(m.companyId);
    if (!comp) {
      await CompanyMember.deleteOne({ _id: m._id });
      deletedCount++;
      continue;
    }

    const ownerIdStr = comp.ownerId?.toString() || comp.userId?.toString();
    const userIdStr = m.userId?.toString();

    // If role is OWNER but the user is not the actual owner/creator of the company, delete this bad membership
    if (m.role === "OWNER" && ownerIdStr && userIdStr && ownerIdStr !== userIdStr) {
      console.log(`Deleting bad membership: User ${userIdStr} was incorrectly linked as OWNER to Company "${comp.name || (comp as any).companyName}" (Owner: ${ownerIdStr})`);
      await CompanyMember.deleteOne({ _id: m._id });
      deletedCount++;
    }
  }

  console.log(`✅ Cleaned ${deletedCount} corrupted CompanyMember records.`);
  process.exit(0);
}

cleanBadMemberships().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
