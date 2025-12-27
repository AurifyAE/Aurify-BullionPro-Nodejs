import mongoose from "mongoose";
import AccountFixing from "../../models/modules/accountFixing.js";
import MetalRate from "../../models/modules/MetalRateMaster.js";
import { createAppError } from "../../utils/errorHandler.js";
import Registry from "../../models/modules/Registry.js";

class AccountFixingService {
    static async createAccountFixing(body, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const {
                voucherNumber,
                voucherType,
                prefix,
                voucherDate,
                divisionId,
                salesmanId,
                position, // PURCHASE | SALE
                pureWeight,
                weightOz,
                metalRateId,
                bidvalue,
                metalRateValue,
                metalValue
            } = body;

            console.log(body)

            // 1️⃣ Fetch metal rate (authoritative)
            const metalRate = await MetalRate.findById(metalRateId).session(session);
            if (!metalRate) {
                throw createAppError("Invalid metal rate", 400);
            }

            const convFactGms = Number(metalRate.convFactGms || 0);
            if (!convFactGms) {
                throw createAppError("Conversion factor missing in metal rate", 400);
            }

            // 2️⃣ Calculate value (BACKEND AUTHORITY)
     
            console.log(position)

            let accountingImpact;
            if (position === "PURCHASE") {
                accountingImpact = { gold: "DEBIT", cash: "CREDIT" };
            } else if (position === "SALE") {
                accountingImpact = { gold: "CREDIT", cash: "DEBIT" };
            } else {
                throw createAppError("Invalid position type", 400);
            }

            // 3️⃣ Create fixing
            const fixing = await AccountFixing.create(
                [
                    {
                        voucherNumber,
                        voucherType,
                        prefix,
                        voucherDate,

                        division: divisionId,
                        salesman: salesmanId,

                        bidvalue,

                        position,
                        pureWeight,
                        weightOz,

                        metalRate: metalRateId,
                        metalRateValue: convFactGms,
                        metalValue,

                        accountingImpact,
                        createdBy: adminId,
                    },
                ],
                { session }
            );

            // 4️⃣ Ledger logic
            const isPurchase = position === "PURCHASE";

            const goldDebit = isPurchase ? pureWeight : 0;
            const goldCredit = isPurchase ? 0 : pureWeight;

            const cashDebit = isPurchase ? 0 : metalValue;
            const cashCredit = isPurchase ? metalValue : 0;

            // 5️⃣ Registry entry
            await Registry.create(
                [
                    {
                        transactionId: await Registry.generateTransactionId(),
                        transactionType: isPurchase ? "opening-purchaseFix" : "opening-saleFix",

                        assetType: "XAU",
                        currencyRate: 1,

                        costCenter: "INVENTORY",
                        type: "OPEN-ACCOUNT-FIXING",
                        description: "ACCOUNT FIXING ENTRY",

                        party: null,
                        isBullion: true,

                        cashDebit,
                        cashCredit,

                        goldDebit,
                        goldCredit,

                        value: metalValue,

                        debit: cashDebit,
                        credit: cashCredit,

                        reference: voucherNumber,

                        status: "completed",
                        isActive: true,
                        isDraft: false,

                        createdBy: adminId,
                        transactionDate: voucherDate,
                    },
                ],
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            return fixing[0];
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }


    static async fetchAllAccountFixings() {
        const fixings = await AccountFixing.find()
            .populate("division", "code description")
            .populate("salesman", "name")
            .populate("metalRate", "rateType convFactGms")
            .populate("createdBy", "name email")
            .sort({ voucherDate: -1, createdAt: -1 })
            .lean();

        return fixings;
    }

    static async fetchAccountFixingById(id) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return null;
        }

        const fixing = await AccountFixing.findById(id)
            .populate("division", "name code")
            .populate("salesman", "name")
            .populate("metalRate", "rateType convFactGms")
            .populate("createdBy", "name email")
            .lean();

        return fixing;
    }

    static async updateAccountFixing(id, body, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw createAppError("Invalid account fixing ID", 400);
            }

            const existing = await AccountFixing.findById(id).session(session);
            if (!existing) {
                throw createAppError("Account fixing not found", 404);
            }

            const {
                voucherDate,
                divisionId,
                salesmanId,
                position,        // PURCHASE | SALE
                pureWeight,
                weightOz,
                metalRateId,
                bidvalue,
            } = body;

            // 1️⃣ Fetch authoritative metal rate
            const metalRate = await MetalRate.findById(metalRateId).session(session);
            if (!metalRate) {
                throw createAppError("Invalid metal rate", 400);
            }

            const convFactGms = Number(metalRate.convFactGms || 0);
            if (!convFactGms) {
                throw createAppError("Conversion factor missing in metal rate", 400);
            }

            // 2️⃣ Recalculate value (BACKEND AUTHORITY)
            const metalValue = Number(pureWeight) * convFactGms;

            let accountingImpact;
            if (position === "PURCHASE") {
                accountingImpact = { gold: "DEBIT", cash: "CREDIT" };
            } else if (position === "SALE") {
                accountingImpact = { gold: "CREDIT", cash: "DEBIT" };
            } else {
                throw createAppError("Invalid position type", 400);
            }

            // 3️⃣ Reverse old registry entries
            await Registry.deleteMany(
                { reference: existing.voucherNumber },
                { session }
            );

            // 4️⃣ Update fixing
            const updatedFixing = await AccountFixing.findByIdAndUpdate(
                id,
                {
                    voucherDate,
                    division: divisionId,
                    salesman: salesmanId,
                    position,
                    pureWeight,
                    weightOz,
                    metalRate: metalRateId,
                    metalRateValue: convFactGms,
                    metalValue,
                    bidvalue,
                    accountingImpact,
                    updatedBy: adminId,
                },
                { new: true, session }
            );

            // 5️⃣ Recreate registry entry
            const isPurchase = position === "PURCHASE";

            const goldDebit = isPurchase ? pureWeight : 0;
            const goldCredit = isPurchase ? 0 : pureWeight;

            const cashDebit = isPurchase ? 0 : metalValue;
            const cashCredit = isPurchase ? metalValue : 0;

            await Registry.create(
                [
                    {
                        transactionId: updatedFixing._id,
                        transactionType: "account-fixing",

                        assetType: "XAU",
                        currencyRate: 1,

                        costCenter: "INVENTORY",
                        type: "ACCOUNT_FIXING",
                        description: "ACCOUNT FIXING ENTRY",

                        party: null,
                        isBullion: true,

                        cashDebit,
                        cashCredit,
                        goldDebit,
                        goldCredit,

                        value: metalValue,

                        debit: cashDebit,
                        credit: cashCredit,

                        reference: updatedFixing.voucherNumber,

                        status: "completed",
                        isActive: true,
                        isDraft: false,

                        createdBy: adminId,
                        transactionDate: voucherDate,
                    },
                ],
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            return updatedFixing;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    static async deleteAccountFixing(id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw createAppError("Invalid account fixing ID", 400);
            }

            const fixing = await AccountFixing.findById(id).session(session);
            if (!fixing) {
                throw createAppError("Account fixing not found", 404);
            }

            // 1️⃣ Delete registry entries
            await Registry.deleteMany(
                { reference: fixing.voucherNumber },
                { session }
            );

            // 2️⃣ Delete fixing
            await AccountFixing.deleteOne(
                { _id: id },
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            return true;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

}

export default AccountFixingService;
