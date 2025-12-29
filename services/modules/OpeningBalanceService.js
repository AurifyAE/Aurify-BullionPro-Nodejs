import mongoose from "mongoose";
import OpeningBalance from "../../models/modules/OpeningBalance.js";
import Registry from "../../models/modules/Registry.js";
import { updatePartyOpeningBalance } from "../../utils/updatePartyOpeningBalance.js";
import { createAppError } from "../../utils/errorHandler.js";

class openingBalanceService {
    static async createOpeningBalanceBatch({
        voucherCode,
        voucherType,
        voucherDate,
        description,
        entries,
        adminId,
    }) {
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            // 1️⃣ Create Opening Balance Voucher (ONE DOCUMENT)
            const [openingBalance] = await OpeningBalance.create(
                [{
                    voucherCode,
                    voucherType,
                    voucherDate,
                    description,
                    adminId,
                    entries,
                }],
                { session }
            );

            // 2️⃣ Process each entry
            for (const entry of entries) {
                const {
                    partyId,
                    assetType,
                    assetCode,
                    transactionType,
                    value,
                } = entry;

                if (!partyId || !assetType || !assetCode || !transactionType || !value) {
                    throw new Error("Invalid entry in opening balance batch");
                }

                const signedValue =
                    transactionType === "debit"
                        ? -Math.abs(value)
                        : Math.abs(value);

                // 🔁 Update party opening balance
                await updatePartyOpeningBalance({
                    partyId,
                    assetType,
                    assetCode,
                    value: signedValue,
                    reverse: false,
                    session,
                });

                // 🧾 Registry entry
                const isGold = assetType === "GOLD";
                const isCash = assetType === "CASH";
                const transactionId = await Registry.generateTransactionId();

                await Registry.create(
                    [{
                        transactionId,
                        transactionType: "Opening",
                        assetType: assetCode,
                        costCenter: "PARTY",
                        type: isGold ? "PARTY_GOLD_BALANCE" : "PARTY_CASH_BALANCE",
                        description:
                            description ||
                            `Opening balance ${transactionType} of ${value} ${assetCode}`,
                        party: partyId,
                        isBullion: isGold,

                        cashDebit: isCash && transactionType === "debit" ? value : 0,
                        cashCredit: isCash && transactionType === "credit" ? value : 0,
                        goldDebit: isGold && transactionType === "debit" ? value : 0,
                        goldCredit: isGold && transactionType === "credit" ? value : 0,

                        debit: transactionType === "debit" ? value : 0,
                        credit: transactionType === "credit" ? value : 0,
                        value: value,

                        currencyRate: 1,
                        reference: voucherCode,
                        transactionDate: voucherDate,
                        status: "completed",
                        isActive: true,
                        createdBy: adminId,
                    }],
                    { session }
                );
            }

            await session.commitTransaction();
            return openingBalance;

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
            .populate({
                path: "entries.partyId",
                select: "customerName accountCode",
            })
            .populate({
                path: "adminId",
                select: "name",
            })
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
        voucherCode,
        voucherType,
        voucherDate,
        description,
        entries,
        adminId,
    }) {
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            console.log("Updating opening balance for voucher:", voucherCode);

            /* 1️⃣ Fetch existing voucher */
            const existing = await OpeningBalance
                .findOne({ voucherCode })
                .session(session);

            console.log("Existing voucher:", existing);

            if (!existing) {
                throw createAppError("Opening balance voucher not found", 404);
            }

            /* 2️⃣ Reverse OLD balances */
            for (const oldEntry of existing.entries) {
                const signed =
                    oldEntry.transactionType === "debit"
                        ? -Math.abs(oldEntry.value)
                        : Math.abs(oldEntry.value);

                await updatePartyOpeningBalance({
                    partyId: oldEntry.partyId,
                    assetType: oldEntry.assetType,
                    assetCode: oldEntry.assetCode,
                    value: signed,
                    reverse: true,
                    session,
                });
            }

            /* 3️⃣ Remove OLD registry */
            await Registry.deleteMany({ reference: voucherCode }).session(session);

            /* 4️⃣ Apply NEW balances + registry */
            for (const entry of entries) {
                const signed =
                    entry.transactionType === "debit"
                        ? -Math.abs(entry.value)
                        : Math.abs(entry.value);

                await updatePartyOpeningBalance({
                    partyId: entry.partyId,
                    assetType: entry.assetType,
                    assetCode: entry.assetCode,
                    value: signed,
                    reverse: false,
                    session,
                });

                const isGold = entry.assetType === "GOLD";
                const isCash = entry.assetType === "CASH";
                const transactionId = await Registry.generateTransactionId();

                await Registry.create([{
                    transactionId,
                    transactionType: "Opening",
                    reference: voucherCode,
                    transactionDate: voucherDate,

                    costCenter: "PARTY",
                    party: entry.partyId,

                    assetType: entry.assetCode,
                    type: isGold
                        ? "PARTY_GOLD_BALANCE"
                        : "PARTY_CASH_BALANCE",

                    description: description || "Updated opening balance",

                    value: entry.value,

                    cashDebit: isCash && entry.transactionType === "debit" ? entry.value : 0,
                    cashCredit: isCash && entry.transactionType === "credit" ? entry.value : 0,
                    goldDebit: isGold && entry.transactionType === "debit" ? entry.value : 0,
                    goldCredit: isGold && entry.transactionType === "credit" ? entry.value : 0,

                    debit: entry.transactionType === "debit" ? entry.value : 0,
                    credit: entry.transactionType === "credit" ? entry.value : 0,

                    isBullion: isGold,
                    status: "completed",
                    isActive: true,
                    createdBy: adminId,
                }], { session });
            }

            /* 5️⃣ Update voucher document */
            existing.entries = entries;
            existing.voucherDate = voucherDate;
            existing.voucherType = voucherType;
            existing.description = description;
            existing.adminId = adminId;

            await existing.save({ session });

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
