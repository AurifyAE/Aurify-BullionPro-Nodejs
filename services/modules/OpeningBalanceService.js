import mongoose from "mongoose";
import OpeningBalance from "../../models/modules/OpeningBalance.js";
import Registry from "../../models/modules/Registry.js";
import { updatePartyOpeningBalance } from "../../utils/updatePartyOpeningBalance.js";

class openingBalanceService {
    static async createPartyOpeningBalance({
        partyId,
        value,
        transactionType,
        adminId,
        assetType,
        assetCode,
        voucher,
        voucherDate,
        description,
    }) {
        // 🔒 Hard validation (before DB)
        if (!partyId || !value || !transactionType || !assetType || !assetCode) {
            throw new Error("Missing required fields for opening balance");
        }

        if (!["debit", "credit"].includes(transactionType)) {
            throw new Error("Invalid transaction type");
        }

        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const finalDescription =
                description ||
                `Opening balance ${transactionType} of ${value} ${assetCode}`;

            // 1️⃣ Opening Balance
            const opening = await OpeningBalance.create([{
                partyId,
                value,
                transactionType,
                adminId,
                assetType,
                assetCode,
                voucherDate,
                voucherType: voucher.voucherType,
                voucherCode: voucher.voucherCode,
                description: finalDescription,
            }], { session });

            // 2️⃣ Party balance update
            const signedValue =
                transactionType === "debit"
                    ? -Math.abs(value)
                    : Math.abs(value);

            await updatePartyOpeningBalance({
                partyId,
                assetType,
                assetCode,
                value: signedValue,
                reverse: false,
            });

            // 3️⃣ Registry entry
            const isGold = assetType === "GOLD";
            const isCash = assetType === "CASH";
            const transactionId = await Registry.generateTransactionId();

            await Registry.create([{
                transactionId: transactionId,
                transactionType: "Opening",
                assetType: assetCode,
                costCenter: "PARTY",
                type: isGold ? "PARTY_GOLD_BALANCE" : "PARTY_CASH_BALANCE",
                description: finalDescription,
                party: partyId,
                isBullion: isGold,
                value,

                cashDebit: isCash && transactionType === "debit" ? value : 0,
                cashCredit: isCash && transactionType === "credit" ? value : 0,
                goldDebit: isGold && transactionType === "debit" ? value : 0,
                goldCredit: isGold && transactionType === "credit" ? value : 0,

                debit: transactionType === "debit" ? value : 0,
                credit: transactionType === "credit" ? value : 0,

                currencyRate: 1,
                reference: voucher.voucherCode,
                transactionDate: voucherDate,
                status: "completed",
                isActive: true,
                createdBy: adminId,
            }], { session });

            await session.commitTransaction();
            return opening[0];

        } catch (err) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            throw err;

        } finally {
            session.endSession();
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

    // static async updatePartyOpeningBalance({
    //     voucherId,
    //     value,
    //     transactionType,
    //     assetType,
    //     assetCode,
    //     voucherDate,
    //     description,
    // }) {
    //     // Fetch existing opening
    //     const existing = await OpeningBalance.find({ voucherCode: voucherId });
    //     console.log(existing)
    //     if (!existing) {
    //         throw createAppError("Opening balance not found", 404);
    //     }
    // }

    static async updateOpeningBalanceVoucher({
        voucher,
        voucherDate,
        entries,
        adminId,
        VoucherID,
    }) {
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            console.log("Updating opening balance for voucher:", VoucherID);

            // 1️⃣ Fetch existing
            const existing = await OpeningBalance
                .find({ voucherCode: VoucherID })
                .session(session);

            if (!existing.length) {
                throw new Error("Opening balance voucher not found");
            }

            // 2️⃣ Reverse old balances
            for (const ob of existing) {
                const signed =
                    ob.transactionType === "debit"
                        ? -Math.abs(ob.value)
                        : Math.abs(ob.value);

                await updatePartyOpeningBalance({
                    partyId: ob.partyId,
                    assetType: ob.assetType,
                    assetCode: ob.assetCode,
                    value: signed,
                    reverse: true,
                    session
                });
            }

            // 3️⃣ Delete old records
            await OpeningBalance.deleteMany({ voucherCode: VoucherID }).session(session);
            await Registry.deleteMany({ reference: VoucherID }).session(session);
            console.log(voucher.type)
            const transactionId = await Registry.generateTransactionId();

            // 4️⃣ Insert new
            for (const entry of entries) {
                const signed =
                    entry.transactionType === "debit"
                        ? -Math.abs(entry.amount)
                        : Math.abs(entry.amount);

                await OpeningBalance.create([{
                    partyId: entry.partyId,
                    value: entry.amount,
                    transactionType: entry.transactionType,
                    assetType: entry.balanceType === "gold" ? "GOLD" : "CASH",
                    assetCode: entry.balanceType === "gold" ? "XAU" : entry.currencyCode,
                    voucherCode: VoucherID,
                    voucherType: voucher.type,
                    voucherDate,
                    description: entry.description,
                    adminId
                }], { session });

                await updatePartyOpeningBalance({
                    partyId: entry.partyId,
                    assetType: entry.balanceType === "gold" ? "GOLD" : "CASH",
                    assetCode: entry.balanceType === "gold" ? "XAU" : entry.currencyCode,
                    value: signed,
                    reverse: false,
                    session
                });

                await Registry.create([{
                    transactionId: transactionId,
                    transactionType: "Opening",
                    reference: VoucherID,
                    transactionDate: voucherDate,

                    costCenter: "PARTY",
                    party: entry.partyId,

                    assetType: entry.balanceType === "gold" ? "XAU" : entry.currencyCode,
                    type: entry.balanceType === "gold"
                        ? "PARTY_GOLD_BALANCE"
                        : "PARTY_CASH_BALANCE",

                    description: entry.description || "Updated opening balance",

                    value: entry.amount,

                    cashDebit:
                        entry.balanceType === "cash" && entry.transactionType === "debit"
                            ? entry.amount
                            : 0,

                    cashCredit:
                        entry.balanceType === "cash" && entry.transactionType === "credit"
                            ? entry.amount
                            : 0,

                    goldDebit:
                        entry.balanceType === "gold" && entry.transactionType === "debit"
                            ? entry.amount
                            : 0,

                    goldCredit:
                        entry.balanceType === "gold" && entry.transactionType === "credit"
                            ? entry.amount
                            : 0,

                    debit: entry.transactionType === "debit" ? entry.amount : 0,
                    credit: entry.transactionType === "credit" ? entry.amount : 0,

                    isBullion: entry.balanceType === "gold",

                    status: "completed",
                    isActive: true,
                    createdBy: adminId,
                }], { session });

            }

            await session.commitTransaction();
            return true;

        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    }

}

export default openingBalanceService;
