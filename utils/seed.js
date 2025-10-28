import mongoose from "mongoose";
import dotenv from "dotenv";
import Registry from "../models/modules/Registry.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI

async function seedOpeningTransaction() {
    try {
        await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("🔗 Connected to MongoDB");

        const existing = await Registry.findOne({ type: "PURITY_DIFFERENCE" });
        if (existing) {
            console.log("⚠️ Opening balance already exists, skipping seed.");
            return;
        }

        const opening = new Registry({
            type: "OPENING",
            transactionId: "TXN-OPEN-0001",          // required
            description: "Opening balance seed entry",
            isBullion: false,
            cashDebit: 0,
            cashCredit: 0,
            goldDebit: 0,
            goldCredit: 0,
            value: 1000,
            goldBidValue: 0,
            debit: 0,
            credit: 0,
            grossWeight: 899,
            runningBalance: 0,
            previousBalance: 0,
            transactionDate: new Date(),
            reference: "OPEN0001",
            status: "completed",
            isActive: true,
            createdBy: new mongoose.Types.ObjectId("68d9a4d1c1b9f9ddc1cb4e20"), // your user/admin 
            // date make as 2025 25 october  for testing future date reports    
            createdAt: new Date("2025-10-23T00:00:00Z"),
        });


        await opening.save();
        console.log("✅ Opening balance seeded successfully.");
    } catch (err) {
        console.error("❌ Error seeding opening balance:", err);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 MongoDB disconnected");
    }
}

seedOpeningTransaction();
