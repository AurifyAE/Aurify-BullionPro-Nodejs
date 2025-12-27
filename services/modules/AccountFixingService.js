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
                position,
                pureWeight,
                weightOz,
                metalRateId,
                bidvalue
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
            const metalValue = Number(pureWeight) * convFactGms;
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
                        metalRateValue: convFactGms,
                        metalValue:body.metalValue,

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
}

export default AccountFixingService;
