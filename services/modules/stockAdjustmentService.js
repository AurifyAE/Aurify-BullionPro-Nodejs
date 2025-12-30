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
                debit: data.toStock.pureWeight ?? 0,
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

    static async addStockAdjustmentBatch(payload, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { voucher, adjustments } = payload;

            if (!voucher) {
                throw createAppError("Voucher data missing", 400);
            }

            if (!adjustments || !adjustments.length) {
                throw createAppError("No stock adjustments provided", 400);
            }

            // 1️⃣ Build items array (LINES)
            const items = adjustments.map((item, index) => {
                const { from, to } = item;

                if (!from || !to) {
                    throw createAppError("From / To stock data missing", 400);
                }

                if (!from.stockCode || !to.stockCode) {
                    throw createAppError("Stock code missing in adjustment line", 400);
                }

                return {
                    lineNo: index + 1,
                    from: {
                        stockId: from.stockId,
                        stockCode: from.stockCode, // ✅ REQUIRED
                        grossWeight: from.grossWeight,
                        purity: from.purity,
                        pureWeight: from.pureWeight,
                        avgMakingRate: from.avgMakingRate ?? 0,
                        avgMakingAmount: from.avgMakingAmount ?? 0,
                    },
                    to: {
                        stockId: to.stockId,
                        stockCode: to.stockCode, // ✅ REQUIRED
                        grossWeight: to.grossWeight,
                        purity: to.purity,
                        pureWeight: to.pureWeight,
                        avgMakingRate: to.avgMakingRate ?? 0,
                        avgMakingAmount: to.avgMakingAmount ?? 0,
                    },
                    status: "Completed",
                };
            });

            // 2️⃣ Create ONE voucher document
            const stockAdjustment = await StockAdjustment.create(
                [{
                    voucherNumber: voucher.voucherNo,
                    voucherType: voucher.voucherType,
                    voucherDate: voucher.voucherDate,
                    division: voucher.division,
                    enteredBy: voucher.enteredBy || adminId,
                    status: "Completed",
                    items,
                }],
                { session }
            );

            const voucherDate = new Date(voucher.voucherDate);

            // 3️⃣ Inventory + Registry (PER LINE)
            for (const line of items) {
                const { from, to } = line;
                console.log("Processing line:", line);
                console.log(from, to)

                const stockDifference = to.pureWeight - from.pureWeight;
                const makingAmountDifference = to.avgMakingAmount - from.avgMakingAmount;

                // Inventory Logs
                await InventoryLog.insertMany(
                    [
                        {
                            stockCode: from.stockId,
                            code: from.stockCode, // ✅ NOW PRESENT
                            voucherCode: voucher.voucherNo,
                            voucherDate,
                            voucherType: voucher.voucherType,
                            grossWeight: from.grossWeight,
                            purity: from.purity,
                            action: "remove",
                            transactionType: "adjustment",
                            avgMakingAmount: from.avgMakingAmount,
                            avgMakingRate: from.avgMakingRate,
                            createdBy: adminId,
                            note: "Stock reduced due to stock adjustment",
                        },
                        {
                            stockCode: to.stockId,
                            code: to.stockCode, // ✅ NOW PRESENT
                            voucherCode: voucher.voucherNo,
                            voucherDate,
                            voucherType: voucher.voucherType,
                            grossWeight: to.grossWeight,
                            purity: to.purity,
                            action: "add",
                            transactionType: "adjustment",
                            avgMakingAmount: to.avgMakingAmount,
                            avgMakingRate: to.avgMakingRate,
                            createdBy: adminId,
                            note: "Stock increased due to stock adjustment",
                        },
                    ],
                    { session }
                );


                // GOLD Registry
                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "XAU",
                    transactionId: stockAdjustment[0]._id,
                    reference: voucher.voucherNo,
                    type: "GOLD_STOCK",
                    credit: from.pureWeight,
                    goldCredit: from.pureWeight,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Stock Adjustment",
                });

                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "XAU",
                    transactionId: stockAdjustment[0]._id,
                    reference: voucher.voucherNo,
                    type: "GOLD_STOCK",
                    debit: to.pureWeight,
                    goldDebit: to.pureWeight,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Stock Adjustment",
                });

                // MAKING CHARGES
                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "AED",
                    transactionId: stockAdjustment[0]._id,
                    reference: voucher.voucherNo,
                    type: "MAKING_CHARGES",
                    credit: from.avgMakingAmount,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Stock Adjustment",
                });

                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "AED",
                    transactionId: stockAdjustment[0]._id,
                    reference: voucher.voucherNo,
                    type: "MAKING_CHARGES",
                    debit: to.avgMakingAmount,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Stock Adjustment",
                });

                if (stockDifference || makingAmountDifference) {
                    // STOCK ADJUSTMENT CASH/INVENTORY
                    await this.createRegistryEntry({
                        transactionType: "adjustment",
                        assetType: "AED",
                        transactionId: stockAdjustment[0]._id,
                        reference: voucher.voucherNo,
                        type: "STOCK_ADJUSTMENT",
                        debit: makingAmountDifference < 0 ? Math.abs(makingAmountDifference) : 0,
                        credit: makingAmountDifference > 0 ? Math.abs(makingAmountDifference) : 0,
                        cashDebit: makingAmountDifference < 0 ? makingAmountDifference : 0,
                        cashCredit: makingAmountDifference > 0 ? Math.abs(makingAmountDifference) : 0,
                        goldDebit: stockDifference < 0 ? Math.abs(stockDifference) : 0,
                        goldCredit: stockDifference > 0 ? Math.abs(stockDifference) : 0,
                        costCenter: "INVENTORY",
                        createdBy: adminId,
                        description: "Stock Adjustment",
                    });
                }
            }

            await session.commitTransaction();
            session.endSession();

            return {
                voucherNumber: voucher.voucherNo,
                lines: items.length,
                _id: stockAdjustment[0]._id,
            };

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

        if (status) filter.status = status;

        if (division && mongoose.Types.ObjectId.isValid(division)) {
            filter.division = division;
        }

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
                .populate("items.from.stockId", "code")
                .populate("items.to.stockId", "code")
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
            .populate("items.from.stockId", "code standardPurity")
            .populate("items.to.stockId", "code standardPurity")
            .lean();

        if (!adjustment) {
            throw createAppError("Stock adjustment not found", 404);
        }

        return adjustment;
    }

    static async getStockAdjustmentByVoucher(voucherNo) {
        if (!voucherNo) {
            throw createAppError("Voucher number is required", 400);
        }

        const adjustment = await StockAdjustment.findOne({
            voucherNumber: voucherNo,
        })
            .populate("division", "code")
            .populate("enteredBy", "name email")
            .populate("items.from.stockId", "code")
            .populate("items.to.stockId", "code")
            .lean();

        if (!adjustment) {
            throw createAppError("Stock adjustment not found", 404);
        }

        return adjustment;
    }



    static async updateStockAdjustment(id, payload, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw createAppError("Invalid stock adjustment ID", 400);
            }

            const existing = await StockAdjustment.findById(id).session(session);

            if (!existing) {
                throw createAppError("Stock adjustment not found", 404);
            }

            if (existing.status === "Cancelled") {
                throw createAppError("Cancelled adjustment cannot be edited", 400);
            }

            const { voucher, adjustments } = payload;

            if (!adjustments || !adjustments.length) {
                throw createAppError("No adjustment lines provided", 400);
            }

            const voucherNumber = existing.voucherNumber;
            const voucherDate = new Date(voucher?.voucherDate || existing.voucherDate);

            /* =====================================================
               1️⃣ REVERSE OLD INVENTORY (SAFE — FROM MASTER)
            ===================================================== */
            for (const line of existing.items) {
                const { from, to } = line;

                const fromStock = await MetalStock.findById(from.stockId)
                    .select("code")
                    .lean();

                const toStock = await MetalStock.findById(to.stockId)
                    .select("code")
                    .lean();

                if (!fromStock || !toStock) {
                    throw createAppError("Stock master missing during reversal", 400);
                }

                await InventoryLog.insertMany(
                    [
                        {
                            stockCode: from.stockId,
                            code: fromStock.code,
                            voucherCode: voucherNumber,
                            voucherDate,
                            voucherType: "STOCK-ADJ-REV",
                            grossWeight: from.grossWeight,
                            purity: from.purity,
                            action: "add",
                            transactionType: "adjustment",
                            createdBy: adminId,
                            note: "Reversal before stock adjustment edit",
                        },
                        {
                            stockCode: to.stockId,
                            code: toStock.code,
                            voucherCode: voucherNumber,
                            voucherDate,
                            voucherType: "STOCK-ADJ-REV",
                            grossWeight: to.grossWeight,
                            purity: to.purity,
                            action: "remove",
                            transactionType: "adjustment",
                            createdBy: adminId,
                            note: "Reversal before stock adjustment edit",
                        },
                    ],
                    { session }
                );
            }

            /* =====================================================
               2️⃣ DELETE OLD REGISTRY ENTRIES
            ===================================================== */
            await Registry.deleteMany(
                {
                    transactionType: "adjustment",
                    transactionId: existing._id,
                },
                { session }
            );

            /* =====================================================
               3️⃣ BUILD NEW ITEMS (SNAPSHOT)
            ===================================================== */
            const newItems = adjustments.map((item, idx) => ({
                lineNo: idx + 1,
                from: {
                    stockId: item.from.stockId,
                    stockCode: item.from.stockCode,
                    grossWeight: item.from.grossWeight,
                    purity: item.from.purity,
                    pureWeight: item.from.pureWeight,
                    avgMakingRate: item.from.avgMakingRate ?? 0,
                    avgMakingAmount: item.from.avgMakingAmount ?? 0,
                },
                to: {
                    stockId: item.to.stockId,
                    stockCode: item.to.stockCode,
                    grossWeight: item.to.grossWeight,
                    purity: item.to.purity,
                    pureWeight: item.to.pureWeight,
                    avgMakingRate: item.to.avgMakingRate ?? 0,
                    avgMakingAmount: item.to.avgMakingAmount ?? 0,
                },
                status: "Completed",
            }));

            /* =====================================================
               4️⃣ UPDATE VOUCHER HEADER
            ===================================================== */
            existing.items = newItems;
            existing.voucherType = voucher?.voucherType || existing.voucherType;
            existing.division = voucher?.division || existing.division;
            existing.enteredBy = adminId;

            await existing.save({ session });

            /* =====================================================
               5️⃣ APPLY NEW INVENTORY + REGISTRY (MASTER SAFE)
            ===================================================== */
            for (const line of newItems) {
                const { from, to } = line;

                const fromStock = await MetalStock.findById(from.stockId)
                    .select("code")
                    .lean();

                const toStock = await MetalStock.findById(to.stockId)
                    .select("code")
                    .lean();

                if (!fromStock || !toStock) {
                    throw createAppError("Stock master missing during apply", 400);
                }

                // Inventory
                await InventoryLog.insertMany(
                    [
                        {
                            stockCode: from.stockId,
                            code: fromStock.code,
                            voucherCode: voucherNumber,
                            voucherDate,
                            voucherType: existing.voucherType,
                            grossWeight: from.grossWeight,
                            purity: from.purity,
                            action: "remove",
                            transactionType: "adjustment",
                            avgMakingAmount: from.avgMakingAmount,
                            avgMakingRate: from.avgMakingRate,
                            createdBy: adminId,
                            note: "Stock reduced due to stock adjustment edit",
                        },
                        {
                            stockCode: to.stockId,
                            code: toStock.code,
                            voucherCode: voucherNumber,
                            voucherDate,
                            voucherType: existing.voucherType,
                            grossWeight: to.grossWeight,
                            purity: to.purity,
                            action: "add",
                            transactionType: "adjustment",
                            avgMakingAmount: to.avgMakingAmount,
                            avgMakingRate: to.avgMakingRate,
                            createdBy: adminId,
                            note: "Stock increased due to stock adjustment edit",
                        },
                    ],
                    { session }
                );

                // GOLD
                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "XAU",
                    transactionId: existing._id,
                    reference: voucherNumber,
                    type: "GOLD_STOCK",
                    credit: from.pureWeight,
                    goldCredit: from.pureWeight,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Stock Adjustment",
                });

                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "XAU",
                    transactionId: existing._id,
                    reference: voucherNumber,
                    type: "GOLD_STOCK",
                    debit: to.pureWeight,
                    goldDebit: to.pureWeight,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Stock Adjustment",
                });

                // MAKING
                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "AED",
                    transactionId: existing._id,
                    reference: voucherNumber,
                    type: "MAKING_CHARGES",
                    credit: from.avgMakingAmount,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Making Charges Adjustment",
                });

                await this.createRegistryEntry({
                    transactionType: "adjustment",
                    assetType: "AED",
                    transactionId: existing._id,
                    reference: voucherNumber,
                    type: "MAKING_CHARGES",
                    debit: to.avgMakingAmount,
                    costCenter: "INVENTORY",
                    createdBy: adminId,
                    description: "Making Charges Adjustment",
                });
            }

            await session.commitTransaction();
            session.endSession();

            return existing;

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

            const adjustment = await StockAdjustment
                .findById(id)
                .session(session);

            if (!adjustment) {
                throw createAppError("Stock adjustment not found", 404);
            }

            if (adjustment.status === "Cancelled") {
                throw createAppError("Already cancelled", 400);
            }

            if (!adjustment.items || !adjustment.items.length) {
                throw createAppError("No adjustment lines found to cancel", 400);
            }

            const voucherNumber = adjustment.voucherNumber;
            const voucherDate = new Date();

            // 🔁 Reverse inventory PER LINE
            for (const line of adjustment.items) {
                const { from, to } = line;

                if (!from?.stockId || !to?.stockId) {
                    throw createAppError("Invalid stock data in adjustment line", 400);
                }

                const fromStock = await MetalStock.findById(from.stockId).lean();
                const toStock = await MetalStock.findById(to.stockId).lean();

                if (!fromStock || !toStock) {
                    throw createAppError("Stock master not found during cancellation", 400);
                }

                await InventoryLog.insertMany(
                    [
                        {
                            stockCode: from.stockId,
                            code: fromStock.code,
                            voucherCode: voucherNumber,
                            voucherDate,
                            voucherType: "STOCK-ADJ-CANCEL",
                            grossWeight: from.grossWeight,
                            purity: from.purity,
                            pcs: 0,
                            action: "add", // 🔁 reversal
                            transactionType: "adjustment",
                            createdBy: adminId,
                            note: "Stock reversal (FROM) due to adjustment cancellation",
                        },
                        {
                            stockCode: to.stockId,
                            code: toStock.code,
                            voucherCode: voucherNumber,
                            voucherDate,
                            voucherType: "STOCK-ADJ-CANCEL",
                            grossWeight: to.grossWeight,
                            purity: to.purity,
                            pcs: 0,
                            action: "remove", // 🔁 reversal
                            transactionType: "adjustment",
                            createdBy: adminId,
                            note: "Stock reversal (TO) due to adjustment cancellation",
                        },
                    ],
                    { session, ordered: true }
                );
            }

            // 🧹 Optional but recommended: mark registries inactive
            await Registry.deleteMany({
                transactionType: "adjustment",
                transactionId: adjustment._id,
            }).session(session);

            // 🚫 Mark voucher cancelled
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
