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
        // Inventory Log
        await InventoryLog.create(
          [
            {
              code: metal.code,
              stockCode: metal._id,
              voucherCode:
                transaction.voucherNumber || item.voucherNumber || "",
              voucherDate: transaction.voucherDate || item.voucherDate || "",
              transactionType: transaction.transactionType,
              pcs: item.pieces || 0,
              grossWeight: item.grossWeight || 0,
              pureWeight: (item.grossWeight * item.purity) / 100,
              action: isSale ? "remove" : "add",
              createdAt: new Date(),
            },
          ],
          { session }
        );
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
      const logs = await InventoryLog.find().sort({ createdAt: -1 });
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
    console.log("inventoryId", inventoryId);
    console.log("Fetching logs for inventoryId", inventoryId);
    try {
      const logs = await InventoryLog.find({ stockCode: new mongoose.Types.ObjectId(inventoryId) });
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
      console.log("[GOLD_BALANCE] Starting gold balance calculation from inventory logs...");

      // First, check total logs count
      const totalLogs = await InventoryLog.countDocuments({});
      const nonDraftLogs = await InventoryLog.countDocuments({ isDraft: { $ne: true } });
      console.log(`[GOLD_BALANCE] Total logs: ${totalLogs}, Non-draft logs: ${nonDraftLogs}`);

      const pipeline = [
        // 1. Filter out draft logs (only finalized transactions)
        {
          $match: {
            isDraft: { $ne: true }
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

      console.log("[GOLD_BALANCE] Executing aggregation pipeline...");

      // Execute the full pipeline
      const stockBalances = await InventoryLog.aggregate(pipeline);
      console.log(`[GOLD_BALANCE] Aggregation completed. Found ${stockBalances.length} stocks with positive balance`);

      // Also get all balances (including negative) for debugging
      const pipelineAllBalances = [
        ...pipeline.slice(0, -4), // Everything before the positive filter
        {
          $project: {
            _id: 0,
            stockCode: "$_id",
            stockName: 1,
            totalGrossWeight: { $round: ["$totalGrossWeight", 2] },
            totalPureWeight: { $round: ["$totalPureWeight", 2] }
          }
        },
        { $sort: { totalPureWeight: -1 } }
      ];
      const allBalances = await InventoryLog.aggregate(pipelineAllBalances);
      console.log(`[GOLD_BALANCE] All balances (including negative/zero): ${allBalances.length} stocks`);
      if (allBalances.length > 0) {
        console.log("[GOLD_BALANCE] All balances:", JSON.stringify(allBalances, null, 2));
      }

      // Debug: Log sample results
      if (stockBalances.length > 0) {
        console.log("[GOLD_BALANCE] Sample stock balances:", JSON.stringify(stockBalances.slice(0, 3), null, 2));
      } else {
        console.log("[GOLD_BALANCE] WARNING: No stocks found with positive balance!");

        // Debug: Check what's happening before the final filter
        const debugPipeline = [
          {
            $match: {
              isDraft: { $ne: true }
            }
          },
          {
            $lookup: {
              from: "metalstocks",
              localField: "stockCode",
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
            $addFields: {
              effectivePurity: {
                $cond: [
                  { $gt: [{ $ifNull: ["$purity", 0] }, 0] },
                  { $divide: [{ $toDouble: { $ifNull: ["$purity", 0] } }, 100] },
                  {
                    $cond: [
                      { $gt: [{ $ifNull: ["$stock.standardPurity", 0] }, 0] },
                      { $toDouble: { $ifNull: ["$stock.standardPurity", 0] } },
                      {
                        $cond: [
                          { $gt: [{ $ifNull: ["$karatInfo.standardPurity", 0] }, 0] },
                          { $divide: [{ $toDouble: { $ifNull: ["$karatInfo.standardPurity", 0] } }, 100] },
                          0
                        ]
                      }
                    ]
                  }
                ]
              },
              calculatedPureWeight: {
                $multiply: [
                  { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                  {
                    $cond: [
                      { $gt: [{ $ifNull: ["$purity", 0] }, 0] },
                      { $divide: [{ $toDouble: { $ifNull: ["$purity", 0] } }, 100] },
                      {
                        $cond: [
                          { $gt: [{ $ifNull: ["$stock.standardPurity", 0] }, 0] },
                          { $toDouble: { $ifNull: ["$stock.standardPurity", 0] } },
                          {
                            $cond: [
                              { $gt: [{ $ifNull: ["$karatInfo.standardPurity", 0] }, 0] },
                              { $divide: [{ $toDouble: { $ifNull: ["$karatInfo.standardPurity", 0] } }, 100] },
                              0
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          },
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
              },
              sampleLogs: { $push: { action: "$action", grossWeight: "$grossWeight", purity: "$purity", effectivePurity: "$effectivePurity", calculatedPureWeight: "$calculatedPureWeight", stockPurity: "$stock.standardPurity", karatPurity: "$karatInfo.standardPurity" } }
            }
          },
          { $limit: 5 }
        ];

        const debugResults = await InventoryLog.aggregate(debugPipeline);
        console.log("[GOLD_BALANCE] DEBUG - Sample grouped results before positive filter:", JSON.stringify(debugResults, null, 2));
      }

      // Calculate total pure gold
      const totalPureGold = stockBalances.reduce((sum, stock) => {
        return sum + (stock.totalPureWeight || 0);
      }, 0);

      // Separate balances for logging
      const positiveBalances = stockBalances.filter(stock => (stock.totalPureWeight || 0) > 0);
      const negativeBalances = stockBalances.filter(stock => (stock.totalPureWeight || 0) < 0);
      const zeroBalances = stockBalances.filter(stock => (stock.totalPureWeight || 0) === 0);

      console.log(`[GOLD_BALANCE] Total stocks: ${stockBalances.length}`);
      console.log(`[GOLD_BALANCE] Positive: ${positiveBalances.length}, Negative: ${negativeBalances.length}, Zero: ${zeroBalances.length}`);
      console.log(`[GOLD_BALANCE] Total pure gold calculated: ${totalPureGold}`);

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

      console.log("[GOLD_BALANCE] Final result:", JSON.stringify(result, null, 2));

      return result;
    } catch (error) {
      console.error("[GOLD_BALANCE] Error in aggregation:", error);
      console.error("[GOLD_BALANCE] Error stack:", error.stack);
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
      console.log(error)
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
      console.log("Deleted inventory logs for inventoryId:", inventoryId, "Result:", result);
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
      console.log("Deleted inventory logs for voucherId:", voucherId, "Result:", result);

      const registryResult = await Registry.deleteMany({ reference: voucherId });
      console.log("Deleted registry entries for voucherId:", voucherId, "Result:", registryResult);

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
      console.log("Deleted inventory logs for voucherId:", voucherId, "Result:", result);

      const registryResult = await Registry.deleteMany({ reference: voucherId });
      console.log("Deleted registry entries for voucherId:", voucherId, "Result:", registryResult);

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
        isDraft: true
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
      console.log("Updating inventory for metal:", voucher);

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


      console.log("Registry entry created:", res);
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

        console.log("🔍 Looking for MetalStock with ID:", metalId);

        // Load inventory + metal in parallel
        const [inventory, metal] = await Promise.all([
          Inventory.findOne({ metal: metalId }).session(session),
          MetalStock.findById(metalId).session(session),
        ]);

        console.log("🔧 Inventory:", inventory ? "found ✅" : "missing ❌");
        console.log("🔧 MetalStock:", metal ? metal.code : "null");

        if (!inventory) {
          throw createAppError(
            `Inventory not found for metal: ${item.stockCode?.code || metalId}`,
            404,
            "INVENTORY_NOT_FOUND"
          );
        }

        if (!metal) {
          console.warn(`⚠️ MetalStock not found for ID: ${metalId}`);
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
        console.log(JSON.stringify(transaction));

        // Log entry
        await InventoryLog.create(
          [
            {
              code: metal.code,
              stockCode: metal._id,
              voucherCode: transaction.voucherNumber || item.voucherNumber || `TX-${transaction._id}`,
              voucherDate: transaction.voucherDate || new Date(),
              voucherType: transaction.voucherType || item.voucherType || "N/A",
              grossWeight: item.grossWeight || 0,
              party: transaction.party || item.party || null,
              avgMakingAmount: item.makingUnit?.makingAmount || 0,
              avgMakingRate: item.makingUnit?.makingRate || 0,
              action: isSale ? "remove" : "add",
              transactionType:
                transaction.transactionType ||
                item.transactionType ||
                (isSale ? "sale" : "purchase"),
              createdBy: transaction.createdBy || admin || null,
              pcs: item.pieces,
              note: isSale
                ? "Inventory reduced due to sale transaction"
                : "Inventory increased due to purchase transaction",
            },
          ],
          { session }
        );
      }

      console.log("✅ [updateInventory] Completed successfully");
      return updated;
    } catch (err) {
      console.error("❌ [Inventory Update Error]", {
        message: err?.message,
        name: err?.name,
        code: err?.code,
        stack: err?.stack,
      });

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
      console.error("Failed to create registry entry:", error);
      // Don't throw error to prevent inventory update from failing
      // Log the error for debugging purposes
    }
  }
}

export default InventoryService;
