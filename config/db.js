import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
const MONGO_URI = process.env.MONGO_URI; // Ensure full URI is stored in .env

const mongodb = async () => {
  if (!MONGO_URI) {
    console.error("❌ MongoDB URI is missing in environment variables!");
    process.exit(1);
  }

  try {
    console.log("🔗 Connecting to MongoDB...",MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connection successful!");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

export { mongodb };