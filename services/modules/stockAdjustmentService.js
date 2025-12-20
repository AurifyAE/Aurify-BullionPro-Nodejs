import mongoose from "mongoose";
import StockAdjustment from "../../models/modules/StockAdjustment.js"; // adjust path
// import Division from "../../models/modules/Division.js";
import { createAppError } from "../../utils/errorHandler.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import Registry from "../../models/modules/Registry.js";
import MetalStock from "../../models/modules/MetalStock.js";

export class StockAdjustmentService {
    static async addStockAdjustment(data, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Validation
            if (!data.fromData || !data.toStock) {
                throw createAppError("From / To stock data missing", 400);
            }
            console.log(data)

            // 2. Create Stock Adjustment (snapshot)
            const stockAdjustmentDoc = {
                from: {
                    stockId: data.fromData.stockId,
                    grossWeight: data.fromData.grossWeight,
                    purity: data.fromData.purity,
                    pureWeight: data.fromData.pureWeight,
                    avgMakingRate: data.fromData.avgRate ?? 0,
                    avgMakingAmount: data.fromData.avgAmount ?? 0,
                },

                to: {
                    stockId: data.toStock.stockId,
                    grossWeight: data.toStock.grossWeight,
                    purity: data.toStock.purity,
                    pureWeight: data.toStock.pureWeight,
                    avgMakingRate: data.toStock.avgRate ?? 0,
                    avgMakingAmount: data.toStock.avgAmount ?? 0,
                },

                status: "Completed",
                voucherNumber: data.voucherCode,
                voucherType: data.voucherType || "STOCK-ADJ",
                division: data.division,
                enteredBy: data.enteredBy || adminId,
            };

            const adjustment = await StockAdjustment.create(
                [stockAdjustmentDoc],
                { session }
            );

            const voucherNumber = adjustment[0].voucherNumber;
            const voucherDate = new Date();

            // 3. Inventory Log — FROM (REMOVE)
            await InventoryLog.create(
                [{
                    stockCode: data.fromData.stockId,
                    code: data.fromData.stockCode,
                    voucherCode: data.voucherCode,
                    voucherDate,
                    voucherType: data.voucherType || "STOCK-ADJ",
                    grossWeight: data.fromData.grossWeight,
                    purity: data.fromData.purity,
                    pcs: 0,
                    action: "remove",
                    transactionType: "adjustment",
                    avgMakingAmount: data.fromData.avgAmount ?? 0,
                    avgMakingRate: data.fromData.avgRate ?? 0,
                    createdBy: adminId,
                    note: "Stock reduced due to stock adjustment",
                }],
                { session }
            );

            // 4. Inventory Log — TO (ADD)
            await InventoryLog.create(
                [{
                    stockCode: data.toStock.stockId,
                    code: data.toStock.stockCode,
                    voucherCode: data.voucherCode,
                    voucherDate,
                    voucherType: data.voucherType || "STOCK-ADJ",
                    grossWeight: data.toStock.grossWeight,
                    purity: data.toStock.purity,
                    pcs: 0,
                    action: "add",
                    transactionType: "adjustment",
                    avgMakingAmount: data.toStock.avgAmount ?? 0,
                    avgMakingRate: data.toStock.avgRate ?? 0,
                    createdBy: adminId,
                    note: "Stock increased due to stock adjustment",
                }],
                { session }
            );

            console.log("Adjustment created:", adjustment[0]._id);

            // 5. registry entry - stock adjustment credit gold - means deducting gold from inventory  
            await this.createRegistryEntry({
                transactionType: "adjustment",
                assetType: "XAU",
                transactionId: adjustment[0]._id,
                metalId: data.fromData.stockId,
                reference: data.voucherCode,
                type: "GOLD_STOCK",
                goldBidValue: 0,
                description: "Stock Adjustment credit",
                value: data.fromData.pureWeight ?? 0,
                grossWeight: data.fromData.grossWeight ?? 0,
                pureWeight: data.fromData.pureWeight ?? 0,
                purity: data.fromData.purity ?? 0,
                debit: 0,
                credit: data.fromData.pureWeight ?? 0,
                goldDebit: 0,
                goldCredit: data.fromData.pureWeight ?? 0,
                costCenter: "INVENTORY",
                createdBy: adminId,
            })

            // 5. registry entry - stock adjustment debit gold 
            await this.createRegistryEntry({
                transactionType: "adjustment",
                assetType: "XAU",
                transactionId: adjustment[0]._id,
                metalId: data.toStock.stockId,
                reference: data.voucherCode,
                type: "GOLD_STOCK",
                goldBidValue: 0,
                description: "Stock Adjustment Debit",
                value: data.toStock.pureWeight ?? 0,
                grossWeight: data.toStock.grossWeight ?? 0,
                pureWeight: data.toStock.pureWeight ?? 0,
                purity: data.toStock.purity ?? 0,
                debit:  data.toStock.pureWeight ?? 0,
                credit: 0,
                goldDebit: data.toStock.pureWeight ?? 0,
                goldCredit: 0,
                costCenter: "INVENTORY",
                createdBy: adminId,
            })



            const stockDifference =
                (data.toStock.pureWeight ?? 0) -
                (data.fromData.pureWeight ?? 0);

            const makingAmountDifference =
                (data.toStock.avgAmount ?? 0) -
                (data.fromData.avgAmount ?? 0);

            // Normalize values (ABS only)
            const cashCredit =
                makingAmountDifference < 0 ? Math.abs(makingAmountDifference) : 0;

            const cashDebit =
                makingAmountDifference > 0 ? makingAmountDifference : 0;

            const goldCredit =
                stockDifference > 0 ? stockDifference : 0;

            const goldDebit =
                stockDifference < 0 ? Math.abs(stockDifference) : 0;

            await this.createRegistryEntry({
                transactionType: "adjustment",
                assetType: "stock",
                transactionId: adjustment[0]._id,
                metalId: data.fromData.stockId,
                reference: data.voucherCode,
                type: "STOCK_ADJUSTMENT",
                description: "Stock Adjustment Difference",
                grossWeight: data.fromData.grossWeight ?? 0,
                pureWeight: data.fromData.pureWeight ?? 0,
                value: 0,
                purity: data.fromData.purity ?? 0,

                debit: cashDebit,       // ALWAYS >= 0
                credit: cashCredit,     // ALWAYS >= 0
                goldDebit: goldDebit,   // ALWAYS >= 0
                goldCredit: goldCredit, // ALWAYS >= 0

                costCenter: "INVENTORY",
                createdBy: adminId,
            });


            // 5. registry entry - stock adjustment making credit -- from the from stock
            await this.createRegistryEntry({
                transactionType: "adjustment",
                assetType: "AED",
                transactionId: adjustment[0]._id,
                metalId: data.fromData.stockId,
                reference: data.voucherCode,
                type: "MAKING_CHARGES",
                goldBidValue: 0,
                description: "Making Charges Adjustment",
                grossWeight: data.fromData.grossWeight ?? 0,
                pureWeight: data.fromData.pureWeight ?? 0,
                purity: data.fromData.purity ?? 0,
                value: 0,
                debit: 0,
                credit: data.fromData.avgAmount ?? 0,
                goldDebit: 0,
                goldCredit: 0,
                costCenter: "INVENTORY",
                createdBy: adminId,
            })

            // 5. registry entry - stock adjustment making debit 
            await this.createRegistryEntry({
                transactionType: "adjustment",
                assetType: "AED",
                transactionId: adjustment[0]._id,
                metalId: data.fromData.stockId,
                reference: data.voucherCode,
                type: "MAKING_CHARGES",
                goldBidValue: 0,
                description: "Making Charges Adjustment",
                value: 0,
                grossWeight: data.toStock.grossWeight ?? 0,
                pureWeight: data.toStock.pureWeight ?? 0,
                purity: data.toStock.purity ?? 0,
                debit: data.toStock.avgAmount ?? 0,
                credit: 0,
                costCenter: "INVENTORY",
                createdBy: adminId,
            })


            // 5. Commit
            await session.commitTransaction();
            session.endSession();

            return adjustment[0];
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    static async getAllStockAdjustments(query) {
        const {
            page = 1,
            limit = 20,
            status,
            division,
            fromDate,
            toDate,
            sortBy = "createdAt",
            sortOrder = "desc",
        } = query;

        const filter = {};

        if (!query.includeCancelled) {
            filter.status = { $ne: "Cancelled" };
        }
        // Status filter
        if (status) {
            filter.status = status;
        }

        // Division filter
        if (division && mongoose.Types.ObjectId.isValid(division)) {
            filter.division = division;
        }

        // Date range filter
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            StockAdjustment.find(filter)
                .populate("division", "code")
                .populate("enteredBy", "name email")
                .populate("from.stockId", "code")
                .populate("to.stockId", "code")
                .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),

            StockAdjustment.countDocuments(filter),
        ]);

        return {
            data,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    static async getStockAdjustmentById(id) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw createAppError("Invalid stock adjustment ID", 400);
        }

        const adjustment = await StockAdjustment.findById(id)
            .populate("division", "code")
            .populate("enteredBy", "name email")
            .populate("from.stockId", "code standardPurity")
            .populate("to.stockId", "code standardPurity")
            .lean();

        if (!adjustment) {
            throw createAppError("Stock adjustment not found", 404);
        }

        return adjustment;
    }

    static async updateStockAdjustment(id, data, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // --------------------------------------------------
            // 1️ Validate ID
            // --------------------------------------------------
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw createAppError("Invalid stock adjustment ID", 400);
            }

            // --------------------------------------------------
            // 2️ Fetch existing adjustment
            // --------------------------------------------------
            const existing = await StockAdjustment.findById(id).session(session);
            if (!existing) {
                throw createAppError("Stock adjustment not found", 404);
            }

            if (existing.status === "Cancelled") {
                throw createAppError("Cancelled adjustment cannot be edited", 400);
            }

            const voucherNumber = existing.voucherNumber;
            const voucherDate = new Date();

            // --------------------------------------------------
            // 3️ Fetch OLD stock masters (for reversal)
            // --------------------------------------------------
            const existingFromStock = await MetalStock
                .findById(existing.from.stockId)
                .lean();

            const existingToStock = await MetalStock
                .findById(existing.to.stockId)
                .lean();

            if (!existingFromStock || !existingToStock) {
                throw createAppError("Existing stock reference invalid", 400);
            }

            // --------------------------------------------------
            // 4️ REVERSE OLD INVENTORY
            // --------------------------------------------------
            await InventoryLog.create(
                [
                    {
                        stockCode: existing.from.stockId,
                        code: existingFromStock.code,
                        voucherCode: voucherNumber,
                        purity: existing.from.purity,
                        voucherDate,
                        voucherType: "STOCK-ADJ-REV",
                        grossWeight: existing.from.grossWeight,
                        pcs: 0,
                        action: "add",
                        transactionType: "adjustment",
                        createdBy: adminId,
                        note: "Reversal of previous stock adjustment (FROM)",
                    },
                    {
                        stockCode: existing.to.stockId,
                        code: existingToStock.code,
                        voucherCode: voucherNumber,
                        purity: existing.to.purity,
                        voucherDate,
                        voucherType: "STOCK-ADJ-REV",
                        grossWeight: existing.to.grossWeight,
                        pcs: 0,
                        action: "remove",
                        transactionType: "adjustment",
                        createdBy: adminId,
                        note: "Reversal of previous stock adjustment (TO)",
                    },
                ],
                { session, ordered: true }
            );

            // --------------------------------------------------
            // 5️ Fetch NEW stock masters (for apply)
            // --------------------------------------------------
            const newFromStock = await MetalStock
                .findById(data.fromData.stockId)
                .lean();

            const newToStock = await MetalStock
                .findById(data.toData.stockId)
                .lean();

            if (!newFromStock || !newToStock) {
                throw createAppError("Invalid new stock reference", 400);
            }

            // --------------------------------------------------
            // 6️ APPLY NEW INVENTORY
            // --------------------------------------------------
            await InventoryLog.create(
                [
                    {
                        stockCode: data.fromData.stockId,
                        code: newFromStock.code,
                        voucherCode: voucherNumber,
                        purity: data.fromData.purity,
                        voucherDate,
                        voucherType: "STOCK-ADJ",
                        grossWeight: data.fromData.grossWeight,
                        pcs: 0,
                        action: "remove",
                        transactionType: "adjustment",
                        createdBy: adminId,
                        note: "Stock reduced due to updated adjustment",
                    },
                    {
                        stockCode: data.toData.stockId,
                        code: newToStock.code,
                        voucherCode: voucherNumber,
                        purity: data.toData.purity,
                        voucherDate,
                        voucherType: "STOCK-ADJ",
                        grossWeight: data.toData.grossWeight,
                        pcs: 0,
                        action: "add",
                        transactionType: "adjustment",
                        createdBy: adminId,
                        note: "Stock increased due to updated adjustment",
                    },
                ],
                { session, ordered: true }
            );

            // --------------------------------------------------
            // 7️ UPDATE STOCK ADJUSTMENT SNAPSHOT
            // --------------------------------------------------
            const updated = await StockAdjustment.findByIdAndUpdate(
                id,
                {
                    voucherType: data.voucherType || existing.voucherType,
                    from: {
                        stockId: data.fromData.stockId,
                        grossWeight: data.fromData.grossWeight,
                        purity: data.fromData.purity,
                        pureWeight: data.fromData.pureWeight,
                        avgMakingRate: data.fromData.avgRate ?? 0,
                        avgMakingAmount: data.fromData.avgAmount ?? 0,
                    },
                    to: {
                        stockId: data.toData.stockId,
                        grossWeight: data.toData.grossWeight,
                        purity: data.toData.purity,
                        pureWeight: data.toData.pureWeight,
                        avgMakingRate: data.toData.avgRate ?? 0,
                        avgMakingAmount: data.toData.avgAmount ?? 0,
                    },
                },
                { new: true, session }
            );

            // --------------------------------------------------
            // 8️ COMMIT
            // --------------------------------------------------
            await session.commitTransaction();
            session.endSession();

            return updated;

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }



    static async deleteStockAdjustment(id, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw createAppError("Invalid stock adjustment ID", 400);
            }

            const adjustment = await StockAdjustment.findById(id).session(session);
            if (!adjustment) {
                throw createAppError("Stock adjustment not found", 404);
            }

            if (adjustment.status === "Cancelled") {
                throw createAppError("Already cancelled", 400);
            }

            const voucherNumber = adjustment.voucherNumber;
            const voucherDate = new Date();

            console.log("adjustment to be cancelled:", adjustment)
            const stockFrom = await MetalStock.findById(adjustment.from.stockId).lean();
            const stockTo = await MetalStock.findById(adjustment.to.stockId).lean();


            /* -----------------------------
               REVERSE INVENTORY
            ----------------------------- */
            await InventoryLog.create(
                [
                    {
                        stockCode: adjustment.from.stockId,
                        voucherCode: voucherNumber,
                        code: stockFrom.code,
                        voucherDate,
                        voucherType: "STOCK-ADJ-CANCEL",
                        grossWeight: adjustment.from.grossWeight,
                        purity: adjustment.from.purity,
                        pcs: 0,
                        action: "add",
                        transactionType: "adjustment",
                        createdBy: adminId,
                        note: "Stock reversal due to adjustment cancellation (FROM)",
                    },
                    {
                        stockCode: adjustment.to.stockId,
                        voucherCode: voucherNumber,
                        code: stockTo.code,
                        voucherDate,
                        voucherType: "STOCK-ADJ-CANCEL",
                        grossWeight: adjustment.to.grossWeight,
                        purity: adjustment.to.purity,
                        pcs: 0,
                        action: "remove",
                        transactionType: "adjustment",
                        createdBy: adminId,
                        note: "Stock reversal due to adjustment cancellation (TO)",
                    },
                ],
                {
                    session,
                    ordered: true,
                }
            );


            adjustment.status = "Cancelled";
            adjustment.cancelledBy = adminId;
            adjustment.cancelledAt = new Date();

            await adjustment.save({ session });

            await session.commitTransaction();
            session.endSession();

            return adjustment;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
    static async createRegistryEntry({
        transactionType,
        assetType,
        transactionId,
        metalId,
        InventoryLogID,
        type,
        goldBidValue = 0,
        description,
        value = 0,
        goldDebit = 0,
        goldCredit = 0,
        debit = 0,
        credit = 0,
        reference,
        party = null,
        isBullion = null,
        costCenter = "INVENTORY",
        createdBy,
        purity,
        grossWeight,
        pureWeight,
    }) {
        try {
            const registryEntry = new Registry({
                transactionType,
                assetType,
                transactionId,
                metalId,
                InventoryLogID,
                costCenter,
                type,
                goldBidValue,
                description,

                // ✅ USE WHAT YOU PASSED
                value,
                goldDebit,
                goldCredit,
                debit,
                credit,

                reference,
                party,
                isBullion,
                createdBy,
                status: "completed",
                purity,
                grossWeight,
                pureWeight,
            });

            return await registryEntry.save();
        } catch (error) {
            console.error("Registry save failed:", error);
            throw error; // ❗ DO NOT swallow this
        }
    }


}

export default StockAdjustmentService;
