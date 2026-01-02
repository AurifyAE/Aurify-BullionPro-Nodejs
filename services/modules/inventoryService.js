import mongoose from "mongoose";
import Inventory from "../../models/modules/inventory.js";
import Registry from "../../models/modules/Registry.js";
import { createAppError } from "../../utils/errorHandler.js";
import MetalStock from "../../models/modules/MetalStock.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import BranchMaster from "../../models/modules/BranchMaster.js";
import OpeningBalance from "../../models/modules/OpeningBalance.js";
import { updatePartyOpeningBalance } from "../../utils/updatePartyOpeningBalance.js";

class InventoryService {
  static async fetchAllInventory() {
    try {
      const logs = await InventoryLog.aggregate([
        // 1️⃣ Sort latest first
        { $sort: { updatedAt: -1 } },

        // 2️⃣ Group by stockCode
        {
          $group: {
            _id: "$stockCode",

            // ----------------------------
            // Gross Weight (SAFE)
            // ----------------------------
            totalGrossWeight: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                  {
                    $subtract: [
                      0,
                      { $toDouble: { $ifNull: ["$grossWeight", 0] } }
                    ]
                  }
                ]
              }
            },

            // ----------------------------
            // Pieces (SAFE)
            // ----------------------------
            totalPeices: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  { $toDouble: { $ifNull: ["$pcs", 0] } },
                  {
                    $subtract: [
                      0,
                      { $toDouble: { $ifNull: ["$pcs", 0] } }
                    ]
                  }
                ]
              }
            },

