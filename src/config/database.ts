import mongoose from "mongoose";
import { env } from "./env";

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = env.MONGODB_URI || "mongodb://127.0.0.1:27017/job-portal";
    await mongoose.connect(mongoUri);

    console.log("✅ MongoDB Connected Successfully");

    // Clean up legacy indexes and empty strings that cause duplicate key errors on Vercel/MongoDB Atlas
    try {
      const collection = mongoose.connection.collection("payments");
      const indexes = await collection.indexes();
      
      const problematicIndexes = [
        "provider_1_providerPaymentId_1",
        "providerPaymentId_1",
      ];

      for (const indexName of problematicIndexes) {
        if (indexes.some((idx) => idx.name === indexName)) {
          await collection.dropIndex(indexName);
          console.log(`🗑️ Dropped legacy payment index: ${indexName}`);
        }
      }

      // Unset empty string providerPaymentId / razorpayPaymentId records
      await collection.updateMany(
        { providerPaymentId: "" },
        { $unset: { providerPaymentId: "" } }
      );
      await collection.updateMany(
        { razorpayPaymentId: "" },
        { $unset: { razorpayPaymentId: "" } }
      );
    } catch (cleanErr) {
      // Ignore if collection doesn't exist yet
    }

    // Clean up legacy application indexes (jobId_1_applicantId_1 / candidateId)
    try {
      const appCollection = mongoose.connection.collection("applications");
      const appIndexes = await appCollection.indexes();

      const badAppIndexes = [
        "jobId_1_applicantId_1",
        "jobId_1_candidateId_1",
        "candidateId_1_status_1",
        "applicantId_1_status_1",
        "applicantId_1",
        "candidateId_1",
      ];

      for (const indexName of badAppIndexes) {
        if (appIndexes.some((idx) => idx.name === indexName)) {
          await appCollection.dropIndex(indexName);
          console.log(`🗑️ Dropped legacy application index: ${indexName}`);
        }
      }
    } catch (cleanAppErr) {
      // Ignore if collection doesn't exist yet
    }
  } catch (error) {
    console.error("❌ MongoDB Connection Failed");
    console.error(error);

    process.exit(1);
  }
};
