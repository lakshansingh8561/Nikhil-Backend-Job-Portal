import app from "../src/app";
import { connectDatabase } from "../src/config/database";

let isConnected = false;

export default async function handler(req: any, res: any) {
    try {
        if (!isConnected) {
            await connectDatabase();
            isConnected = true;
            console.log("✅ MongoDB Connected");
        }

        return app(req, res);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Database connection failed",
        });
    }
}