            // ----------------------------
            // MAKING AMOUNT (SUM ONLY)
            // ----------------------------
            totalMakingAmount: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  { $toDouble: { $ifNull: ["$avgMakingAmount", 0] } },
                  {
                    $subtract: [
                      0,
                      { $toDouble: { $ifNull: ["$avgMakingAmount", 0] } }
                    ]
                  }
                ]
              }
            },
            // totalMakingAmount: {
            //   $sum: {
            //     $toDouble: { $ifNull: ["$avgMakingAmount", 0] }
            //   }
            // },

            // ----------------------------
            // Meta
            // ----------------------------
            code: { $first: "$code" }
          }
        },

        // 3️⃣ Lookups
        {
          $lookup: {
            from: "metalstocks",
            localField: "_id",
            foreignField: "_id",
            as: "stock"
          }
        },
        { $unwind: { path: "$stock", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "karatmasters",
            localField: "stock.karat",
            foreignField: "_id",
            as: "karatInfo"
          }
        },
        { $unwind: { path: "$karatInfo", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "divisionmasters",
            localField: "stock.metalType",
            foreignField: "_id",
            as: "metalTypeInfo"
          }
        },
        { $unwind: { path: "$metalTypeInfo", preserveNullAndEmptyArrays: true } },

        // 4️⃣ Final projection
        {
          $project: {
            _id: 0,
            code: 1,
            totalGrossWeight: 1,
            totalPeices: 1,

            // ✅ SUM of making amount
            avgMakingAmount: {
              $round: ["$totalMakingAmount", 2]
            },

            // ✅ RATE = SUM(making) / SUM(weight)
            avgMakingRate: {
              $round: [
                {
                  $cond: [
                    { $gt: ["$totalGrossWeight", 0] },
                    {
                      $divide: [
                        "$totalMakingAmount",
                        "$totalGrossWeight"
                      ]
                    },
                    0
                  ]
                },
                2
              ]
            },

            totalValue: "$stock.totalValue",
            metalId: "$stock._id",
            StockName: "$stock.code",
            pcs: "$stock.pcs",
            purity: "$karatInfo.standardPurity",
            metalType: "$metalTypeInfo.description"
          }
        }
      ]);

      return logs;
    } catch (err) {
      console.error(err);
      throw createAppError(
        "Failed to fetch inventory logs",
        500,
        "FETCH_ERROR"
      );
    }
  }



  static async reverseInventory(transaction, session) {
    try {
      for (const item of transaction.stockItems || []) {
        const metalId = item.stockCode?._id;
        if (!metalId) continue;

        const [inventory, metal] = await Promise.all([
          Inventory.findOne({
            metal: new mongoose.Types.ObjectId(metalId),
          }).session(session),
          MetalStock.findById(metalId).session(session),
        ]);

        if (!inventory) {
          throw createAppError(
            `Inventory not found for metal: ${item.stockCode.code}`,
            404,
            "INVENTORY_NOT_FOUND"
          );
        }

        const isSale =
          transaction.transactionType === "sale" ||
          transaction.transactionType === "metalPayment";
        const factor = isSale ? 1 : -1; // Reverse the factor
        const pcsDelta = factor * (item.pieces || 0);
        const weightDelta = factor * (item.grossWeight || 0);
        inventory.pcsCount += pcsDelta;
        inventory.grossWeight += weightDelta;
        inventory.pureWeight = (inventory.grossWeight * inventory.purity) / 100;
        await inventory.save({ session });
        
        // Extract party - try party object first, then partyCode
        const partyId = transaction.party?._id || transaction.party || transaction.partyCode || item.party?._id || item.party || item.partyCode || null;
        
        // Extract voucherType
        const voucherType = transaction.voucherType || item.voucherType || transaction.transactionType || "N/A";
        
        // Extract isDraft and draftId from transaction or item
        const isDraft = transaction.isDraft || item.isDraft || false;
        const draftId = transaction.draftId || item.draftId || null;
        
        // Inventory Log - Main entry
        const logEntries = [
          {
            code: metal.code,
            stockCode: metal._id,
            voucherCode:
              transaction.voucherNumber || item.voucherNumber || "",
            voucherDate: transaction.voucherDate || item.voucherDate || new Date(),
            voucherType: voucherType,
            transactionType: transaction.transactionType,
            pcs: item.pieces || 0,
            grossWeight: item.grossWeight || 0,
            purity: item.purity || 0,
            avgMakingRate: item.makingUnit?.makingRate || item.avgMakingRate || 0,
            avgMakingAmount: item.makingUnit?.makingAmount || item.avgMakingAmount || 0,
            premiumDiscountAmount: item.premiumDiscount?.type === "discount" 
              ? -(Math.abs(item.premiumDiscount?.amount || 0)) // Discount = negative
              : Math.abs(item.premiumDiscount?.amount || 0), // Premium = positive
            premiumDiscountRate: item.premiumDiscount?.rate || 0,
            purityDifference: item.purityDifference || 0,
            isPurityDifferenceEntry: false,
            party: partyId,
            action: isSale ? "remove" : "add",
            createdBy: transaction.createdBy || null,
            createdAt: new Date(),
            isDraft: isDraft,
            draftId: draftId,
          },
        ];

        // Create separate InventoryLog entry for purity difference gain/loss
        const purityDiff = item.purityDifference || 0;
        if (purityDiff !== 0) {
          // Fetch the Registry entry with type "PURITY_DIFFERENCE" for this transaction
          // Match by metalTransactionId, type, and party to find the correct registry entry
          const purityDiffRegistry = await Registry.findOne({
            metalTransactionId: transaction._id,
            type: "PURITY_DIFFERENCE",
            party: partyId || transaction.party?._id || transaction.party || transaction.partyCode,
          }).session(session);

          // Determine action based on registry debit/credit
          // If debit > 0 → Gain → action = "add"
          // If credit > 0 → Loss → action = "remove"
          let action = "add"; // Default
          let isGain = true;
          
          if (purityDiffRegistry) {
            if (purityDiffRegistry.debit > 0) {
              action = "add"; // Gain
              isGain = true;
            } else if (purityDiffRegistry.credit > 0) {
              action = "remove"; // Loss
              isGain = false;
            } else {
              // Fallback to purityDifference value if registry doesn't have debit/credit
              isGain = purityDiff > 0;
              action = isGain ? "add" : "remove";
            }
          } else {
            // Fallback if registry entry not found yet
            isGain = purityDiff > 0;
            action = isGain ? "add" : "remove";
          }

          logEntries.push({
            code: metal.code,
            stockCode: metal._id,
            voucherCode:
              transaction.voucherNumber || item.voucherNumber || "",
            voucherDate: transaction.voucherDate || item.voucherDate || new Date(),
            voucherType: voucherType,
            transactionType: transaction.transactionType,
            pcs: 0,
            grossWeight: 0, // Purity difference entries don't affect actual weight - only for reporting
            purity: item.purity || 0,
            avgMakingRate: 0,
            avgMakingAmount: 0,
            premiumDiscountAmount: 0,
            premiumDiscountRate: 0,
            purityDifference: purityDiff,
            isPurityDifferenceEntry: true, // Mark as purity difference entry
            party: partyId,
            action: action, // Dynamically set based on registry debit/credit
            createdBy: transaction.createdBy || null,
            createdAt: new Date(),
            isDraft: isDraft,
            draftId: draftId,
            note: isGain
              ? `Purity difference gain: ${purityDiff} (for reporting only)`
              : `Purity difference loss: ${Math.abs(purityDiff)} (for reporting only)`,
          });
        }

        await InventoryLog.create(logEntries, { session });
      }
    } catch (error) {
      if (error.name === "AppError") throw error;
      throw createAppError(
        error.message || "Failed to reverse inventory",
        500,
        "INVENTORY_REVERSE_FAILED"
      );
    }
  }
  static async fetchInvLogs() {
    try {
      // Exclude purity difference entries (gain/loss) - these are only for reports
      const logs = await InventoryLog.find({
        isPurityDifferenceEntry: { $ne: true } // Exclude purity difference entries
      }).sort({ createdAt: -1 });
      return logs;
    } catch (error) {
      throw createAppError(
        "Failed to fetch inventory Logs",
        500,
        "FETCH_INVENTORY_LOG_ERROR"
      );
    }
  }

  static async getInventoryLogById(inventoryId) {
    try {
      // Exclude purity difference entries (gain/loss) - these are only for reports
      const logs = await InventoryLog.find({ 
        stockCode: new mongoose.Types.ObjectId(inventoryId),
        isPurityDifferenceEntry: { $ne: true } // Exclude purity difference entries
      });
      return logs;
    } catch (error) {
      throw createAppError(
        "Failed to fetch inventory Logs",
        500,
        "FETCH_INVENTORY_LOG_ERROR"
      );
    }
  }

  /**
   * Aggregate inventory logs to calculate gold balance by stock
   * Returns total pure gold and breakdown by stock type
   * Uses MetalStock.standardPurity for calculations (since log purity may be 0)
   */
  static async getGoldBalanceFromLogs() {
    try {
      // First, check total logs count
      const totalLogs = await InventoryLog.countDocuments({});
      const nonDraftLogs = await InventoryLog.countDocuments({ isDraft: { $ne: true } });

      const pipeline = [
        // 1. Filter out draft logs and purity difference entries (only finalized transactions, exclude purity gain/loss)
        {
          $match: {
            isDraft: { $ne: true },
            isPurityDifferenceEntry: { $ne: true } // Exclude purity difference entries (only for reports)
          }
        },
        // 2. Lookup MetalStock to get standardPurity (do this BEFORE grouping)
        {
          $lookup: {
            from: "metalstocks",
            localField: "stockCode",
            foreignField: "_id",
            as: "stock"
          }
        },
        { $unwind: { path: "$stock", preserveNullAndEmptyArrays: true } },
        // 3. Lookup KaratMaster to get purity if standardPurity is not available
        {
          $lookup: {
            from: "karatmasters",
            localField: "stock.karat",
            foreignField: "_id",
            as: "karatInfo"
          }
        },
        { $unwind: { path: "$karatInfo", preserveNullAndEmptyArrays: true } },
        // 4. Calculate purity to use (prefer log purity, then stock standardPurity, then karat standardPurity)
        {
          $addFields: {
            effectivePurity: {
              $cond: [
                { $gt: [{ $ifNull: ["$purity", 0] }, 0] },
                { $divide: [{ $toDouble: { $ifNull: ["$purity", 0] } }, 100] }, // Log purity is in percentage, convert to decimal
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$stock.standardPurity", 0] }, 0] },
                    { $toDouble: { $ifNull: ["$stock.standardPurity", 0] } }, // Stock standardPurity is already in decimal (0-1)
                    {
                      $cond: [
                        { $gt: [{ $ifNull: ["$karatInfo.standardPurity", 0] }, 0] },
                        { $divide: [{ $toDouble: { $ifNull: ["$karatInfo.standardPurity", 0] } }, 100] }, // Karat purity is in percentage, convert to decimal
                        0
                      ]
                    }
                  ]
                }
              ]
            }
          }
        },
        // 5. Calculate pure weight for each log entry
        {
          $addFields: {
            calculatedPureWeight: {
              $multiply: [
                { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                "$effectivePurity"
              ]
            }
          }
        },
        // 6. Group by stockCode and calculate totals
        {
          $group: {
            _id: "$stockCode",
            stockName: {
              $first: {
                $ifNull: [
                  "$stock.description",
                  {
                    $ifNull: ["$stock.code", "Other"]
                  }
                ]
              }
            },
            totalGrossWeight: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                  {
                    $subtract: [
                      0,
                      { $toDouble: { $ifNull: ["$grossWeight", 0] } }
                    ]
                  }
                ]
              }
            },
            totalPureWeight: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  "$calculatedPureWeight",
                  {
                    $subtract: [0, "$calculatedPureWeight"]
                  }
                ]
              }
            }
          }
        },
        // 7. Include all balances (positive, zero, and negative)
        // Negative balances indicate overselling and should be shown to the client
        // No filter - we want to show all balances
        // 8. Project final structure
        {
          $project: {
            _id: 0,
            stockCode: "$_id",
            stockName: 1,
            totalGrossWeight: { $round: ["$totalGrossWeight", 2] },
            totalPureWeight: { $round: ["$totalPureWeight", 2] }
          }
        },
        // 9. Sort by pure weight descending
        {
          $sort: { totalPureWeight: -1 }
        }
      ];

      // Execute the full pipeline
      const stockBalances = await InventoryLog.aggregate(pipeline);

      // Calculate total pure gold
      const totalPureGold = stockBalances.reduce((sum, stock) => {
        return sum + (stock.totalPureWeight || 0);
      }, 0);

      // Create breakdown array with percentages
      // For percentage calculation, use absolute value of total to avoid issues with negative totals
      const totalForPercentage = Math.abs(totalPureGold) || 1; // Avoid division by zero

      const breakdown = stockBalances.map((stock) => ({
        type: stock.stockName || "Other",
        weight: stock.totalPureWeight,
        percentage: totalForPercentage > 0
          ? Math.round((Math.abs(stock.totalPureWeight) / totalForPercentage) * 100)
          : 0,
      }));

      const result = {
        totalPureGold: Math.round(totalPureGold * 100) / 100, // Round to 2 decimal places
        breakdown,
      };

      return result;
    } catch (error) {
      throw createAppError(
        `Failed to calculate gold balance from logs: ${error.message}`,
        500,
        "GOLD_BALANCE_CALCULATION_ERROR"
      );
    }
  }

  static async updateInventoryLog(inventoryId, body, admin) {
    try {
      // updated by also add to inventory log
      body.updatedBy = admin;
      const logs = await InventoryLog.findByIdAndUpdate(inventoryId, body, { new: true });
      return logs;
    } catch (error) {
      throw createAppError(
        "Failed to fetch inventory Logs",
        500,
        "FETCH_INVENTORY_LOG_ERROR"
      );
    }
  }

  static async deleteInventoryLogById(inventoryId) {
    try {
      const result = await InventoryLog.deleteMany({ _id: new mongoose.Types.ObjectId(inventoryId) });
      return result;
    } catch (error) {
      throw createAppError(
        "Failed to fetch inventory Logs",
        500,
        "FETCH_INVENTORY_LOG_ERROR"
      );
    }
  }

  static async deleteVoucherByVoucher(voucherId) {
    try {
      const result = await InventoryLog.deleteMany({ voucherCode: voucherId });
      const registryResult = await Registry.deleteMany({ reference: voucherId });
      return result;
    } catch (error) {
      throw createAppError(
        "Failed to fetch inventory Logs",
        500,
        "FETCH_INVENTORY_LOG_ERROR"
      );
    }
  }

  static async deleteOpeningBalanceByVoucher(voucherId) {
    try {
      // first reverse the party opening balance effects
      const openingBalances = await OpeningBalance.find({ voucherCode: voucherId });

      for (const ob of openingBalances) {
        await this.reverseOpeningBalanceEffects(ob);

      }
      const result = await OpeningBalance.deleteMany({ voucherCode: voucherId });
      const registryResult = await Registry.deleteMany({ reference: voucherId });
      return result;
    } catch (error) {
      throw createAppError(
        "Failed to fetch inventory Logs",
        500,
        "FETCH_INVENTORY_LOG_ERROR"
      );
    }
  }

  static async reverseOpeningBalanceEffects(openingBalance) {
    try {
      const partyId = openingBalance.partyId;
      const assetType = openingBalance.assetType;
      const assetCode = openingBalance.assetCode;
      const value = openingBalance.value || 0;

      await updatePartyOpeningBalance({
        partyId,
        assetType,
        assetCode,
        value,
        reverse: true
      });
    } catch (error) {
      throw createAppError(
        "Failed to reverse opening balance effects",
        500,
        "REVERSE_OPENING_BALANCE_ERROR"
      );
    }
  }




  static async fetchInventoryById(inventoryId) {
    try {
      const logs = await InventoryLog.aggregate([
        // --------------------------------------------------
        // 1️⃣ Match single stock (exclude drafts)
        // --------------------------------------------------
        {
          $match: {
            stockCode: new mongoose.Types.ObjectId(inventoryId),
            $or: [
              { isDraft: { $ne: true } },
              { isDraft: { $exists: false } }
            ]
          }
        },

        // --------------------------------------------------
        // 2️⃣ Sort latest first
        // --------------------------------------------------
        { $sort: { updatedAt: -1 } },

        // --------------------------------------------------
        // 3️⃣ Group (IDENTICAL to fetchAllInventory)
        // --------------------------------------------------
        {
          $group: {
            _id: "$stockCode",

            // ----------------------------
            // Gross Weight (SAFE)
            // ----------------------------
            totalGrossWeight: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                  {
                    $subtract: [
                      0,
                      { $toDouble: { $ifNull: ["$grossWeight", 0] } }
                    ]
                  }
                ]
              }
            },

            // ----------------------------
            // Pieces (SAFE)
            // ----------------------------
            totalPeices: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  { $toDouble: { $ifNull: ["$pcs", 0] } },
                  {
                    $subtract: [
                      0,
                      { $toDouble: { $ifNull: ["$pcs", 0] } }
                    ]
                  }
                ]
              }
            },

            // ----------------------------
            // MAKING AMOUNT (SUM ONLY)
            // ----------------------------
            totalMakingAmount: {
              $sum: {
                $toDouble: { $ifNull: ["$avgMakingAmount", 0] }
              }
            },

            // ----------------------------
            // Meta
            // ----------------------------
            code: { $first: "$code" }
          }
        },

        // --------------------------------------------------
        // 4️⃣ Lookups (same as fetchAllInventory)
        // --------------------------------------------------
        {
          $lookup: {
            from: "metalstocks",
            localField: "_id",
            foreignField: "_id",
            as: "stock"
          }
        },
        { $unwind: { path: "$stock", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "karatmasters",
            localField: "stock.karat",
            foreignField: "_id",
            as: "karatInfo"
          }
        },
        { $unwind: { path: "$karatInfo", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "divisionmasters",
            localField: "stock.metalType",
            foreignField: "_id",
            as: "metalTypeInfo"
          }
        },
        { $unwind: { path: "$metalTypeInfo", preserveNullAndEmptyArrays: true } },

        // --------------------------------------------------
        // 5️⃣ Final Projection (IDENTICAL FORMULA)
        // --------------------------------------------------
        {
          $project: {
            _id: 0,
            code: 1,
            totalGrossWeight: 1,
            totalPeices: 1,

            // ✅ MAKING AMOUNT (SUM)
            avgMakingAmount: {
              $round: ["$totalMakingAmount", 2]
            },

            // ✅ MAKING RATE = SUM / WEIGHT
            avgMakingRate: {
              $round: [
                {
                  $cond: [
                    { $gt: ["$totalGrossWeight", 0] },
                    {
                      $divide: [
                        "$totalMakingAmount",
                        "$totalGrossWeight"
                      ]
                    },
                    0
                  ]
                },
                2
              ]
            },

            totalValue: "$stock.totalValue",
            metalId: "$stock._id",
            StockName: "$stock.code",
            pcs: "$stock.pcs",

            // Karat
            purity: "$karatInfo.standardPurity",
            karatCode: "$karatInfo.karatCode",
            karatDescription: "$karatInfo.description",

            // Metal Type
            metalType: "$metalTypeInfo.description"
          }
        }
      ]);

      // --------------------------------------------------
      // 6️⃣ Draft Logs (unchanged)
      // --------------------------------------------------
      const draftLogs = await InventoryLog.find({
        stockCode: new mongoose.Types.ObjectId(inventoryId),
        isDraft: true,
        isPurityDifferenceEntry: { $ne: true } // Exclude purity difference entries (only for reports)
      })
        .populate("draftId", "draftNumber transactionId status")
        .populate("party", "customerName accountCode")
        .sort({ createdAt: -1 })
        .lean();

      const result = logs?.[0] || null;
      if (result) result.draftLogs = draftLogs || [];

      return result;

    } catch (err) {
      throw createAppError(
        "Failed to fetch inventory",
        500,
        "FETCH_SINGLE_ERROR"
      );
    }
  }



  static async addInitialInventory(metal, createdBy) {
    try {
      // 1. Create inventory entry
      const inventory = new Inventory({
        metal: metal._id,
        pcs: metal.pcs,
        pcsCount: 0,
        pcsValue: metal.totalValue,
        grossWeight: 0,
        pureWeight: 0,
        purity: metal.karat?.standardPurity || 0,
        status: "active",
        isActive: true,
        createdBy,
      });

      const savedInventory = await inventory.save();

      // 2. Add inventory log
      await InventoryLog.create({
        code: metal.code,
        pcs: 0,
        stockCode: metal._id,
        voucherCode: metal.voucherCode || "INITIAL",
        voucherDate: metal.voucherDate || new Date(),
        grossWeight: 0,
        action: "add",
        transactionType: "initial",
        createdBy: createdBy,
        note: "Initial inventory record created",
      });

      return savedInventory;
    } catch (error) {
      throw createAppError(
        "Error while saving to database",
        500,
        "DATABASE_ERROR"
      );
    }
  }

  static async updateInventoryByFrontendInput({
    metalId,
    grossWeight,
    pieces,
    purity,
    pureWeight,
    avgMakingRate,
    avgMakingAmount,
    voucherDate,
    voucher,
    goldBidPrice,
    adminId
  }) {
    //log for debugging
    try {
      if (!metalId) {
        throw createAppError(
          "Missing metalId in input",
          400,
          "MISSING_INPUT"
        );
      }

      const inventory = await Inventory.findOne({
        metal: new mongoose.Types.ObjectId(metalId),
      });

      if (!inventory) {
        throw createAppError(
          `Inventory not found for metal ID: ${metalId}`,
          404,
          "INVENTORY_NOT_FOUND"
        );
      }
      const metal = await MetalStock.findById(metalId);
      if (!metal) {
        throw createAppError(
          `Metal not found for ID: ${metalId}`,
          404,
          "METAL_NOT_FOUND"
        );
      }

      // first clean the inventoryLog based on the voucher as well remove registry entries
      await InventoryLog.deleteMany({ voucherCode: voucher.voucherCode });
      await Registry.deleteMany({ reference: voucher.voucherCode });

      let description = "";
      let registryValue = 0;

      const isAddition = grossWeight >= 0 && pieces >= 0;
      const qty = grossWeight !== 0 ? grossWeight : pieces;

      // no pcs or gross weight distinction
      inventory.grossWeight += grossWeight;
      inventory.pcsCount += pieces;
      description = `Inventory ${isAddition ? "added" : "removed"}: ${metal.code
        } - ${Math.abs(qty)} pieces & ${metal.totalValue} grams`;
      registryValue = Math.abs(qty) * (metal.pricePerPiece || 0);

      inventory.pureWeight = pureWeight
      description = `Inventory ${isAddition ? "added" : "removed"}: ${metal.code
        } - ${Math.abs(qty)} grams`;
      registryValue = Math.abs(qty) * (metal.pricePerGram || 0);

      const savedInventory = await inventory.save();


      const invLog = await InventoryLog.create({
        code: metal.code,
        transactionType: "opening",
        pcs: pieces,
        stockCode: metal._id,
        voucherCode: voucher?.voucherCode || "",
        voucherType: voucher?.voucherType || "",
        voucherDate: voucher?.voucherDate || new Date(),
        grossWeight: Math.abs(grossWeight),
        pcs: Math.abs(pieces),
        action: isAddition ? "add" : "remove",
        createdBy: adminId,
        note: `Inventory ${isAddition ? "added" : "removed"} by admin.`,
        purity: purity,
        avgMakingRate: avgMakingRate,
        avgMakingAmount: avgMakingAmount,
        premiumDiscountAmount: 0,
        premiumDiscountRate: 0,
        purityDifference: 0,
        isPurityDifferenceEntry: false,
      });

      const res = await this.createRegistryEntry({
        transactionType: "opening",
        transactionId: await Registry.generateTransactionId(),
        metalId: metalId,
        InventoryLogID: invLog._id,
        type: "GOLD_STOCK",
        goldBidValue: goldBidPrice,
        description: `OPENING STOCK FOR ${metal.code}`,
        value: grossWeight,
        isBullion: true,
        credit: grossWeight,
        reference: voucher.voucherCode,
        createdBy: adminId,
        purity: inventory.purity,
        grossWeight: grossWeight,
        pureWeight,
      });

      if (avgMakingAmount > 0) {
        const res = await this.createRegistryEntry({
          transactionType: "opening",
          transactionId: await Registry.generateTransactionId(),
          metalId: metalId,
          InventoryLogID: invLog._id,
          type: "MAKING_CHARGES",
          goldBidValue: goldBidPrice,
          description: ` Making Charges For ${metal.code} for OPENING STOCK`,
          value: avgMakingAmount,
          isBullion: true,
          credit: avgMakingAmount,
          reference: voucher.voucherCode,
          createdBy: adminId,
          purity: inventory.purity,
          grossWeight: grossWeight,
          pureWeight,
        });
      }

      return savedInventory;
    } catch (error) {
      if (error.name === "AppError") throw error;
      throw createAppError(
        error.message || "Inventory update failed",
        500,
        "INVENTORY_UPDATE_ERROR"
      );
    }
  }

  static async updateInventory(transaction, isSale, admin, session = null) {
    try {
      const updated = [];
      // Cache branch negative stock control settings to avoid repeated queries
      const branchNegativeStockCache = new Map();

      for (const item of transaction.stockItems || []) {
        const metalId = new mongoose.Types.ObjectId(item.stockCode?._id || item.stockCode);
        if (!metalId) continue;

        // Load inventory + metal in parallel
        const [inventory, metal] = await Promise.all([
          Inventory.findOne({ metal: metalId }).session(session),
          MetalStock.findById(metalId).session(session),
        ]);

        if (!inventory) {
          throw createAppError(
            `Inventory not found for metal: ${item.stockCode?.code || metalId}`,
            404,
            "INVENTORY_NOT_FOUND"
          );
        }

        if (!metal) {
          continue; // skip instead of crashing
        }

        // 🔹 Compute deltas
        const factor = isSale ? -1 : 1;
        const pcsDelta = factor * (item.pieces || 0);
        const weightDelta = factor * (item.grossWeight || 0);

        // Check branch's negative stock control setting (with caching)
        let allowNegativeStock = true; // Default to true (allow negative stock)

        if (metal.branch) {
          const branchId = metal.branch.toString();

          // Check cache first
          if (!branchNegativeStockCache.has(branchId)) {
            try {
              const branch = await BranchMaster.findById(metal.branch).session(session);
              if (branch) {
                // If negativeStockControl is explicitly false, don't allow negative stock
                // If it's true or undefined, allow negative stock (default behavior)
                allowNegativeStock = branch.negativeStockControl !== false;
                branchNegativeStockCache.set(branchId, allowNegativeStock);
              } else {
                // Branch not found, default to allowing negative stock
                branchNegativeStockCache.set(branchId, true);
              }
            } catch (branchError) {
              console.warn(`⚠️ Failed to fetch branch for negative stock control: ${branchError.message}`);
              // Default to allowing negative stock if branch fetch fails
              branchNegativeStockCache.set(branchId, true);
            }
          } else {
            // Use cached value
            allowNegativeStock = branchNegativeStockCache.get(branchId);
          }
        }

        // Validate stock levels only if negative stock is not allowed
        if (!allowNegativeStock) {
          if (inventory.pcsCount + pcsDelta < 0 || inventory.grossWeight + weightDelta < 0) {
            throw createAppError(
              `Insufficient stock for metal: ${metal.code}`,
              400,
              "INSUFFICIENT_STOCK"
            );
          }
        }

        // Apply deltas
        inventory.pcsCount += pcsDelta;
        inventory.grossWeight += weightDelta;
        inventory.pureWeight = inventory.grossWeight * (inventory.purity || 1);

        await inventory.save({ session });
        updated.push(inventory);

        // Extract party - try party object first, then partyCode
        const partyId = transaction.party?._id || transaction.party || transaction.partyCode || item.party?._id || item.party || item.partyCode || null;
        
        // Extract divisionId from transaction or party (same logic as buildRegistryEntries)
        let divisionId = null;
        if (transaction.division) {
          // Handle division as ObjectId, string, or object with _id
          divisionId = transaction.division._id || transaction.division;
        } else if (transaction.party?.acDefinition?.preciousMetal?.[0]?.division) {
          divisionId = transaction.party.acDefinition.preciousMetal[0].division._id || transaction.party.acDefinition.preciousMetal[0].division;
        } else if (partyId) {
          // Fetch party to get division from acDefinition
          try {
            const Account = (await import("../../models/modules/accountMaster.js")).default;
            const party = await Account.findById(partyId).select('acDefinition.preciousMetal.division').lean().session(session);
            if (party?.acDefinition?.preciousMetal?.[0]?.division) {
              divisionId = party.acDefinition.preciousMetal[0].division._id || party.acDefinition.preciousMetal[0].division;
            }
          } catch (error) {
            // Could not fetch party for division
          }
        }
        
        // Convert divisionId to ObjectId format for Mongoose
        let divisionObjectId = null;
        if (divisionId) {
          try {
            if (divisionId instanceof mongoose.Types.ObjectId) {
              divisionObjectId = divisionId;
            } else if (typeof divisionId === 'string') {
              if (mongoose.Types.ObjectId.isValid(divisionId)) {
                divisionObjectId = new mongoose.Types.ObjectId(divisionId);
              }
            } else if (divisionId._id) {
              if (divisionId._id instanceof mongoose.Types.ObjectId) {
                divisionObjectId = divisionId._id;
              } else if (typeof divisionId._id === 'string' && mongoose.Types.ObjectId.isValid(divisionId._id)) {
                divisionObjectId = new mongoose.Types.ObjectId(divisionId._id);
              }
            } else {
              const divisionStr = String(divisionId);
              if (mongoose.Types.ObjectId.isValid(divisionStr)) {
                divisionObjectId = new mongoose.Types.ObjectId(divisionStr);
              }
            }
          } catch (error) {
            divisionObjectId = null;
          }
        }

        // Extract voucherType
        const voucherType = transaction.voucherType || item.voucherType || transaction.transactionType || "N/A";

        // Extract isDraft and draftId from transaction or item
        const isDraft = transaction.isDraft || item.isDraft || false;
        const draftId = transaction.draftId || item.draftId || null;

        // Log entry - Main entry
        const logEntries = [
          {
            code: metal.code,
            stockCode: metal._id,
            voucherCode: transaction.voucherNumber || item.voucherNumber || `TX-${transaction._id}`,
            voucherDate: transaction.voucherDate || new Date(),
            voucherType: voucherType,
            grossWeight: item.grossWeight || 0,
            party: partyId,
            division: divisionObjectId, // Add division to inventory log
            purity: item.purity || 0,
            avgMakingAmount: item.makingUnit?.makingAmount || 0,
            avgMakingRate: item.makingUnit?.makingRate || 0,
            premiumDiscountAmount: item.premiumDiscount?.type === "discount" 
              ? -(Math.abs(item.premiumDiscount?.amount || 0)) // Discount = negative
              : Math.abs(item.premiumDiscount?.amount || 0), // Premium = positive
            premiumDiscountRate: item.premiumDiscount?.rate || 0,
            purityDifference: item.purityDifference || 0,
            isPurityDifferenceEntry: false,
            action: isSale ? "remove" : "add",
            transactionType:
              transaction.transactionType ||
              item.transactionType ||
              (isSale ? "sale" : "purchase"),
            createdBy: transaction.createdBy || admin || null,
            pcs: item.pieces,
            isDraft: isDraft,
            draftId: draftId,
            note: isSale
              ? "Inventory reduced due to sale transaction"
              : "Inventory increased due to purchase transaction",
          },
        ];

        // Create separate InventoryLog entry for purity difference gain/loss
        const purityDiff = item.purityDifference || 0;
        if (purityDiff !== 0) {
          // Fetch the Registry entry with type "PURITY_DIFFERENCE" for this transaction
          // Match by metalTransactionId, type, and party to find the correct registry entry
          const purityDiffRegistry = await Registry.findOne({
            metalTransactionId: transaction._id,
            type: "PURITY_DIFFERENCE",
            party: partyId || transaction.party?._id || transaction.party || transaction.partyCode,
          }).session(session);

          // Determine action based on registry debit/credit
          // If debit > 0 → Gain → action = "add"
          // If credit > 0 → Loss → action = "remove"
          let action = "add"; // Default
          let isGain = true;
          
          if (purityDiffRegistry) {
            if (purityDiffRegistry.debit > 0) {
              action = "add"; // Gain
              isGain = true;
            } else if (purityDiffRegistry.credit > 0) {
              action = "remove"; // Loss
              isGain = false;
            } else {
              // Fallback to purityDifference value if registry doesn't have debit/credit
              isGain = purityDiff > 0;
              action = isGain ? "add" : "remove";
            }
          } else {
            // Fallback if registry entry not found yet
            isGain = purityDiff > 0;
            action = isGain ? "add" : "remove";
          }

          logEntries.push({
            code: metal.code,
            stockCode: metal._id,
            voucherCode: transaction.voucherNumber || item.voucherNumber || `TX-${transaction._id}`,
            voucherDate: transaction.voucherDate || new Date(),
            voucherType: voucherType,
            grossWeight: 0, // Purity difference entries don't affect actual weight - only for reporting
            party: partyId,
            division: divisionObjectId, // Add division to purity difference entry
            purity: item.purity || 0,
            avgMakingAmount: 0,
            avgMakingRate: 0,
            premiumDiscountAmount: 0,
            premiumDiscountRate: 0,
            purityDifference: purityDiff,
            isPurityDifferenceEntry: true, // Mark as purity difference entry
            action: action, // Dynamically set based on registry debit/credit
            transactionType:
              transaction.transactionType ||
              item.transactionType ||
              (isSale ? "sale" : "purchase"),
            createdBy: transaction.createdBy || admin || null,
            pcs: 0,
            isDraft: isDraft,
            draftId: draftId,
            note: isGain
              ? `Purity difference gain: ${purityDiff} (for reporting only)`
              : `Purity difference loss: ${Math.abs(purityDiff)} (for reporting only)`,
          });
        }

        await InventoryLog.create(logEntries, { session });
      }

      return updated;
    } catch (err) {
      throw createAppError(
        err?.message || "Failed to update inventory",
        err?.statusCode || 500,
        err?.code || "INVENTORY_UPDATE_FAILED"
      );
    }
  }


  static async createRegistryEntry({
    transactionType,
    transactionId,
    metalId,
    InventoryLogID,
    type,
    goldBidValue,
    description,
    value,
    debit = 0,
    credit = 0,
    reference = null,
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
        assetType: "XAU",
        transactionId,
        metalId,
        InventoryLogID,
        costCenter,
        type,
        goldBidValue,
        description,
        goldDebit: value,
        value,
        debit: value,
        credit: 0,
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
      // Don't throw error to prevent inventory update from failing
    }
  }
}

export default InventoryService;
