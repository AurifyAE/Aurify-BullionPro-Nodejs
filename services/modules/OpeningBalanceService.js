import mongoose from "mongoose";
import OpeningBalance from "../../models/modules/OpeningBalance.js";
import Registry from "../../models/modules/Registry.js";
import { updatePartyOpeningBalance } from "../../utils/updatePartyOpeningBalance.js.js";

class openingBalanceService {
    static async createPartyOpeningBalance({
        partyId,
        value,
        transactionType,   // "debit" | "credit"
        adminId,
        assetType,         // "GOLD" | "CASH"
        assetCode,         // "XAU" | "USD" | "AED"
        voucher,
        voucherDate,
        description,
    }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1️⃣ Create Opening Balance Record
            const opening = new OpeningBalance({
                partyId,
                value,
                transactionType,
                adminId,
                assetType,
                assetCode,
                voucherDate,
                voucherType: voucher.voucherType,
                voucherCode: voucher.voucherCode,
                description,
            });

            await opening.save({ session });

            // 2️⃣ Signed value for balance update
            const signedValue =
                transactionType === "debit"
                    ? -Math.abs(value)
                    : Math.abs(value);

            await updatePartyOpeningBalance({
                partyId,
                assetType,
                assetCode,
                value: signedValue,
                session,
            });

            if(!description){
                description = `Opening balance ${transactionType} of ${value} ${assetCode} for party ${partyId}`;
            }

            // 3️⃣ Create REGISTRY ENTRY (LEDGER)
            const isGold = assetType === "GOLD";
            const isCash = assetType === "CASH";

            const registry = new Registry({
                transactionId: `TXN${Date.now()}`,
                transactionType: "Opening",
                assetType: assetCode,
                costCenter: "PARTY",
                type: isGold ? "GOLD" : "PARTY_CASH_BALANCE",
                description,

                party: partyId,
                isBullion: isGold,
                value: value ,

                // 💰 CASH
                cashDebit: isCash && transactionType === "debit" ? value : 0,
                cashCredit: isCash && transactionType === "credit" ? value : 0,

                // 🪙 GOLD
                goldDebit: isGold && transactionType === "debit" ? value : 0,
                goldCredit: isGold && transactionType === "credit" ? value : 0,

                debit:
                    transactionType === "debit"
                        ? value
                        : 0,

                credit:
                    transactionType === "credit"
                        ? value
                        : 0,

                currencyRate: 1,
                reference: voucher.voucherCode,
                transactionDate: voucherDate,
                status: "completed",
                isActive: true,
                createdBy: adminId,
            });

            await registry.save({ session });

            await session.commitTransaction();
            session.endSession();

            return opening;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    /**
     * Retrieve all opening balances for all parties
     * @returns {Promise<Array>}
     */
    static async getAllPartyOpeningBalances() {
        // Fetch all opening balances
        // Populate partyId with customerName and accountCode
        const records = await OpeningBalance.find()
            .populate("partyId", "customerName accountCode")
            .populate("adminId", "name")
            .sort({ voucherDate: -1 })
            .lean();
        return records;
    }

    static async updatePartyOpeningBalance({
        voucherId,
        value,
        transactionType,
        assetType,
        assetCode,
        voucherDate,
        description,
    }) {
        // Fetch existing opening
        const existing = await OpeningBalance.find({ voucherCode: voucherId });
        console.log(existing)
        if (!existing) {
            throw createAppError("Opening balance not found", 404);
        }
    }
}

export default openingBalanceService;
