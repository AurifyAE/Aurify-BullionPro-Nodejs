import mongoose from "mongoose";
import OpeningFixing from "../../models/modules/OpeningFixing.js";
import MetalRate from "../../models/modules/MetalRateMaster.js";
import { createAppError } from "../../utils/errorHandler.js";
import Registry from "../../models/modules/Registry.js";

class OpeningFixingService {
    static async createOpeningFixing(body, adminId) {
        console.log(body)
        console.log('---------------------------------------')
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
                position,
                pureWeight,
                weightOz,
                metalRateId,
                bidvalue,
                metalRateValue,
                metalValue
            } = body;

            // 1️⃣ Fetch metal rate (authoritative source)
            const metalRate = await MetalRate.findById(metalRateId).session(session);
            if (!metalRate) {
                throw createAppError("Invalid metal rate", 400);
            }

            const convFactGms = Number(metalRate.convFactGms || 0);
            if (!convFactGms) {
                throw createAppError("Conversion factor missing in metal rate", 400);
            }

            // 2️⃣ Business calculation (FINAL)
            let accountingImpact;

            if (position === "LONG") {
                accountingImpact = {
                    gold: "DEBIT",
                    cash: "CREDIT",
                };
            } else if (position === "SHORT") {
                accountingImpact = {
                    gold: "CREDIT",
                    cash: "DEBIT",
                };
            } else {
                throw createAppError("Invalid position type", 400);
            }

            console.log(body)

            // 3️⃣ Create document
            const fixing = await OpeningFixing.create(
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
                        metalRateValue: metalRateValue,
                        metalValue,

                        accountingImpact, // ✅ REQUIRED FIELD FIXED

                        createdBy: adminId,
                    },
                ],
                { session, ordered: true }
            );


            const isLong = position === "LONG";

            const goldDebit = isLong ? pureWeight : 0;
            const goldCredit = isLong ? 0 : pureWeight;

            const cashDebit = isLong ? 0 : body.metalValue;
            const cashCredit = isLong ? body.metalValue : 0;

            console.log(metalValue)
            console.log(body)

            // ✅ log in the exact order you want
            console.log(
                goldCredit,
                goldDebit,
                cashCredit,
                cashDebit
            );


            const registryEntry = await Registry.create(
                [
                    {
                        transactionId: fixing[0]._id,
                        transactionType: "opening",

                        assetType: "XAU",
                        currencyRate: 1,

                        costCenter: "INVENTORY",
                        type: "OPENING_FIXING_POSITION",
                        description: "OPENING FIXING POSITION",

                        party: null,
                        isBullion: true,

                        // 💰 CASH LEDGER
                        cashDebit,
                        cashCredit,

                        // 🪙 GOLD LEDGER
                        goldDebit,
                        goldCredit,

                        // VALUE SNAPSHOT
                        value: metalValue,
                        goldBidValue: null,

                        debit: cashDebit,
                        credit: cashCredit,

                        reference: voucherNumber,
                        hedgeReference: null,

                        status: "completed",
                        isActive: true,
                        isDraft: false,

                        createdBy: adminId,
                        transactionDate: voucherDate,
                    },
                ],
                { session, ordered: true }
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

    static async fetchAllOpeningFixings() {
        const fixings = await OpeningFixing.find()
            .populate("division", "code description")
            .populate("salesman", "name")
            .populate("metalRate", "rateType convFactGms")
            .populate("createdBy", "name email")
            .sort({ voucherDate: -1, createdAt: -1 })
            .lean();

        return fixings;
    }

    static async fetchOpeningFixingById(id) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return null;
        }

        const fixing = await OpeningFixing.findById(id)
            .populate("division", "name code")
            .populate("salesman", "name")
            .populate("metalRate", "rateType convFactGms")
            .populate("createdBy", "name email")
            .lean();

        return fixing;
    }

    static async updateOpeningFixing(id, body, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw createAppError("Invalid opening fixing ID", 400);
            }

            const existing = await OpeningFixing.findById(id).session(session);
            if (!existing) {
                throw createAppError("Opening fixing not found", 404);
            }

            const {
                voucherDate,
                divisionId,
                salesmanId,
                position,
                pureWeight,
                weightOz,
                metalRateId,
              
                bidvalue,
                metalRateValue,
                metalValue
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

            // 2️⃣ Recalculate values (SOURCE OF TRUTH)

            let accountingImpact;
            if (position === "LONG") {
                accountingImpact = { gold: "DEBIT", cash: "CREDIT" };
            } else if (position === "SHORT") {
                accountingImpact = { gold: "CREDIT", cash: "DEBIT" };
            } else {
                throw createAppError("Invalid position type", 400);
            }

            // 3️⃣ Reverse old registry
            await Registry.deleteMany({ reference: existing.voucherNumber }).session(session);

            // 4️⃣ Update fixing
            const updatedFixing = await OpeningFixing.findByIdAndUpdate(
                id,
                {
                    voucherDate,
                    division: divisionId,
                    salesman: salesmanId,
                    position,
                    pureWeight,
                    weightOz,
                    metalRate: metalRateId,
                    metalRateValue,
                    metalRateValue,
                    metalValue,
                    bidvalue,
                    accountingImpact,
                    updatedBy: adminId,
                },
                { new: true, session }
            );

            // 5️⃣ Recreate registry entry
            const isLong = position === "LONG";

            const goldDebit = isLong ? pureWeight : 0;
            const goldCredit = isLong ? 0 : pureWeight;

            const cashDebit = isLong ? 0 : metalValue;
            const cashCredit = isLong ? metalValue : 0;

            await Registry.create(
                [
                    {
                        transactionId: updatedFixing._id,
                        transactionType: "opening",

                        assetType: "XAU",
                        currencyRate: 1,

                        costCenter: "INVENTORY",
                        type: "OPENING_FIXING_POSITION",
                        description: "OPENING FIXING POSITION",

                        party: null,
                        isBullion: true,

                        cashDebit,
                        cashCredit,

                        goldDebit,
                        goldCredit,

                        value: metalValue,
                        goldBidValue: null,

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
                { session, ordered: true }
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

    static async deleteOpeningFixing(id) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw createAppError("Invalid opening fixing ID", 400);
            }

            const fixing = await OpeningFixing.findById(id).session(session);
            if (!fixing) {
                throw createAppError("Opening fixing not found", 404);
            }

            // 1️⃣ Delete registry entries (ledger)
            await Registry.deleteMany(
                {
                    reference: fixing.voucherNumber,
                },
                { session }
            );

            // 2️⃣ Delete fixing document
            await OpeningFixing.deleteOne(
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

export default OpeningFixingService;
