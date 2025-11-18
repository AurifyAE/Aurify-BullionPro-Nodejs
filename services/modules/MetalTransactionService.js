import mongoose from "mongoose";
import MetalTransaction from "../../models/modules/MetalTransaction.js";
import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import { createAppError } from "../../utils/errorHandler.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import Inventory from "../../models/modules/inventory.js";
import MetalStock from "../../models/modules/MetalStock.js";
import InventoryService from "./inventoryService.js";
import FixingPrice from "../../models/modules/FixingPrice.js";

class MetalTransactionService {
  static async createMetalTransaction(transactionData, adminId) {
    const session = await mongoose.startSession();
    let createdTransaction;
    try {
      await session.withTransaction(async () => {
        this.validateTransactionData(transactionData);

        const [party, metalTransaction] = await Promise.all([
          this.validateParty(transactionData.partyCode, session),
          this.createTransaction(transactionData, adminId),
        ]);

        await metalTransaction.save({ session });
        createdTransaction = metalTransaction;
        await Promise.all([
          this.createRegistryEntries(metalTransaction, party, adminId, session),
          this.updateAccountBalances(party, metalTransaction, session),
        ]);

        return metalTransaction;
      });

      return await this.getMetalTransactionById(createdTransaction._id);
    } catch (error) {
      throw this.handleError(error);
    } finally {
      await session.endSession();
    }
  }

  static async validateParty(partyCode, session) {
    const party = await Account.findById(partyCode)
      .select("_id isActive accountCode customerName balances")
      .session(session)
      .lean();

    if (!party?.isActive) {
      throw createAppError("Party not found or inactive", 400, "INVALID_PARTY");
    }
    return party;
  }

  static createTransaction(transactionData, adminId) {
    const transaction = new MetalTransaction({
      ...transactionData,
      createdBy: adminId,
    });

    // if (!transactionData.totalSummary?.totalAmountAED) {
    //   transaction.calculateSessionTotals();
    // }

    return transaction;
  }

  static async createRegistryEntries(
    metalTransaction,
    party,
    adminId,
    session
  ) {
    const entries = this.buildRegistryEntries(metalTransaction, party, adminId);
    if (entries.length === 0) return [];
    return await Registry.insertMany(entries, { session, ordered: false });
  }

  static async deleteRegistryEntry(metalTransaction, session = null) {
    try {
      const query = Registry.deleteMany({
        metalTransactionId: metalTransaction._id,
      });

      // Apply session if provided
      if (session) {
        query.session(session);
      }

      const result = await query;
      console.log(
        `[DELETE_REGISTRY] Deleted ${result.deletedCount} registry entries for transaction ${metalTransaction._id}`
      );
      return result;
    } catch (error) {
      console.error(
        `[DELETE_REGISTRY_ERROR] Failed to delete registry entries for transaction ${metalTransaction._id}`,
        error
      );
      throw createAppError(
        `Failed to delete registry entries: ${error.message}`,
        500,
        "DELETE_REGISTRY_FAILED"
      );
    }
  }
  static async deleteStcoks(voucherCode) {
    try {
      // Delete Inventory Logs
      await InventoryLog.deleteMany({ voucherCode });
    } catch (error) {
      console.error(
        `[CLEANUP_ERROR] Failed to delete data for voucher: ${voucherCode}`,
        error
      );
      throw error;
    }
  }

  static async updateInventory(transaction, isSale, admin) {
    try {
      const updated = [];

      for (const item of transaction.stockItems || []) {
        const metalId = item.stockCode?._id;
        if (!metalId) continue;

        const [inventory, metal] = await Promise.all([
          Inventory.findOne({ metal: new mongoose.Types.ObjectId(metalId) }),
          MetalStock.findById(metalId),
        ]);

        if (!inventory) {
          throw createAppError(
            `Inventory not found for metal: ${item.stockCode.code}`,
            404,
            "INVENTORY_NOT_FOUND"
          );
        }

        const factor = isSale ? -1 : 1;
        const pcsDelta = factor * (item.pieces || 0);
        const weightDelta = factor * (item.grossWeight || 0);

        // Optional: stock validation
        // if (inventory.pcsCount + pcsDelta < 0 || inventory.grossWeight + weightDelta < 0) {
        //   throw createAppError(`Insufficient stock for metal: ${metal.code}`, 400, "INSUFFICIENT_STOCK");
        // }

        inventory.pcsCount += pcsDelta;
        inventory.grossWeight += weightDelta;
        inventory.pureWeight = (inventory.grossWeight * inventory.purity) / 100;

        await inventory.save();
        updated.push(inventory);

        // Inventory Log
        await InventoryLog.create({
          code: metal.code,
          stockCode: metal._id,
          voucherCode: transaction.voucherNumber || item.voucherNumber || "",
          voucherDate: transaction.voucherDate || new Date(),
          grossWeight: item.grossWeight || 0,
          action: isSale ? "remove" : "add",
          transactionType:
            transaction.transactionType || (isSale ? "sale" : "purchase"),
          createdBy: transaction.createdBy || admin || null,
          pcs: !!item.pieces, // whether it's piece-based
          note: isSale
            ? "Inventory reduced due to sale transaction"
            : "Inventory increased due to purchase transaction",
        });
      }

      return updated;
    } catch (error) {
      if (error.name === "AppError") throw error;
      throw createAppError(
        error.message || "Failed to update inventory",
        500,
        "INVENTORY_UPDATE_FAILED"
      );
    }
  }

  static buildRegistryEntries(metalTransaction, party, adminId) {
    const {
      id,
      transactionType,
      fixed,
      unfix,
      hedge,
      stockItems = [],
      totalSummary = {},
      voucherDate,
      voucherNumber,
      partyCurrency,
      otherCharges = [],
    } = metalTransaction;

    const baseTransactionId = this.generateTransactionId();
    const mode = this.getTransactionMode(fixed, unfix);

    const entries = [];
    // Loop over each stock item
    for (let i = 0; i < stockItems.length; i++) {
      const item = stockItems[i];
      // Build itemTotals from stockItems
      const itemTotals = this.calculateTotals([item], totalSummary);
  

      switch (transactionType) {
        case "purchase":
          entries.push(
            ...this.buildPurchaseEntries(
              mode,
              hedge,
              id,
              itemTotals,
              party,
              baseTransactionId,
              voucherDate,
              voucherNumber,
              adminId,
              item,
              partyCurrency,
              totalSummary,
              otherCharges
            )
          );
          break;

        case "sale":
          entries.push(
            ...this.buildSaleEntries(
              mode,
              hedge,
              id,
              itemTotals,
              party,
              baseTransactionId,
              voucherDate,
              voucherNumber,
              adminId,
              item,
              partyCurrency,
              totalSummary,
              otherCharges
            )
          );
          break;

        case "purchaseReturn":
          entries.push(
            ...this.buildPurchaseReturnEntries(
              mode,
              _id,
              totals,
              party,
              baseTransactionId,
              voucherDate,
              voucherNumber,
              adminId,
              item
            )
          );
          break;

        case "saleReturn":
          entries.push(
            ...this.buildSaleReturnEntries(
              mode,
              _id,
              totals,
              party,
              baseTransactionId,
              voucherDate,
              voucherNumber,
              adminId,
              item
            )
          );
          break;
      }
    }

    return entries.filter(Boolean);
  }

  static getTransactionMode(fixed, unfix) {
    if (fixed && !unfix) return "fix";
    if (unfix && !fixed) return "unfix";
    if (!fixed && !unfix) return "unfix";
    return "fix";
  }

  static buildPurchaseEntries(
    mode,
    hedge,
    metalTransactionId,
    totals,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item,
    partyCurrency,
    totalSummary,
    otherCharges = []
  ) {
    let transactionType = "Purchase";
    if (mode === "fix") {
      FixingPrice.create({
        transaction: metalTransactionId,
        transactionType,
        rateInGram: item.metalRateRequirements?.rateInGram || 450,
        bidValue: item.metalRateRequirements?.bidValue || 2500,
        currentBidValue: item.metalRateRequirements?.currentBidValue || 2500,
        entryBy: adminId,
        metalRate: item.metalRate || null,
        status: "active",
        fixedAt: new Date(),
      }).catch((err) =>
        console.error("❌ Error creating FixingPrice:", err.message)
      );
    }
    return mode === "fix"
      ? this.buildPurchaseFixEntries(
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item,
          partyCurrency,
          totalSummary,
          otherCharges,
          transactionType
        )
      : this.buildPurchaseUnfixEntries(
          hedge,
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item,
          partyCurrency,
          totalSummary,
          otherCharges,
          transactionType
        );
  }

  static buildSaleEntries(
    mode,
    hedge,
    metalTransactionId,
    totals,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item,
    partyCurrency,
    totalSummary,
    otherCharges = []
  ) {
    let transactionType = "Sale";
    if (mode === "fix") {
      FixingPrice.create({
        transaction: metalTransactionId,
        transactionType,
        rateInGram: item.metalRateRequirements?.rateInGram || 450,
        bidValue: item.metalRateRequirements?.bidValue || 2500,
        currentBidValue: item.metalRateRequirements?.currentBidValue || 2500,
        entryBy: adminId,
        metalRate: item.metalRate || null,
        status: "active",
        fixedAt: new Date(),
      }).catch((err) =>
        console.error("❌ Error creating FixingPrice:", err.message)
      );
    }
    return mode === "fix"
      ? this.buildSaleFixEntries(
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item,
          partyCurrency,
          totalSummary,
          otherCharges,
          transactionType
        )
      : this.buildSaleUnfixEntries(
          hedge,
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item,
          partyCurrency,
          totalSummary,
          otherCharges,
          transactionType
        );
  }

  static buildPurchaseReturnEntries(
    mode,
    metalTransactionId,
    totals,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item
  ) {
    return mode === "fix"
      ? this.buildPurchaseReturnFixEntries(
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item
        )
      : this.buildPurchaseReturnUnfixEntries(
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item
        );
  }

  static buildSaleReturnEntries(
    mode,
    metalTransactionId,
    totals,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item
  ) {
    return mode === "fix"
      ? this.buildSaleReturnFixEntries(
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item
        )
      : this.buildSaleReturnUnfixEntries(
          totals,
          metalTransactionId,
          party,
          baseTransactionId,
          voucherDate,
          voucherNumber,
          adminId,
          item
        );
  }

  static buildPurchaseFixEntries(
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item,
    partyCurrency,
    totalSummary,
    otherCharges,
    transactionType
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;

    // Purchase-fixing entry
    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "PARTY-GOLD",
          "purchase-fixing",
          `Party gold balance - Purchase from ${partyName}`,
          party._id,
          true,
          totals.pureWeight,
          totals.pureWeight,
          {
            debit: 0,
            goldCredit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.goldValue > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance -  Gold purchase from ${partyName} at a bid value of ${totals.bidValue}`,
          party._id,
          false,
          totals.goldValue,
          totals.goldValue,
          {
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "002",
          "PARTY_MAKING_CHARGES",
          `Party making charges - Purchase from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          totals.makingCharges,
          {
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "MAKING_CHARGES",
          `Making charges - Purchase from ${partyName}`,
          party._id,
          true,
          totals.makingCharges,
          0,
          {
            debit: totals.makingCharges,
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    // === 💱 FX GAIN / LOSS ENTRIES ===
    if (totals.FXGain > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "010", // next code in your sequence
          "FX_EXCHANGE",
          `Foreign Exchange Gain - Purchase from ${partyName}`,
          party._id,
          false, // Gain is credit
          totals.FXGain,
          totals.FXGain, // credit
          {
            debit: 0,
            credit: totals.FXGain,
            cashCredit: totals.FXGain,
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.FXLoss > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "011",
          "FX_EXCHANGE",
          `Foreign Exchange Loss - Purchase from ${partyName}`,
          party._id,
          true, // Loss is debit
          totals.FXLoss,
          0, // no credit
          {
            debit: totals.FXLoss,
            credit: 0,
            cashDebit: totals.FXLoss,
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (Array.isArray(otherCharges) && otherCharges.length > 0) {
      otherCharges.forEach((charge) => {
        const { description, debit, credit, vatDetails } = charge;

        // ---- 1️⃣ Debit side ----
        if (debit?.baseCurrency > 0 && debit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "009",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Debit`,
              debit.account, // ✅ debit account
              false,
              debit.baseCurrency,
              0, // credit
              {
                debit: debit.baseCurrency, // value
                cashDebit: debit.baseCurrency,
                cashCredit: 0,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 2️⃣ Credit side ----
        if (credit?.baseCurrency > 0 && credit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "007",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Credit`,
              credit.account, // ✅ credit account
              false,
              credit.baseCurrency, // value
              credit.baseCurrency, // credit
              {
                debit: 0,
                cashDebit: 0,
                cashCredit: credit.baseCurrency,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 3️⃣ VAT Handling (matches debit/credit accounts) ----
        if (vatDetails?.vatAmount > 0) {
          const vatDescription = `${description || "Other Charge"} - VAT ${
            vatDetails.vatRate || 0
          }%`;

          // VAT Debit Entry
          if (debit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Debit`,
                debit.account, // ✅ VAT debit uses same debit account
                false,
                vatDetails.vatAmount,
                0,
                {
                  debit: vatDetails.vatAmount,
                  cashDebit: vatDetails.vatAmount,
                  cashCredit: 0,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }

          // VAT Credit Entry
          if (credit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Credit`,
                credit.account, // ✅ VAT credit uses same credit account
                false,
                vatDetails.vatAmount,
                vatDetails.vatAmount,
                {
                  debit: 0,
                  cashDebit: 0,
                  cashCredit: vatDetails.vatAmount,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }
        }
      });
    }

    if (totals.vatAmount > 0) {
      const excludeVAT = totals.excludeVAT ?? false;
      const vatOnMaking = totals.vatOnMaking ?? false;

      // ✅ Skip if VAT excluded
      if (!excludeVAT) {
        // ✅ Determine which base value VAT should apply on
        const vatBaseAmount = vatOnMaking
          ? totals.makingCharges
          : totals.goldValue;

        // ✅ PARTY VAT ENTRY (credit side)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "PARTY_VAT_AMOUNT",
            `Party VAT amount - Purchase from ${partyName}`,
            party._id,
            false,
            totals.vatAmount,
            totals.vatAmount,
            {
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount, // ✅ now dynamic based on vatOnMaking
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );

        // ✅ VAT ACCOUNT ENTRY (debit side)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "VAT_AMOUNT",
            `VAT amount - Purchase from ${partyName}`,
            party._id,
            true,
            totals.vatAmount,
            0,
            {
              debit: totals.vatAmount,
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount, // ✅ same logic here
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );
      }
    }

    if (totals.premium > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PARTY_PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          false,
          totals.premium,
          totals.premium,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          true,
          totals.premium,
          0,
          {
            debit: totals.premium,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "PARTY_DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          false,
          totals.discount,
          0,
          {
            debit: totals.discount,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          true,
          totals.discount,
          totals.discount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    // if the purityDiffWeight is not zero then
    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "004",
          "GOLD",
          `Gold inventory - Purchase from ${partyName}`,
          null,
          true,
          totals.pureWeight,
          0,
          {
            debit: totals.pureWeight,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.purityDifference !== 0) {
      const isDebit = totals.purityDifference < 0; // negative = debit, positive = credit
      const absDiff = Math.abs(totals.purityDifference);

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} (${
            totals.purityDifference > 0 ? "Gain" : "Loss"
          } ${totals.purityDifference})`,
          party._id,
          isDebit, // ✅ true if debit (loss), false if credit (gain)
          absDiff, // ✅ value always positive
          !isDebit ? absDiff : 0, // ✅ credit only if positive
          {
            debit: isDebit ? absDiff : 0, // ✅ debit side if loss
            credit: !isDebit ? absDiff : 0, // ✅ credit side if gain
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD_STOCK",
          `Gold stock - Purchase from ${partyName}`,
          party._id,
          true,
          totals.grossWeight,
          0,
          {
            debit: totals.grossWeight,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }

  static buildPurchaseUnfixEntries(
    hedge,
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item,
    partyCurrency,
    totalSummary,
    otherCharges,
    transactionType
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;
    const pureValue =
      typeof totals.pureValue === "number"
        ? totals.pureValue
        : totals.pureWeight;
    const stdPurity =
      typeof totals.stdPurity === "number" ? totals.stdPurity : totals.purity;

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "PARTY-GOLD",
          "purchase-fixing",
          `Party gold balance - Purchase from ${partyName}`,
          party._id,
          true,
          totals.pureWeight,
          totals.pureWeight,
          {
            debit: 0,
            goldCredit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (pureValue > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType, // ✅ correct first arg
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_GOLD_BALANCE",
          `Hedge entry recorded for ${partyName} — ${totals.pureWeight}g gold hedged at bid ${totals.bidValue} USD/oz`,
          party._id,
          false,
          pureValue, // value
          pureValue, // credit
          {
            goldCredit: pureValue, // ✅ make the gold credit explicit
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (hedge) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance debited — Hedge reversal entry for gold purchase from ${partyName}`,
          party._id,
          false,
          totals.goldValue,
          0,
          {
            debit: totals.goldValue,
            goldCredit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance credited — Gold purchase from ${partyName} at bid value ${totals.bidValue}`,
          party._id,
          false,
          totals.goldValue,
          totals.goldValue,
          {
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "HEDGE_ENTRY",
          `Hedge entry recorded for ${partyName} — ${totals.pureWeight}g gold hedged at bid ${totals.bidValue} USD/oz`,
          party._id,
          false,
          totals.pureWeight,
          0,
          {
            debit: totals.pureWeight,
            goldCredit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "002",
          "PARTY_MAKING_CHARGES",
          `Party making charges - Purchase from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          totals.makingCharges,
          {
            goldDebit: pureValue,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "MAKING_CHARGES",
          `Making charges - Purchase from ${partyName}`,
          party._id,
          true,
          totals.makingCharges,
          0,
          {
            debit: totals.makingCharges,
            goldDebit: pureValue,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    // ======================
    // 3) OTHER CHARGES (debit/credit + VAT on those)
    // ======================
    if (Array.isArray(otherCharges) && otherCharges.length > 0) {
      otherCharges.forEach((charge) => {
        const { description, debit, credit, vatDetails } = charge;

        // ---- 1️⃣ Debit side ----
        if (debit?.baseCurrency > 0 && debit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "009",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Debit`,
              debit.account, // ✅ debit account
              false,
              debit.baseCurrency,
              0, // credit
              {
                debit: debit.baseCurrency, // value
                cashDebit: debit.baseCurrency,
                cashCredit: 0,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 2️⃣ Credit side ----
        if (credit?.baseCurrency > 0 && credit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "007",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Credit`,
              credit.account, // ✅ credit account
              false,
              credit.baseCurrency, // value
              credit.baseCurrency, // credit
              {
                debit: 0,
                cashDebit: 0,
                cashCredit: credit.baseCurrency,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 3️⃣ VAT Handling (matches debit/credit accounts) ----
        if (vatDetails?.vatAmount > 0) {
          const vatDescription = `${description || "Other Charge"} - VAT ${
            vatDetails.vatRate || 0
          }%`;

          // VAT Debit Entry
          if (debit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Debit`,
                debit.account, // ✅ VAT debit uses same debit account
                false,
                vatDetails.vatAmount,
                0,
                {
                  debit: vatDetails.vatAmount,
                  cashDebit: vatDetails.vatAmount,
                  cashCredit: 0,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }

          // VAT Credit Entry
          if (credit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Credit`,
                credit.account, // ✅ VAT credit uses same credit account
                false,
                vatDetails.vatAmount,
                vatDetails.vatAmount,
                {
                  debit: 0,
                  cashDebit: 0,
                  cashCredit: vatDetails.vatAmount,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }
        }
      });
    }

    // ======================
    // 4) VAT (unfix: usually no cash effect; keep your logic)
    // ======================
    if (totals.vatAmount > 0) {
      const excludeVAT = totals.excludeVAT ?? false;
      const vatOnMaking = totals.vatOnMaking ?? false;

      if (!excludeVAT) {
        const vatBaseAmount = vatOnMaking
          ? totals.makingCharges
          : totals.goldValue;

        // Party VAT (credit)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "PARTY_VAT_AMOUNT",
            `Party VAT amount - Purchase from ${partyName}`,
            party._id,
            false,
            totals.vatAmount,
            totals.vatAmount,
            {
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount,
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );

        // VAT (debit)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "VAT_AMOUNT",
            `VAT amount - Purchase from ${partyName}`,
            party._id,
            true,
            totals.vatAmount,
            0,
            {
              debit: totals.vatAmount,
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount,
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );
      }
    }

    // ======================
    // 5) PREMIUM / DISCOUNT
    // ======================
    if (totals.premium > 0) {
      // Party premium (credit)
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PARTY_PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          false,
          totals.premium,
          totals.premium,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      // Premium (debit)
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          true,
          totals.premium,
          0,
          {
            debit: totals.premium,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      // Party discount (debit)
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "PARTY_DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          false,
          totals.discount,
          0,
          {
            debit: totals.discount,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      // Discount (credit)
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          true,
          totals.discount,
          totals.discount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    // ======================
    // 6) GOLD INVENTORY (debit)
    // ======================
    if (pureValue > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "004",
          "GOLD",
          `Gold inventory - Purchase from ${partyName}`,
          null,
          true,
          pureValue,
          0,
          {
            debit: pureValue,
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: pureValue,
            purity: stdPurity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    // ======================
    // 7) PURITY DIFFERENCE
    // ======================
    if (totals.purityDifference != 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} : ${totals.purityDifference}`,
          party._id,
          true,
          totals.purityDifference,
          totals.purityDifference > 0 ? totals.purityDifference : 0,
          {
            debit: totals.purityDifference > 0 ? 0 : totals.purityDifference,
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: pureValue,
            purity: stdPurity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    // ======================
    // 8) GOLD STOCK (debit)
    // ======================
    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD_STOCK",
          `Gold stock - Purchase from ${partyName}`,
          party._id,
          true,
          totals.grossWeight,
          0,
          {
            debit: totals.grossWeight,
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: pureValue,
            purity: stdPurity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }

  static buildPurchaseReturnFixEntries(
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;

    // Purchase-return-fixing entry
    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "PARTY-GOLD",
          "purchase-fixing",
          `Party gold balance - Purchase return from ${partyName}`,
          party._id,
          true,
          totals.pureWeight,
          0,
          {
            debit: totals.pureWeight,
            goldDebit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }
    if (totals.purityDiffWeight != 0) {
      // if purity difference -negative then debit else credit
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} : ${totals.purityDiffWeight}`,
          null,
          true,
          totals.purityDiffWeight,
          totals.purityDiffWeight < 0 ? totals.purityDiffWeight : 0, // credit
          {
            debit: totals.purityDiffWeight < 0 ? 0 : totals.purityDiffWeight,
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.totalAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance - Purchase return from ${partyName}`,
          party._id,
          false,
          totals.totalAmount,
          0,
          {
            debit: totals.totalAmount,
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "002",
          "MAKING_CHARGES",
          `Party making charges - Purchase return from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          0,
          {
            debit: totals.makingCharges,
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.otherChargesAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "008",
          "OTHER_CHARGES",
          `${item.otherCharges.description} charges - Purchase from ${partyName}`,
          party._id,
          false,
          totals.otherChargesAmount,
          totals.otherChargesAmount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.vatAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "009",
          "VAT_AMOUNT",
          `Party Vat amount - Purchase from ${partyName}`,
          party._id,
          false,
          totals.vatAmount,
          0,
          {
            debit: totals.vatAmount,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.premium > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "003",
          "PREMIUM",
          `Party premium - Purchase return from ${partyName}`,
          party._id,
          false,
          totals.premium,
          0,
          {
            debit: totals.premium,
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Purchase return from ${partyName}`,
          party._id,
          false,
          totals.discount,
          totals.discount,
          {
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "004",
          "GOLD",
          `Gold inventory - Purchase return from ${partyName}`,
          null,
          true,
          totals.standerdPureWeight,
          totals.standerdPureWeight,
          {
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.standerdPureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD_STOCK",
          `Gold stock - Purchase return from ${partyName}`,
          null,
          true,
          totals.grossWeight,
          totals.grossWeight,
          {
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }

  static buildPurchaseReturnUnfixEntries(
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_GOLD_BALANCE",
          `Party gold balance - Unfix purchase return from ${partyName}`,
          party._id,
          false,
          totals.pureWeight,
          0,
          {
            debit: totals.pureWeight,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "003",
          "MAKING_CHARGES",
          `Party making charges - Unfix purchase return from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          0,
          {
            debit: totals.makingCharges,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.purityDiffWeight != 0) {
      // if purity difference -negative then debit else credit
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} : ${totals.purityDiffWeight}`,
          null,
          true,
          totals.purityDiffWeight,
          totals.purityDiffWeight < 0 ? totals.purityDiffWeight : 0, // credit
          {
            debit: totals.purityDiffWeight < 0 ? 0 : totals.purityDiffWeight,
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.otherChargesAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "008",
          "OTHER_CHARGES",
          `${item.otherCharges.description} charges - Purchase from ${partyName}`,
          party._id,
          false,
          totals.otherChargesAmount,
          0,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.vatAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "009",
          "VAT_AMOUNT",
          `Party Vat amount - Purchase from ${partyName}`,
          party._id,
          false,
          totals.vatAmount,
          totals.vatAmount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.premium > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "004",
          "PREMIUM",
          `Party premium - Unfix purchase return from ${partyName}`,
          party._id,
          false,
          totals.premium,
          0,
          { debit: totals.premium, goldBidValue },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Unfix purchase return from ${partyName}`,
          party._id,
          false,
          totals.discount,
          totals.discount,
          {},
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD",
          `Gold inventory - Unfix purchase return from ${partyName}`,
          null,
          true,
          totals.standerdPureWeight,
          totals.standerdPureWeight,
          {},
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "006",
          "GOLD_STOCK",
          `Gold stock - Unfix purchase return from ${partyName}`,
          null,
          true,
          totals.grossWeight,
          totals.grossWeight,
          {
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }

  static buildSaleFixEntries(
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item,
    partyCurrency,
    totalSummary,
    otherCharges,
    transactionType
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;

    // Sales-fixing entry
    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "PARTY-GOLD",
          "sales-fixing",
          `Party gold balance - Sale to ${partyName}`,
          party._id,
          true,
          totals.pureWeight,
          0,
          {
            debit: totals.pureWeight,
            goldDebit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.goldValue > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance - Sale to ${partyName} at a bid value of ${totals.bidValue}`,
          party._id,
          false,
          totals.goldValue,
          0,
          {
            debit: totals.goldValue,
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PARTY_MAKING_CHARGES",
          `Making charges - Purchase from ${partyName}`,
          party._id,
          true,
          totals.makingCharges,
          0,
          {
            debit: totals.makingCharges,
            goldCredit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "002",
          "MAKING_CHARGES",
          `Party making charges - Purchase from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          totals.makingCharges,
          {
            debit: 0,
            goldDebit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    // === 💱 FX GAIN / LOSS ENTRIES ===
    if (totals.FXGain > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "010", // next code in your sequence
          "FX_EXCHANGE",
          `Foreign Exchange Gain - Purchase from ${partyName}`,
          party._id,
          false, // Gain is credit
          totals.FXGain,
          totals.FXGain, // credit
          {
            debit: 0,
            credit: totals.FXGain,
            cashCredit: totals.FXGain,
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.FXLoss > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "011",
          "FX_EXCHANGE",
          `Foreign Exchange Loss - Purchase from ${partyName}`,
          party._id,
          true, // Loss is debit
          totals.FXLoss,
          0, // no credit
          {
            debit: totals.FXLoss,
            credit: 0,
            cashDebit: totals.FXLoss,
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (Array.isArray(otherCharges) && otherCharges.length > 0) {
      otherCharges.forEach((charge) => {
        const { description, debit, credit, vatDetails } = charge;

        // ---- 1️⃣ Debit side ----
        if (debit?.baseCurrency > 0 && debit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "009",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Debit`,
              debit.account, // ✅ debit account
              false,
              debit.baseCurrency,
              0, // credit
              {
                debit: debit.baseCurrency, // value
                cashDebit: debit.baseCurrency,
                cashCredit: 0,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 2️⃣ Credit side ----
        if (credit?.baseCurrency > 0 && credit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "007",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Credit`,
              credit.account, // ✅ credit account
              false,
              credit.baseCurrency, // value
              credit.baseCurrency, // credit
              {
                debit: 0,
                cashDebit: 0,
                cashCredit: credit.baseCurrency,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 3️⃣ VAT Handling (matches debit/credit accounts) ----
        if (vatDetails?.vatAmount > 0) {
          const vatDescription = `${description || "Other Charge"} - VAT ${
            vatDetails.vatRate || 0
          }%`;

          // VAT Debit Entry
          if (debit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Debit`,
                debit.account, // ✅ VAT debit uses same debit account
                false,
                vatDetails.vatAmount,
                0,
                {
                  debit: vatDetails.vatAmount,
                  cashDebit: vatDetails.vatAmount,
                  cashCredit: 0,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }

          // VAT Credit Entry
          if (credit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Credit`,
                credit.account, // ✅ VAT credit uses same credit account
                false,
                vatDetails.vatAmount,
                vatDetails.vatAmount,
                {
                  debit: 0,
                  cashDebit: 0,
                  cashCredit: vatDetails.vatAmount,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }
        }
      });
    }

    if (totals.vatAmount > 0) {
      const excludeVAT = totals.excludeVAT ?? false;
      const vatOnMaking = totals.vatOnMaking ?? false;

      // ✅ Skip if VAT excluded
      if (!excludeVAT) {
        // ✅ Determine which base value VAT should apply on
        const vatBaseAmount = vatOnMaking
          ? totals.makingCharges
          : totals.goldValue;

        // ✅ PARTY VAT ENTRY (credit side)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "VAT_AMOUNT",
            `Party VAT amount - Purchase from ${partyName}`,
            party._id,
            false,
            totals.vatAmount,
            totals.vatAmount,
            {
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount, // ✅ now dynamic based on vatOnMaking
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );

        // ✅ VAT ACCOUNT ENTRY (debit side)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "PARTY_VAT_AMOUNT",
            `VAT amount - Purchase from ${partyName}`,
            party._id,
            true,
            totals.vatAmount,
            0,
            {
              debit: totals.vatAmount,
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount, // ✅ same logic here
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );
      }
    }

    if (totals.premium > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          false,
          totals.premium,
          totals.premium,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PARTY_PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          true,
          totals.premium,
          0,
          {
            debit: totals.premium,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          false,
          totals.discount,
          0,
          {
            debit: totals.discount,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "PARTY_DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          true,
          totals.discount,
          totals.discount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "004",
          "GOLD",
          `Gold inventory - Sale to ${partyName}`,
          null,
          true,
          totals.pureWeight,
          totals.pureWeight,
          {
            goldCredit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.purityDifference !== 0) {
      const isDebit = totals.purityDifference < 0; // negative = debit, positive = credit
      const absDiff = Math.abs(totals.purityDifference);

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} (${
            totals.purityDifference > 0 ? "Gain" : "Loss"
          } ${totals.purityDifference})`,
          party._id,
          isDebit, // ✅ true if debit (loss), false if credit (gain)
          absDiff, // ✅ value always positive
          !isDebit ? absDiff : 0, // ✅ credit only if positive
          {
            debit: isDebit ? absDiff : 0, // ✅ debit side if loss
            credit: !isDebit ? absDiff : 0, // ✅ credit side if gain
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD_STOCK",
          `Gold stock - Sale to ${partyName}`,
          null,
          true,
          totals.grossWeight,
          totals.grossWeight,
          {
            goldCredit: totals.grossWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }

  static buildSaleUnfixEntries(
    hedge,
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item,
    partyCurrency,
    totalSummary,
    otherCharges,
    transactionType
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;
    const pureValue =
      typeof totals.pureValue === "number"
        ? totals.pureValue
        : totals.pureWeight;
    const stdPurity =
      typeof totals.stdPurity === "number" ? totals.stdPurity : totals.purity;
    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "PARTY-GOLD",
          "sales-fixing",
          `Party gold balance - Sale to ${partyName}`,
          party._id,
          true,
          totals.pureWeight,
          0,
          {
            debit: totals.pureWeight,
            goldDebit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }
    if (pureValue > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_GOLD_BALANCE",
          `Hedge entry recorded for ${partyName} — ${totals.pureWeight}g gold hedged at bid ${totals.bidValue} USD/oz`,
          party._id,
          false,
          pureValue,
          0,
          {
            debit: pureValue,
            goldDebit: pureValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (hedge) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance debited — Hedge reversal entry for gold purchase from ${partyName}`,
          party._id,
          false,
          totals.goldValue,
          totals.goldValue,
          {
            debit: 0,
            goldDebit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance credited — Gold purchase from ${partyName} at bid value ${totals.bidValue}`,
          party._id,
          false,
          totals.goldValue,
          0,
          {
            debit: totals.goldValue,
            goldCredit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "001",
          "HEDGE_ENTRY",
          `Hedge entry recorded for ${partyName} — ${totals.pureWeight}g gold hedged at bid ${totals.bidValue} USD/oz`,
          party._id,
          false,
          totals.pureWeight,
          totals.pureWeight,
          {
            debit: 0,
            goldDebit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

   if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PARTY_MAKING_CHARGES",
          `Making charges - Purchase from ${partyName}`,
          party._id,
          true,
          totals.makingCharges,
          0,
          {
            debit: totals.makingCharges,
            goldCredit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "002",
          "MAKING_CHARGES",
          `Party making charges - Purchase from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          totals.makingCharges,
          {
            debit: 0,
            goldDebit: totals.pureWeight,
            cashCredit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    
    // === 💱 FX GAIN / LOSS ENTRIES ===
    if (totals.FXGain > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "010", // next code in your sequence
          "FX_EXCHANGE",
          `Foreign Exchange Gain - Purchase from ${partyName}`,
          party._id,
          false, // Gain is credit
          totals.FXGain,
          totals.FXGain, // credit
          {
            debit: 0,
            credit: totals.FXGain,
            cashCredit: totals.FXGain,
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.FXLoss > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "011",
          "FX_EXCHANGE",
          `Foreign Exchange Loss - Purchase from ${partyName}`,
          party._id,
          true, // Loss is debit
          totals.FXLoss,
          0, // no credit
          {
            debit: totals.FXLoss,
            credit: 0,
            cashDebit: totals.FXLoss,
            goldDebit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (Array.isArray(otherCharges) && otherCharges.length > 0) {
      otherCharges.forEach((charge) => {
        const { description, debit, credit, vatDetails } = charge;

        // ---- 1️⃣ Debit side ----
        if (debit?.baseCurrency > 0 && debit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "009",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Debit`,
              debit.account, // ✅ debit account
              false,
              debit.baseCurrency,
              0, // credit
              {
                debit: debit.baseCurrency, // value
                cashDebit: debit.baseCurrency,
                cashCredit: 0,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 2️⃣ Credit side ----
        if (credit?.baseCurrency > 0 && credit?.account) {
          entries.push(
            this.createRegistryEntry(
              transactionType,
              baseTransactionId,
              metalTransactionId,
              "007",
              "OTHER-CHARGE",
              `${description || "Other Charge"} - Credit`,
              credit.account, // ✅ credit account
              false,
              credit.baseCurrency, // value
              credit.baseCurrency, // credit
              {
                debit: 0,
                cashDebit: 0,
                cashCredit: credit.baseCurrency,
              },
              voucherDate,
              voucherNumber,
              adminId
            )
          );
        }

        // ---- 3️⃣ VAT Handling (matches debit/credit accounts) ----
        if (vatDetails?.vatAmount > 0) {
          const vatDescription = `${description || "Other Charge"} - VAT ${
            vatDetails.vatRate || 0
          }%`;

          // VAT Debit Entry
          if (debit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Debit`,
                debit.account, // ✅ VAT debit uses same debit account
                false,
                vatDetails.vatAmount,
                0,
                {
                  debit: vatDetails.vatAmount,
                  cashDebit: vatDetails.vatAmount,
                  cashCredit: 0,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }

          // VAT Credit Entry
          if (credit?.account && vatDetails.vatAmount > 0) {
            entries.push(
              this.createRegistryEntry(
                transactionType,
                baseTransactionId,
                metalTransactionId,
                "093",
                "OTHER-CHARGE",
                `${vatDescription} - Credit`,
                credit.account, // ✅ VAT credit uses same credit account
                false,
                vatDetails.vatAmount,
                vatDetails.vatAmount,
                {
                  debit: 0,
                  cashDebit: 0,
                  cashCredit: vatDetails.vatAmount,
                },
                voucherDate,
                voucherNumber,
                adminId
              )
            );
          }
        }
      });
    }

    if (totals.vatAmount > 0) {
      const excludeVAT = totals.excludeVAT ?? false;
      const vatOnMaking = totals.vatOnMaking ?? false;

      // ✅ Skip if VAT excluded
      if (!excludeVAT) {
        // ✅ Determine which base value VAT should apply on
        const vatBaseAmount = vatOnMaking
          ? totals.makingCharges
          : totals.goldValue;

        // ✅ PARTY VAT ENTRY (credit side)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "VAT_AMOUNT",
            `Party VAT amount - Purchase from ${partyName}`,
            party._id,
            false,
            totals.vatAmount,
            totals.vatAmount,
            {
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount, // ✅ now dynamic based on vatOnMaking
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );

        // ✅ VAT ACCOUNT ENTRY (debit side)
        entries.push(
          this.createRegistryEntry(
            transactionType,
            baseTransactionId,
            metalTransactionId,
            "009",
            "PARTY_VAT_AMOUNT",
            `VAT amount - Purchase from ${partyName}`,
            party._id,
            true,
            totals.vatAmount,
            0,
            {
              debit: totals.vatAmount,
              goldDebit: totals.grossWeight,
              cashDebit: vatBaseAmount, // ✅ same logic here
              grossWeight: totals.grossWeight,
              goldBidValue: totals.bidValue,
            },
            voucherDate,
            voucherNumber,
            adminId
          )
        );
      }
    }

    if (totals.premium > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          false,
          totals.premium,
          totals.premium,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "003",
          "PARTY_PREMIUM",
          `Party premium - Purchase from ${partyName}`,
          party._id,
          true,
          totals.premium,
          0,
          {
            debit: totals.premium,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          false,
          totals.discount,
          0,
          {
            debit: totals.discount,
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "007",
          "PARTY_DISCOUNT",
          `Party discount - Purchase from ${partyName}`,
          party._id,
          true,
          totals.discount,
          totals.discount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (pureValue > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD",
          `Gold inventory - Unfix Sale return from ${partyName}`,
          null,
          true,
          pureValue,
          pureValue,
          {
            grossWeight: totals.grossWeight,
            goldDebit: totals.grossWeight,
            cashCredit: totals.goldValue,
            pureWeight: pureValue,
            purity: stdPurity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }
    if (totals.purityDifference !== 0) {
      const isDebit = totals.purityDifference < 0; // negative = debit, positive = credit
      const absDiff = Math.abs(totals.purityDifference);

      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} (${
            totals.purityDifference > 0 ? "Gain" : "Loss"
          } ${totals.purityDifference})`,
          party._id,
          isDebit, // ✅ true if debit (loss), false if credit (gain)
          absDiff, // ✅ value always positive
          !isDebit ? absDiff : 0, // ✅ credit only if positive
          {
            debit: isDebit ? absDiff : 0, // ✅ debit side if loss
            credit: !isDebit ? absDiff : 0, // ✅ credit side if gain
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }
    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          transactionType,
          baseTransactionId,
          metalTransactionId,
          "006",
          "GOLD_STOCK",
          `Gold stock - Unfix Sale return from ${partyName}`,
          null,
          true,
          totals.grossWeight,
          totals.grossWeight,
          {
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: pureValue,
            purity: stdPurity,
            goldBidValue: totals.bidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }
  static buildSaleReturnUnfixEntries(
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_GOLD_BALANCE",
          `Party gold balance - Unfix sale return from ${partyName}`,
          party._id,
          false,
          totals.pureWeight,
          totals.pureWeight,
          {
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.purityDiffWeight != 0) {
      // if purity difference -negative then debit else credit
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} : ${totals.purityDiffWeight}`,
          null,
          true,
          totals.purityDiffWeight,
          totals.purityDiffWeight > 0 ? totals.purityDiffWeight : 0, // credit
          {
            debit: totals.purityDiffWeight > 0 ? 0 : totals.purityDiffWeight,
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "003",
          "MAKING_CHARGES",
          `Party making charges - Unfix sale return from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          totals.makingCharges,
          {
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.otherChargesAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "008",
          "OTHER_CHARGES",
          `${item.otherCharges.description} charges - Unfix Sale return from ${partyName}`,
          party._id,
          false,
          totals.otherChargesAmount,
          totals.otherChargesAmount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.vatAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "009",
          "VAT_AMOUNT",
          `Party Vat amount - Unfix Sale return from ${partyName}`,
          party._id,
          false,
          totals.vatAmount,
          totals.vatAmount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.premium > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "004",
          "PREMIUM",
          `Party premium - Unfix sale return from ${partyName}`,
          party._id,
          false,
          totals.premium,
          totals.premium,
          {
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Unfix sale return from ${partyName}`,
          party._id,
          false,
          totals.discount,
          0,
          {
            debit: totals.discount,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD",
          `Gold inventory - Unfix sale return from ${partyName}`,
          null,
          true,
          totals.standerdPureWeight,
          0,
          {
            debit: totals.standerdPureWeight,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "006",
          "GOLD_STOCK",
          `Gold stock - Unfix sale return from ${partyName}`,
          null,
          true,
          totals.grossWeight,
          0,
          {
            debit: totals.grossWeight,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }

  static buildSaleReturnFixEntries(
    totals,
    metalTransactionId,
    party,
    baseTransactionId,
    voucherDate,
    voucherNumber,
    adminId,
    item
  ) {
    const entries = [];
    const partyName = party.customerName || party.accountCode;

    // Sale-return-fixing entry
    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "PARTY-GOLD",
          "sale-fixing",
          `Party gold balance - Sale return from ${partyName}`,
          party._id,
          true,
          totals.pureWeight,
          totals.pureWeight,
          {
            debit: 0,
            goldCredit: totals.pureWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.purityDiffWeight != 0) {
      // if purity difference -negative then debit else credit
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "006",
          "PURITY_DIFFERENCE",
          `Purity difference - Purchase from ${partyName} : ${totals.purityDiffWeight}`,
          null,
          true,
          totals.purityDiffWeight,
          totals.purityDiffWeight > 0 ? totals.purityDiffWeight : 0, // credit
          {
            debit: totals.purityDiffWeight > 0 ? 0 : totals.purityDiffWeight,
            goldDebit: totals.grossWeight > 0 ? totals.grossWeight : 0,
            cashDebit: totals.goldValue > 0 ? totals.goldValue : 0,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.totalAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "001",
          "PARTY_CASH_BALANCE",
          `Party cash balance - Sale return from ${partyName}`,
          party._id,
          false,
          totals.totalAmount,
          totals.totalAmount,
          {
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.makingCharges > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "002",
          "MAKING_CHARGES",
          `Party making charges - Sale return from ${partyName}`,
          party._id,
          false,
          totals.makingCharges,
          totals.makingCharges,
          {
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }
    if (totals.otherChargesAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "008",
          "OTHER_CHARGES",
          `${item.otherCharges.description} charges -  Sale return from ${partyName}`,
          party._id,
          false,
          totals.otherChargesAmount,
          totals.otherChargesAmount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.vatAmount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "009",
          "VAT_AMOUNT",
          `Party Vat amount -  Sale return from ${partyName}`,
          party._id,
          false,
          totals.vatAmount,
          totals.vatAmount,
          {
            goldDebit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.premium > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "003",
          "PREMIUM",
          `Party premium - Sale return from ${partyName}`,
          party._id,
          false,
          totals.premium,
          totals.premium,
          {
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.discount > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "007",
          "DISCOUNT",
          `Party discount - Sale return from ${partyName}`,
          party._id,
          false,
          totals.discount,
          0,
          {
            debit: totals.discount,
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.pureWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "004",
          "GOLD",
          `Gold inventory - Sale return from ${partyName}`,
          null,
          true,
          totals.standerdPureWeight,
          0,
          {
            debit: totals.standerdPureWeight,
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            purity: totals.purity,
            grossWeight: totals.grossWeight,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    if (totals.grossWeight > 0) {
      entries.push(
        this.createRegistryEntry(
          baseTransactionId,
          metalTransactionId,
          "005",
          "GOLD_STOCK",
          `Gold stock - Sale return from ${partyName}`,
          null,
          true,
          totals.grossWeight,
          0,
          {
            debit: totals.grossWeight,
            goldCredit: totals.grossWeight,
            cashDebit: totals.goldValue,
            grossWeight: totals.grossWeight,
            pureWeight: totals.pureWeight,
            purity: totals.purity,
            goldBidValue: totals.goldBidValue,
          },
          voucherDate,
          voucherNumber,
          adminId
        )
      );
    }

    return entries;
  }

  static calculateTotals(stockItems, totalSummary) {
    const totals = stockItems.reduce(
      (acc, item) => {
        const makingChargesAmount =
          item.itemTotal?.makingChargesTotal || item.makingCharges?.amount || 0;
        const premiumDiscountAmount =
          item.itemTotal?.premiumTotal || item.premium?.amount || 0;
        const vatAmount = item.vat?.amount || 0;
        const goldValue = item.itemTotal?.baseAmount || 0;
        const pureWeightStd = item.pureWeightStd || 0;
        const pureWeight = item.pureWeight || 0;
        const purityStd = item.purityStd || 0;
        const purity = item.purity || 0;
        const grossWeight = item.grossWeight || 0;
        const premium = premiumDiscountAmount > 0 ? premiumDiscountAmount : 0;
        const discount =
          premiumDiscountAmount < 0 ? Math.abs(premiumDiscountAmount) : 0;
        const purityDifference = item.purityDifference || 0;
        const passPurityDiff =
          typeof item.passPurityDiff === "boolean" ? item.passPurityDiff : true;
        const finalPureWeight =
          passPurityDiff === false
            ? pureWeight
            : purityDifference === 0
            ? pureWeightStd
            : pureWeight;

        const finalPurity =
          passPurityDiff === false
            ? purity
            : purityDifference === 0
            ? purityStd
            : purity;

        return {
          makingCharges: acc.makingCharges + makingChargesAmount,
          premium: acc.premium + premium,
          discount: acc.discount + discount,
          vatAmount: acc.vatAmount + vatAmount,
          goldValue: acc.goldValue + goldValue,
          pureWeight: acc.pureWeight + finalPureWeight, // ✅ only once
          pureWeightStd: acc.pureWeightStd + pureWeightStd,
          purity: acc.purity + finalPurity, // ✅ single purity reference
          purityStd: acc.purityStd + purityStd,
          grossWeight: acc.grossWeight + grossWeight,
          purityDifference: acc.purityDifference + purityDifference,
          currentBidValue: item.metalRateRequirements?.currentBidValue,
          bidValue: item.metalRateRequirements?.bidValue,
          passPurityDiff,
          excludeVAT: item.excludeVAT || false,
          vatOnMaking: item.vatOnMaking || false,
          FXGain: item.FXGain || 0,
          FXLoss: item.FXLoss || 0,
        };
      },
      {
        makingCharges: 0,
        premium: 0,
        discount: 0,
        goldValue: 0,
        pureWeight: 0,
        grossWeight: 0,
        purity: 0,
        vatAmount: 0,
        otherChargesAmount: 0,
        goldBidValue: 0,
        purityDifference: 0,
        pureWeightStd: 0,
        purityStd: 0,
      }
    );

    // 🧮 Totals from summary
    totals.totalAmount = totalSummary?.itemTotalAmount || 0;
    return totals;
  }

  static createRegistryEntry(
    transactionType,
    baseId,
    metalTransactionId,
    suffix,
    type,
    description,
    partyId,
    isBullion,
    value,
    credit,
    {
      cashDebit = 0,
      goldCredit = 0,
      cashCredit = 0,
      goldDebit = 0,
      debit = 0,
      grossWeight,
      pureWeight,
      purity,
      goldBidValue,
    } = {},
    voucherDate,
    reference,
    adminId
  ) {
    if (value <= 0 && !["sales-fixing", "sale-return-fixing"].includes(type))
      return null;

    // ✅ ensure transactionId is string (not ObjectId)
    const transactionIdStr = baseId?.toString?.() ?? `${baseId ?? ""}`;

    return {
      transactionId: transactionIdStr,
      metalTransactionId,
      transactionType,
      type,
      description,
      party: partyId || null,
      isBullion,
      value: parseFloat(value) || 0,
      credit: parseFloat(credit) || 0,
      cashDebit: parseFloat(cashDebit) || 0,
      goldCredit: parseFloat(goldCredit) || 0,
      cashCredit: parseFloat(cashCredit) || 0,
      goldDebit: parseFloat(goldDebit) || 0,
      debit: parseFloat(debit) || 0,
      goldBidValue: goldBidValue ?? 0,
      transactionDate: voucherDate || new Date(),
      reference,
      createdBy: adminId,
      createdAt: new Date(),
      grossWeight: grossWeight ?? 0,
      pureWeight: pureWeight ?? 0,
      purity: purity ?? 0,
    };
  }

  static async ensureCashRow(accountId, currencyId, session) {
    const currencyObjId = new mongoose.Types.ObjectId(currencyId);
    const exists = await Account.findOne(
      { _id: accountId, "balances.cashBalance.currency": currencyObjId },
      { _id: 1 }
    ).session(session);

    if (!exists) {
      await Account.updateOne(
        { _id: accountId },
        {
          $push: {
            "balances.cashBalance": {
              currency: currencyObjId,
              amount: 0,
              isDefault: false,
              lastUpdated: new Date(),
            },
          },
          $set: { "balances.lastBalanceUpdate": new Date() },
        },
        { session }
      );
    }
  }

  /** 🔹 Increment a currency balance safely with arrayFilters */
  static async incCash(accountId, currencyId, delta, session) {
    const currencyObjId = new mongoose.Types.ObjectId(currencyId);
    await Account.updateOne(
      { _id: accountId },
      {
        $inc: { "balances.cashBalance.$[cb].amount": Number(delta.toFixed(2)) },
        $set: {
          "balances.cashBalance.$[cb].lastUpdated": new Date(),
          "balances.lastBalanceUpdate": new Date(),
        },
      },
      { session, arrayFilters: [{ "cb.currency": currencyObjId }] }
    );
  }

  /** 🔹 Increment gold balances safely */
  static async incGold(accountId, gramsDelta, valueDelta, session) {
    await Account.updateOne(
      { _id: accountId },
      {
        $inc: {
          "balances.goldBalance.totalGrams": gramsDelta,
          "balances.goldBalance.totalValue": valueDelta,
        },
        $set: {
          "balances.goldBalance.lastUpdated": new Date(),
          "balances.lastBalanceUpdate": new Date(),
        },
      },
      { session }
    );
  }

  /** 🔹 Main balance updater (create/update) */
  static async updateAccountBalances(party, metalTransaction, session) {
    const {
      transactionType,
      fixed,
      unfix,
      stockItems,
      otherCharges,
      totalSummary,
      partyCurrency,
    } = metalTransaction;

    const logs = [];
    const currencyId = partyCurrency?.toString?.() || null;
    const currencyObjId = currencyId
      ? new mongoose.Types.ObjectId(currencyId)
      : null;

    // 1️⃣ Calculate totals and mode
    const totals = this.calculateTotals(stockItems, totalSummary);
    const mode = this.getTransactionMode(fixed, unfix);
    const ch = this.calculateBalanceChanges(
      transactionType,
      mode,
      totals,
      partyCurrency
    );

    // 2️⃣ Update GOLD balance
    if (ch.goldBalance !== 0 || ch.goldValue !== 0) {
      await this.incGold(party._id, ch.goldBalance, ch.goldValue, session);
      const s = ch.goldBalance > 0 ? "+" : "-";
      logs.push(
        `🏆 GOLD ${s}${Math.abs(ch.goldBalance).toFixed(3)}g (${s}${Math.abs(
          ch.goldValue
        ).toFixed(2)})`
      );
    }

    // 3️⃣ Update CASH balance safely (per currency)
    const netCash =
      (ch.cashBalance || 0) +
      (ch.premiumBalance || 0) +
      (ch.otherCharges || 0) +
      (ch.discountBalance || 0) + 
      (ch.vatAmount || 0);  

    if (currencyObjId && !isNaN(netCash) && netCash !== 0) {
      await this.ensureCashRow(party._id, currencyId, session);
      await this.incCash(party._id, currencyId, netCash, session);
      const s = netCash > 0 ? "+" : "-";
      logs.push(
        `💰 CASH [${currencyId}] ${s}${Math.abs(netCash).toFixed(2)} for ${
          party.customerName
        }`
      );
    }

    // 4️⃣ Other charges (debit, credit, VAT)
    if (Array.isArray(otherCharges) && otherCharges.length > 0) {
      for (const oc of otherCharges) {
        const { debit, credit, vatDetails } = oc;

        // 🟢 Debit
        if (debit?.account && debit?.baseCurrency > 0) {
          const cur = debit.currency?.toString?.() || currencyId;
          await this.ensureCashRow(debit.account, cur, session);
          await this.incCash(debit.account, cur, -debit.baseCurrency, session);
          logs.push(
            `🟢 DEBIT ${debit.baseCurrency.toFixed(2)} (${cur}) → ${
              debit.account
            }`
          );
        }

        // 🔴 Credit
        if (credit?.account && credit?.baseCurrency > 0) {
          const cur = credit.currency?.toString?.() || currencyId;
          await this.ensureCashRow(credit.account, cur, session);
          await this.incCash(credit.account, cur, credit.baseCurrency, session);
          logs.push(
            `🔴 CREDIT ${credit.baseCurrency.toFixed(2)} (${cur}) → ${
              credit.account
            }`
          );
        }

        // 💸 VAT
        if (vatDetails?.vatAmount > 0) {
          const vat = vatDetails.vatAmount;
          const rate = vatDetails.vatRate || 0;
          if (debit?.account) {
            const cur = debit.currency?.toString?.() || currencyId;
            await this.ensureCashRow(debit.account, cur, session);
            await this.incCash(debit.account, cur, -vat, session);
            logs.push(
              `💸 VAT DEBIT ${vat.toFixed(2)} (${rate}%) → ${debit.account}`
            );
          }
          if (credit?.account) {
            const cur = credit.currency?.toString?.() || currencyId;
            await this.ensureCashRow(credit.account, cur, session);
            await this.incCash(credit.account, cur, vat, session);
            logs.push(
              `💸 VAT CREDIT ${vat.toFixed(2)} (${rate}%) → ${credit.account}`
            );
          }
        }
      }
    }

    // 5️⃣ Log Summary
   
    logs.forEach((l) => console.log(l));
  }

  static buildUpdateOperations(balanceChanges) {
    const {
      goldBalance,
      goldValue,
      cashBalance,
      premiumBalance,
      discountBalance,
      otherCharges,
      currency,
    } = balanceChanges;
    const incObj = {};
    const setObj = {};

    // ✅ Gold
    if (goldBalance !== 0) {
      incObj["balances.goldBalance.totalGrams"] = goldBalance;
      incObj["balances.goldBalance.totalValue"] = goldValue;
      setObj["balances.goldBalance.lastUpdated"] = new Date();
    }

    // ✅ Cash (multi-currency)
    const netCashChange =
      cashBalance + premiumBalance + otherCharges + discountBalance;

    if (netCashChange !== 0 && currency) {
      // Mongoose can't dynamically $inc an array element by condition,
      // so we’ll update via aggregation pipeline (handled below in updateAccountBalances)
      incObj["balances.cashBalance.$[cb].amount"] = parseFloat(
        netCashChange.toFixed(2)
      );
      setObj["balances.cashBalance.$[cb].lastUpdated"] = new Date();
    }

    setObj["balances.lastBalanceUpdate"] = new Date();

    const updateOps = {};
    if (Object.keys(incObj).length > 0) updateOps.$inc = incObj;
    if (Object.keys(setObj).length > 0) updateOps.$set = setObj;

    // Add array filter for currency if needed
    if (currency) {
      updateOps.arrayFilters = [{ "cb.currency": currency }];
    }

    return updateOps;
  }

  static calculateBalanceChanges(transactionType, mode, totals, partyCurrency) {
    const balanceMatrix = {
      purchase: {
        unfix: {
          goldBalance: totals.pureWeight,
          goldValue: totals.goldValue,
          cashBalance: totals.makingCharges,
          premiumBalance: totals.premium,
          discountBalance: -totals.discount,
          vatAmount: totals.vatAmount,
          otherCharges: 0,
        },
        fix: {
          goldBalance: 0,
          goldValue: 0,
          cashBalance: totals.totalAmount,
          premiumBalance: 0,
          discountBalance: 0,
          otherCharges: 0,
        },
      },
      sale: {
        unfix: {
          goldBalance: -totals.pureWeight,
          goldValue: -totals.goldValue,
          cashBalance: -totals.makingCharges,
          otherCharges: 0,
          vatAmount: -totals.vatAmount,
          premiumBalance: -totals.premium,
          discountBalance: totals.discount,
        },
        fix: {
          goldBalance: 0,
          goldValue: 0,
          cashBalance: -totals.totalAmount,
          premiumBalance: 0,
          discountBalance: 0,
          otherCharges: 0,
        },
      },
      purchaseReturn: {
        unfix: {
          goldBalance: -totals.pureWeight,
          goldValue: -totals.goldValue,
          cashBalance: -totals.makingCharges,
          otherCharges: 0,
          premiumBalance: -totals.premium,
          discountBalance: totals.discount,
          vatAmount: -totals.vatAmount,
        },
        fix: {
          goldBalance: 0,
          goldValue: 0,
          cashBalance: -totals.totalAmount,
          premiumBalance: 0,
          discountBalance: 0,
          otherCharges: 0,
        },
      },
      saleReturn: {
        unfix: {
          goldBalance: totals.pureWeight,
          goldValue: totals.goldValue,
          cashBalance: totals.makingCharges,
          otherCharges: 0,
          premiumBalance: totals.premium,
          discountBalance: -totals.discount,
        },
        fix: {
          goldBalance: 0,
          goldValue: 0,
          cashBalance: totals.totalAmount,
          premiumBalance: 0,
          discountBalance: 0,
          otherCharges: 0,
        },
      },
    };

    const changes = balanceMatrix[transactionType]?.[mode] || {
      goldBalance: 0,
      goldValue: 0,
      cashBalance: 0,
      otherCharges: 0,
      premiumBalance: 0,
      discountBalance: 0,
      vatAmount: 0,
    };

    return { ...changes, currency: partyCurrency }; // ✅ include currency id
  }

  static generateTransactionId() {
    const timestamp = Date.now();
    const currentYear = new Date().getFullYear();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    return `TXN${currentYear}${randomNum}`;
  }

  static handleError(error) {
    // 🧩 1️⃣ Always log the raw error for inspection
    console.error("🔥 FULL ERROR OBJECT:", error);

    // 🧩 2️⃣ Handle Mongoose validation errors with detail
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      console.error("🧩 Validation Error Details:");
      for (const [key, val] of Object.entries(error.errors)) {
        console.error(` → Field: ${key}, Message: ${val.message}`);
      }

      throw createAppError(
        `Validation failed: ${errors.join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    // 🧩 3️⃣ Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      console.error("⚠️ Duplicate Key Error on field:", field);
      throw createAppError(
        `Duplicate ${field} detected`,
        409,
        "DUPLICATE_TRANSACTION"
      );
    }

    // 🧩 4️⃣ Handle cast errors (most likely cause here)
    if (error.name === "CastError") {
      console.error("⚠️ Cast Error → Path:", error.path, "Value:", error.value);
      throw createAppError(
        `Invalid data format in field "${error.path}" — value: ${JSON.stringify(
          error.value
        )}`,
        400,
        "INVALID_DATA_FORMAT"
      );
    }

    // 🧩 5️⃣ Handle network / connection errors
    if (error.name === "MongoNetworkError") {
      console.error("🔌 Database connection issue:", error.message);
      throw createAppError(
        "Database connection error",
        503,
        "DATABASE_CONNECTION_ERROR"
      );
    }

    // 🧩 6️⃣ If an existing app error, rethrow as-is
    if (error.statusCode) {
      throw error;
    }

    // 🧩 7️⃣ Default fallback
    console.error("❗ Unhandled Error:", error.message);
    throw createAppError(
      "Internal server error occurred",
      500,
      "INTERNAL_SERVER_ERROR"
    );
  }

  static validateTransactionData(transactionData, adminId) {
    const required = [
      "partyCode",
      "transactionType",
      "stockItems",
      "voucherDate",
      "voucherNumber",
    ];
    const missing = required.filter((field) => !transactionData[field]);

    if (missing.length > 0) {
      throw createAppError(
        `Missing required fields: ${missing.join(", ")}`,
        400,
        "MISSING_REQUIRED_FIELDS"
      );
    }

    if (
      !["purchase", "sale", "purchaseReturn", "saleReturn"].includes(
        transactionData.transactionType
      )
    ) {
      throw createAppError(
        "Transaction type must be 'purchase', 'sale', 'purchaseReturn', or 'saleReturn'",
        400,
        "INVALID_TRANSACTION_TYPE"
      );
    }

    if (
      !Array.isArray(transactionData.stockItems) ||
      transactionData.stockItems.length === 0
    ) {
      throw createAppError(
        "Stock items must be a non-empty array",
        400,
        "INVALID_STOCK_ITEMS"
      );
    }

    // Validate ObjectIds
    const objectIdFields = [
      { field: "partyCode", value: transactionData.partyCode },
      { field: "partyCurrency", value: transactionData.partyCurrency },
      { field: "itemCurrency", value: transactionData.itemCurrency },
      { field: "baseCurrency", value: transactionData.baseCurrency },
      { field: "adminId", value: adminId },
    ];

    objectIdFields.forEach(({ field, value }) => {
      if (value && !mongoose.isValidObjectId(value)) {
        throw createAppError(
          `Invalid ${field} format`,
          400,
          `INVALID_${field.toUpperCase()}`
        );
      }
    });

    // Validate stockItems
    transactionData.stockItems.forEach((item, index) => {
      if (!item.stockCode || !mongoose.isValidObjectId(item.stockCode)) {
        throw createAppError(
          `Invalid stockCode for stock item at index ${index}`,
          400,
          "INVALID_STOCK_CODE"
        );
      }
      if (item.metalRate && !mongoose.isValidObjectId(item.metalRate)) {
        throw createAppError(
          `Invalid metalRate for stock item at index ${index}`,
          400,
          "INVALID_METAL_RATE"
        );
      }
      // Validate numeric fields
      if (typeof item.pureWeight !== "number" || item.pureWeight < 0) {
        throw createAppError(
          `Invalid pureWeight for stock item at index ${index}`,
          400,
          "INVALID_PURE_WEIGHT"
        );
      }
      if (typeof item.grossWeight !== "number" || item.grossWeight < 0) {
        throw createAppError(
          `Invalid grossWeight for stock item at index ${index}`,
          400,
          "INVALID_GROSS_WEIGHT"
        );
      }
      if (
        typeof item.purity !== "number" ||
        item.purity <= 0 ||
        item.purity > 1
      ) {
        throw createAppError(
          `Invalid purity for stock item at index ${index}`,
          400,
          "INVALID_PURITY"
        );
      }
    });

    return true;
  }

  static async createBulkMetalTransactions(transactionsData, adminId) {
    const results = [];
    const errors = [];

    for (let i = 0; i < transactionsData.length; i++) {
      try {
        const result = await this.createMetalTransaction(
          transactionsData[i],
          adminId
        );
        results.push({ index: i, success: true, data: result });
      } catch (error) {
        errors.push({ index: i, success: false, error: error.message });
      }
    }

    return { results, errors, totalProcessed: transactionsData.length };
  }

  static getPremiumDiscountBreakdown(stockItems) {
    return stockItems.reduce(
      (acc, item) => {
        const premiumDiscountAmount =
          item.itemTotal?.premiumTotal || item.premium?.amount || 0;

        if (premiumDiscountAmount > 0) {
          acc.totalPremium += premiumDiscountAmount;
          acc.premiumItems.push({
            stockCode: item.stockCode,
            amount: premiumDiscountAmount,
            type: "premium",
          });
        } else if (premiumDiscountAmount < 0) {
          const discountAmount = Math.abs(premiumDiscountAmount);
          acc.totalDiscount += discountAmount;
          acc.discountItems.push({
            stockCode: item.stockCode,
            amount: discountAmount,
            type: "discount",
          });
        }

        return acc;
      },
      {
        totalPremium: 0,
        totalDiscount: 0,
        premiumItems: [],
        discountItems: [],
      }
    );
  }

  static validatePremiumDiscount(stockItems) {
    const invalidItems = [];

    stockItems.forEach((item, index) => {
      const premiumDiscountAmount =
        item.itemTotal?.premiumTotal || item.premium?.amount;

      if (premiumDiscountAmount !== undefined && isNaN(premiumDiscountAmount)) {
        invalidItems.push({
          index,
          stockCode: item.stockCode,
          error: "Premium/Discount must be a valid number",
        });
      }
    });

    if (invalidItems.length > 0) {
      throw createAppError(
        `Invalid premium/discount values found: ${invalidItems
          .map(
            (item) =>
              `Item ${item.index + 1} (${item.stockCode}): ${item.error}`
          )
          .join(", ")}`,
        400,
        "INVALID_PREMIUM_DISCOUNT"
      );
    }

    return true;
  }
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Get all metal transactions with pagination and filters
  static async getAllMetalTransactions(page = 1, limit = 50, filters = {}) {
    const skip = (page - 1) * limit;
    const query = { isActive: true };

    if (filters.transactionType)
      query.transactionType = filters.transactionType;
    if (filters.partyCode) query.partyCode = filters.partyCode;
    if (filters.status) query.status = filters.status;
    if (filters.stockCode) query["stockItems.stockCode"] = filters.stockCode;
    if (filters.startDate && filters.endDate) {
      query.voucherDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    const transactions = await MetalTransaction.find(query)
      .populate("partyCode", "accountCode customerName")
      .populate("partyCurrency", "code symbol")
      .populate("itemCurrency", "code symbol")
      .populate("baseCurrency", "code symbol")
      .populate("stockItems.stockCode", "code description specifications")
      .populate("stockItems.metalRate", "metalType rate effectiveDate")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ voucherDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

      console.log("Fetched transactions:", transactions);

    const total = await MetalTransaction.countDocuments(query);

    return {
      transactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  // Get metal transaction by ID
  static async getMetalTransactionById(transactionId) {
    const transaction = await MetalTransaction.findById(transactionId)
      .populate("partyCode", "accountCode customerName addresses")
      .populate("partyCurrency", "code symbol")
      .populate("itemCurrency", "code symbol")
      .populate("baseCurrency", "code symbol")
      .populate("stockItems.stockCode", "code description specifications")
      .populate("stockItems.metalRate", "metalType rate effectiveDate")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!transaction || !transaction.isActive) {
      throw createAppError(
        "Metal transaction not found",
        404,
        "TRANSACTION_NOT_FOUND"
      );
    }

    return transaction;
  }

  // Get transactions by party
  static async getTransactionsByParty(
    partyId,
    limit = 50,
    transactionType = null
  ) {
    const query = { partyCode: partyId, isActive: true };
    if (transactionType) query.transactionType = transactionType;

    return MetalTransaction.find(query)
      .populate("partyCode", "name code")
      .populate("partyCurrency", "code symbol")
      .populate("itemCurrency", "code symbol")
      .populate("stockItems.stockCode", "code description")
      .populate("stockItems.metalRate", "metalType rate")
      .populate("createdBy", "name email")
      .sort({ voucherDate: -1, createdAt: -1 })
      .limit(limit);
  }
  static async getUnfixedTransactions(page = 1, limit = 50, filters = {}) {
    const skip = (page - 1) * limit;
    const query = {
      isActive: true,
      unfix: true, // Show only transactions where unfix is true
    };

    // Apply filters
    if (filters.transactionType) {
      query.transactionType = filters.transactionType;
    }
    if (filters.partyCode) {
      query.partyCode = filters.partyCode;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.startDate && filters.endDate) {
      query.voucherDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    // Find transactions but only populate specific party fields
    const transactions = await MetalTransaction.find(query)
      .populate({
        path: "partyCode",
        select:
          "accountCode customerName addresses balances.goldBalance.totalGrams balances.cashBalance.amount limitsMargins.shortMargin",
      })
      .sort({ voucherDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await MetalTransaction.countDocuments(query);

    // Extract unique party data with only required fields
    const partyDataMap = new Map();
    transactions.forEach((transaction) => {
      if (transaction.partyCode && transaction.partyCode._id) {
        const partyId = transaction.partyCode._id.toString();
        if (!partyDataMap.has(partyId)) {
          const party = transaction.partyCode;

          // Find primary address or fallback to first address
          const primaryAddress =
            party.addresses?.find((addr) => addr.isPrimary === true) ||
            party.addresses?.[0];

          // Transform party data to include only required fields
          const transformedParty = {
            _id: party._id,
            accountCode: party.accountCode,
            customerName: party.customerName,
            email: primaryAddress?.email || null,
            phone: primaryAddress?.phoneNumber1 || null,
            goldBalance: {
              totalGrams: party.balances?.goldBalance?.totalGrams || 0,
            },
            cashBalance: party.balances?.cashBalance?.amount || 0,
            shortMargin: party.limitsMargins?.[0]?.shortMargin || 0,
          };

          partyDataMap.set(partyId, transformedParty);
        }
      }
    });

    const uniquePartyData = Array.from(partyDataMap.values());

    return {
      parties: uniquePartyData,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      summary: {
        totalUnfixedTransactions: total,
        totalPurchases: transactions.filter(
          (t) => t.transactionType === "purchase"
        ).length,
        totalSales: transactions.filter((t) => t.transactionType === "sale")
          .length,
        totalParties: uniquePartyData.length,
      },
    };
  }

  // Get unfixed transactions with detailed account information
  static async getUnfixedTransactionsWithAccounts(
    page = 1,
    limit = 50,
    filters = {}
  ) {
    const skip = (page - 1) * limit;
    const matchStage = {
      isActive: true,
      isFixed: false, // Assuming you have an isFixed field
    };

    // Apply filters to match stage
    if (filters.transactionType) {
      matchStage.transactionType = filters.transactionType;
    }
    if (filters.partyCode) {
      matchStage.partyCode = new mongoose.Types.ObjectId(filters.partyCode);
    }
    if (filters.status) {
      matchStage.status = filters.status;
    }
    if (filters.startDate && filters.endDate) {
      matchStage.voucherDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "accounts", // Your account collection name
          localField: "partyCode",
          foreignField: "_id",
          as: "accountDetails",
        },
      },
      {
        $unwind: "$accountDetails",
      },
      {
        $lookup: {
          from: "currencymasters",
          localField: "partyCurrency",
          foreignField: "_id",
          as: "partyCurrencyDetails",
        },
      },
      {
        $lookup: {
          from: "currencymasters",
          localField: "itemCurrency",
          foreignField: "_id",
          as: "itemCurrencyDetails",
        },
      },
      {
        $lookup: {
          from: "currencymasters",
          localField: "baseCurrency",
          foreignField: "_id",
          as: "baseCurrencyDetails",
        },
      },
      {
        $lookup: {
          from: "currencymasters",
          localField: "accountDetails.balances.goldBalance.currency",
          foreignField: "_id",
          as: "goldCurrencyDetails",
        },
      },
      {
        $lookup: {
          from: "currencymasters",
          localField: "accountDetails.balances.cashBalance.currency",
          foreignField: "_id",
          as: "cashCurrencyDetails",
        },
      },
      {
        $project: {
          // Transaction fields
          _id: 1,
          transactionType: 1,
          voucherDate: 1,
          voucherNumber: 1,
          status: 1,
          isFixed: 1,
          stockItems: 1,
          totalSummary: 1,
          createdAt: 1,
          updatedAt: 1,

          // Account information
          accountInfo: {
            id: "$accountDetails._id",
            accountCode: "$accountDetails.accountCode",
            customerName: "$accountDetails.customerName",
            email: "$accountDetails.email",
            phone: "$accountDetails.phone",
            isActive: "$accountDetails.isActive",
          },

          // Gold Balance
          goldBalance: {
            totalGrams: "$accountDetails.balances.goldBalance.totalGrams",
            totalValue: "$accountDetails.balances.goldBalance.totalValue",
            currency: {
              $arrayElemAt: [
                {
                  $map: {
                    input: "$goldCurrencyDetails",
                    as: "curr",
                    in: {
                      code: "$$curr.code",
                      symbol: "$$curr.symbol",
                    },
                  },
                },
                0,
              ],
            },
            lastUpdated: "$accountDetails.balances.goldBalance.lastUpdated",
          },

          // Cash Balance (array)
          cashBalance: {
            $map: {
              input: "$accountDetails.balances.cashBalance",
              as: "cash",
              in: {
                amount: "$$cash.amount",
                currency: {
                  $let: {
                    vars: {
                      currencyMatch: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$cashCurrencyDetails",
                              cond: { $eq: ["$$this._id", "$$cash.currency"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      code: "$$currencyMatch.code",
                      symbol: "$$currencyMatch.symbol",
                    },
                  },
                },
                lastUpdated: "$$cash.lastUpdated",
              },
            },
          },

          // Limits and Margins
          limitsMargins: {
            $map: {
              input: "$accountDetails.limitsMargins",
              as: "limit",
              in: {
                creditDaysAmt: "$$limit.creditDaysAmt",
                creditDaysMtl: "$$limit.creditDaysMtl",
                shortMargin: "$$limit.shortMargin",
                longMargin: "$$limit.longMargin",
              },
            },
          },

          // Currency details
          currencies: {
            party: { $arrayElemAt: ["$partyCurrencyDetails", 0] },
            item: { $arrayElemAt: ["$itemCurrencyDetails", 0] },
            base: { $arrayElemAt: ["$baseCurrencyDetails", 0] },
          },
        },
      },
      {
        $sort: { voucherDate: -1, createdAt: -1 },
      },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await MetalTransaction.aggregate(pipeline);
    const transactions = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
      transactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1,
      },
    };
  }

  // Update metal transaction
  static async updateMetalTransaction(transactionId, updateData, adminId) {
    const session = await mongoose.startSession();
    let transaction;

    try {
      // Start transaction
      await session.startTransaction();

      // Validate inputs
      this.validateUpdateInputs(transactionId, updateData, adminId);

      // Fetch the existing transaction
      transaction = await MetalTransaction.findById(transactionId).session(
        session
      );
      if (!transaction || !transaction.isActive) {
        throw createAppError(
          "Metal transaction not found or inactive",
          404,
          "TRANSACTION_NOT_FOUND"
        );
      }
      // Store original transaction data for reversal
      const originalData = {
        ...transaction.toObject(),
        partyCode: transaction.partyCode.toString(),
      };

      // Check if party is changing
      const isPartyChanged =
        updateData?.partyCode &&
        transaction.partyCode.toString() !== updateData.partyCode.toString();

      // Fetch parties
      const [oldParty, newParty] = await this.fetchParties(
        originalData.partyCode,
        updateData?.partyCode,
        isPartyChanged,
        session
      );

      // Apply updates to transaction
      this.applyTransactionUpdates(transaction, updateData);

      // Save updated transaction
      transaction.updatedBy = adminId;
      await transaction.save({ session });

      // Handle registry and balance updates
      await this.handleRegistryAndBalances(
        transaction,
        originalData,
        oldParty,
        newParty,
        adminId,
        session,
        isPartyChanged,
        updateData
      );
      // Commit transaction
     
      await session.commitTransaction();

      // Fetch and return final transaction
      const finalTransaction = await this.getMetalTransactionById(
        transactionId
      );
     
      return finalTransaction;
    } catch (error) {
      console.error(
        `[UPDATE_TRANSACTION_ERROR] Error updating transaction ${transactionId}:`,
        {
          message: error.message,
          code: error.code,
          stack: error.stack,
          transactionId,
          adminId,
          updateData: updateData
            ? JSON.stringify(updateData, null, 2)
            : "undefined",
        }
      );

      await session.abortTransaction();
      throw this.handleError(
        createAppError(
          error.message || "Failed to update metal transaction",
          error.statusCode || 500,
          error.code || "UPDATE_TRANSACTION_FAILED",
          {
            transactionId,
            adminId,
            updateData: updateData || null, // Safely handle undefined updateData
          }
        )
      );
    } finally {
      console.log(
        `[UPDATE_TRANSACTION] Ending session for transaction ${transactionId}`
      );
      await session.endSession();
    }
  }
  // Helper methods for updateMetalTransaction
  static validateUpdateInputs(transactionId, updateData, adminId) {
    if (!mongoose.isValidObjectId(transactionId)) {
      throw createAppError(
        "Invalid transaction ID",
        400,
        "INVALID_TRANSACTION_ID"
      );
    }
    if (!mongoose.isValidObjectId(adminId)) {
      throw createAppError("Invalid admin ID", 400, "INVALID_ADMIN_ID");
    }
    if (!updateData || typeof updateData !== "object") {
      throw createAppError(
        "Update data must be a valid object",
        400,
        "INVALID_UPDATE_DATA"
      );
    }
    if (Object.keys(updateData).length === 0) {
      throw createAppError("No update data provided", 400, "NO_UPDATE_DATA");
    }
    if (
      updateData.partyCode &&
      !mongoose.isValidObjectId(updateData.partyCode)
    ) {
      throw createAppError("Invalid party code", 400, "INVALID_PARTY_CODE");
    }
    if (
      updateData.stockItems &&
      (!Array.isArray(updateData.stockItems) ||
        updateData.stockItems.length === 0)
    ) {
      throw createAppError(
        "Stock items must be a non-empty array",
        400,
        "INVALID_STOCK_ITEMS"
      );
    }
  }

  static async fetchParties(oldPartyId, newPartyId, isPartyChanged, session) {
    const oldParty = await Account.findById(oldPartyId).session(session);
    if (!oldParty || !oldParty.isActive) {
      throw createAppError(
        `Party ${oldPartyId} not found or inactive`,
        404,
        "PARTY_NOT_FOUND"
      );
    }

    let newParty = oldParty;
    if (isPartyChanged) {
      newParty = await Account.findById(newPartyId).session(session);
      if (!newParty || !newParty.isActive) {
        throw createAppError(
          `New party ${newPartyId} not found or inactive`,
          400,
          "NEW_PARTY_NOT_FOUND"
        );
      }
      console.log(
        `[UPDATE_TRANSACTION] Party changed from ${oldParty.customerName} (${oldParty.accountCode}) ` +
          `to ${newParty.customerName} (${newParty.accountCode})`
      );
    }

    return [oldParty, newParty];
  }

  static applyTransactionUpdates(transaction, updateData) {
    // Update only allowed fields
    const allowedFields = [
      "partyCode",
      "stockItems",
      "otherCharges",
      "totalSummary",
      "voucherDate",
      "voucherNumber",
      "transactionType",
      "fixed",
      "unfix",
    ];

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        transaction[key] = value;
      }
    }
  }

  /** 🔹 Hooked inside your handleRegistryAndBalances() */
  static async handleRegistryAndBalances(
    transaction,
    originalData,
    oldParty,
    newParty,
    adminId,
    session,
    isPartyChanged,
    updateData
  ) {
    if (transaction.stockItems.length === 0) {
      throw createAppError(
        "Transaction must have at least one stock item",
        400,
        "MINIMUM_STOCK_ITEMS_REQUIRED"
      );
    }

    await Promise.all([
      this.deleteRegistryEntry(transaction, session),
      this.deleteStocks(transaction.voucherNumber, session),
    ]);

    // reverse old balances first
    await this.updateTradeDebtorsBalances(
      oldParty._id,
      originalData,
      session,
      true
    );

    // reinsert registry
    const newRegistryEntries = this.buildRegistryEntries(
      transaction,
      newParty,
      adminId
    );
    if (newRegistryEntries.length > 0) {
      await Registry.insertMany(newRegistryEntries, {
        session,
        ordered: false,
      });
    }

    // apply new balances
    await this.updateAccountBalances(newParty, transaction, session);

    // inventory update
    switch (transaction.transactionType) {
      case "purchase":
      case "saleReturn":
        await InventoryService.updateInventory(
          transaction,
          false,
          adminId,
          session
        );
        break;
      case "sale":
      case "purchaseReturn":
        await InventoryService.updateInventory(
          transaction,
          true,
          adminId,
          session
        );
        break;
      default:
        throw createAppError(
          "Invalid transaction type",
          400,
          "INVALID_TRANSACTION_TYPE"
        );
    }
  }

  static async updateReverseAccountBalances(party, originalData, session) {
    try {
      // MINUS THE OLD BALANCES
      const { transactionType, fixed, unfix, stockItems, totalSummary } =
        originalData;
      const totals = this.calculateTotals(stockItems, totalSummary);
      const mode = this.getTransactionMode(fixed, unfix);
      const balanceChanges = this.calculateBalanceChanges(
        transactionType,
        mode,
        totals
      );
      console.log(
        `[BALANCE_UPDATE] Reversing balances for party: ${party._id}`,
        { balanceChanges }
      );

      party.balances.goldBalance.totalGrams -= balanceChanges.goldBalance;
      party.balances.goldBalance.totalValue -= balanceChanges.goldValue;
      party.balances.cashBalance.amount -=
        balanceChanges.cashBalance +
        balanceChanges.premiumBalance +
        balanceChanges.discountBalance;
      party.balances.cashBalance.lastUpdated = new Date();

      await party.save({ session });
    } catch (error) {
      console.error(
        `[BALANCE_UPDATE_ERROR] Failed to reverse balances for party: ${party._id}`,
        error
      );
      throw createAppError(
        `Failed to reverse balances: ${error.message}`,
        500,
        "REVERSE_BALANCES_FAILED"
      );
    }
  }

  static async deleteStocks(voucherCode, session = null) {
    try {
      console.log(
        `[CLEANUP] Deleting inventory logs for voucher: ${voucherCode}`
      );
      const query = InventoryLog.deleteMany({ voucherCode });

      // Apply session if provided
      if (session) {
        query.session(session);
      }

      const result = await query;
      console.log(
        `[CLEANUP] Deleted ${result.deletedCount} inventory logs for voucher: ${voucherCode}`
      );
      return result;
    } catch (error) {
      console.error(
        `[CLEANUP_ERROR] Failed to delete inventory logs for voucher: ${voucherCode}`,
        error
      );
      throw createAppError(
        `Failed to delete inventory logs: ${error.message}`,
        500,
        "DELETE_STOCKS_FAILED"
      );
    }
  }

  // [NEW] Validate party balances before reversal
  static async validatePartyBalances(party, transaction, isReversal = false) {
    const { transactionType, stockItems, totalSummary } = transaction;
    const totals = this.calculateTotals(stockItems, totalSummary);
    const mode = this.getTransactionMode(transaction.fixed, transaction.unfix);

    const balanceChanges = this.calculateBalanceChanges(
      transactionType,
      mode,
      totals
    );

    if (isReversal) {
      // Check if party has sufficient balances to reverse the transaction
      const goldBalance = party.balances.goldBalance.totalGrams || 0;
      const cashBalance = party.balances.cashBalance.amount || 0;

      // For reversal, negate the balance changes
      const requiredGoldBalance = -balanceChanges.goldBalance;
      const requiredCashBalance = -(
        balanceChanges.cashBalance +
        balanceChanges.premiumBalance +
        balanceChanges.discountBalance
      );

      // if (requiredGoldBalance > goldBalance) {
      //   throw createAppError(
      //     `Insufficient gold balance for reversal: ${goldBalance}g available, ${requiredGoldBalance}g required`,
      //     400,
      //     "INSUFFICIENT_GOLD_BALANCE"
      //   );
      // }

      // if (requiredCashBalance > cashBalance) {
      //   throw createAppError(
      //     `Insufficient cash balance for reversal: ${cashBalance} AED available, ${requiredCashBalance} AED required`,
      //     400,
      //     "INSUFFICIENT_CASH_BALANCE"
      //   );
      // }
    }
  }

  // Delete metal transaction (soft delete)
  static async deleteMetalTransaction(transactionId, adminId) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const transaction = await MetalTransaction.findById(
        transactionId
      ).session(session);
      if (!transaction || !transaction.isActive) {
        throw createAppError(
          "Metal transaction not found",
          404,
          "TRANSACTION_NOT_FOUND"
        );
      }
      await this.deleteRegistryEntry(transaction);

      // update the stocks

      const party = await Account.findById(transaction.partyCode).session(
        session
      );

      await this.updateTradeDebtorsBalances(
        party._id,
        transaction,
        session,
        false,
        true
      );

      // hard delete metalTransaction
      await MetalTransaction.deleteOne({ _id: transactionId }).session(session);

      await session.commitTransaction();
      return { message: "Metal transaction deleted successfully" };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Add stock item
  static async addStockItem(transactionId, stockItemData, adminId) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const transaction = await MetalTransaction.findById(
        transactionId
      ).session(session);
      if (!transaction || !transaction.isActive) {
        throw createAppError(
          "Metal transaction not found",
          404,
          "TRANSACTION_NOT_FOUND"
        );
      }

      transaction.addStockItem(stockItemData);
      transaction.calculateSessionTotals();
      transaction.updatedBy = adminId;
      await transaction.save({ session });

      const party = await Account.findById(transaction.partyCode).session(
        session
      );
      const tempTransaction = {
        ...transaction.toObject(),
        stockItems: [stockItemData],
      };
      await this.createCompleteRegistryEntries(
        tempTransaction,
        party,
        adminId,
        session
      );
      await this.updateTradeDebtorsBalances(
        party._id,
        tempTransaction,
        session
      );

      await session.commitTransaction();
      return await this.getMetalTransactionById(transactionId);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Update stock item
  static async updateStockItem(
    transactionId,
    stockItemId,
    updateData,
    adminId
  ) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const transaction = await MetalTransaction.findById(
        transactionId
      ).session(session);
      if (!transaction || !transaction.isActive) {
        throw createAppError(
          "Metal transaction not found",
          404,
          "TRANSACTION_NOT_FOUND"
        );
      }

      const stockItem = transaction.getStockItem(stockItemId);
      if (!stockItem) {
        throw createAppError(
          "Stock item not found",
          404,
          "STOCK_ITEM_NOT_FOUND"
        );
      }

      Object.assign(stockItem, updateData);
      transaction.calculateSessionTotals();
      transaction.updatedBy = adminId;
      await transaction.save({ session });

      const party = await Account.findById(transaction.partyCode).session(
        session
      );
      await this.createCompleteRegistryEntries(
        transaction,
        party,
        adminId,
        session
      );

      await session.commitTransaction();
      return await this.getMetalTransactionById(transactionId);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Remove stock item
  static async removeStockItem(transactionId, stockItemId, adminId) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const transaction = await MetalTransaction.findById(
        transactionId
      ).session(session);
      if (!transaction || !transaction.isActive) {
        throw createAppError(
          "Metal transaction not found",
          404,
          "TRANSACTION_NOT_FOUND"
        );
      }

      transaction.removeStockItem(stockItemId);
      if (transaction.stockItems.length === 0) {
        throw createAppError(
          "Transaction must have at least one stock item",
          400,
          "MINIMUM_STOCK_ITEMS_REQUIRED"
        );
      }

      transaction.calculateSessionTotals();
      transaction.updatedBy = adminId;
      await transaction.save({ session });

      await session.commitTransaction();
      return await this.getMetalTransactionById(transactionId);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Update session totals
  static async updateSessionTotals(
    transactionId,
    totalSummary,
    vatPercentage = 0,
    adminId
  ) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const transaction = await MetalTransaction.findById(
        transactionId
      ).session(session);
      if (!transaction || !transaction.isActive) {
        throw createAppError(
          "Metal transaction not found",
          404,
          "TRANSACTION_NOT_FOUND"
        );
      }

      if (totalSummary) {
        transaction.totalSummary = {
          ...transaction.totalSummary,
          ...totalSummary,
        };
      }

      if (vatPercentage > 0) {
        const netAmount = transaction.totalSummary.netAmountAED || 0;
        const vatAmount = (netAmount * vatPercentage) / 100;
        transaction.totalSummary.vatAmount = vatAmount;
        transaction.totalSummary.vatPercentage = vatPercentage;
        transaction.totalSummary.totalAmountAED = netAmount + vatAmount;
      }

      transaction.updatedBy = adminId;
      await transaction.save({ session });

      await session.commitTransaction();
      return await this.getMetalTransactionById(transactionId);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Calculate and update session totals
  static async calculateAndUpdateSessionTotals(
    transactionId,
    vatPercentage = 0,
    adminId
  ) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const transaction = await MetalTransaction.findById(
        transactionId
      ).session(session);
      if (!transaction || !transaction.isActive) {
        throw createAppError(
          "Metal transaction not found",
          404,
          "TRANSACTION_NOT_FOUND"
        );
      }

      transaction.calculateSessionTotals();
      if (vatPercentage > 0) {
        const netAmount = transaction.totalSummary.netAmountAED || 0;
        const vatAmount = (netAmount * vatPercentage) / 100;
        transaction.totalSummary.vatAmount = vatAmount;
        transaction.totalSummary.vatPercentage = vatPercentage;
        transaction.totalSummary.totalAmountAED = netAmount + vatAmount;
      }

      transaction.updatedBy = adminId;
      await transaction.save({ session });

      await session.commitTransaction();
      return await this.getMetalTransactionById(transactionId);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get transaction statistics
  static async getTransactionStatistics(filters = {}) {
    const matchStage = { isActive: true };
    if (filters.transactionType)
      matchStage.transactionType = filters.transactionType;
    if (filters.partyCode)
      matchStage.partyCode = new mongoose.Types.ObjectId(filters.partyCode);
    if (filters.startDate && filters.endDate) {
      matchStage.voucherDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    const stats = await MetalTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: "$totalSummary.totalAmountAED" },
          totalNetAmount: { $sum: "$totalSummary.netAmountAED" },
          totalVatAmount: { $sum: "$totalSummary.vatAmount" },
          averageTransactionAmount: {
            $avg: "$totalSummary.totalAmountAED",
          },
          purchaseCount: {
            $sum: { $cond: [{ $eq: ["$transactionType", "purchase"] }, 1, 0] },
          },
          saleCount: {
            $sum: { $cond: [{ $eq: ["$transactionType", "sale"] }, 1, 0] },
          },
          purchaseAmount: {
            $sum: {
              $cond: [
                { $eq: ["$transactionType", "purchase"] },
                "$totalSummary.totalAmountAED",
                0,
              ],
            },
          },
          saleAmount: {
            $sum: {
              $cond: [
                { $eq: ["$transactionType", "sale"] },
                "$totalSummary.totalAmountAED",
                0,
              ],
            },
          },
        },
      },
    ]);

    const statusBreakdown = await MetalTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalSummary.totalAmountAED" },
        },
      },
    ]);

    return {
      overview: stats[0] || {
        totalTransactions: 0,
        totalAmount: 0,
        totalNetAmount: 0,
        totalVatAmount: 0,
        averageTransactionAmount: 0,
        purchaseCount: 0,
        saleCount: 0,
        purchaseAmount: 0,
        saleAmount: 0,
      },
      statusBreakdown: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = { count: item.count, totalAmount: item.totalAmount };
        return acc;
      }, {}),
    };
  }

  // Get profit/loss analysis
  static async getProfitLossAnalysis(filters = {}) {
    const matchStage = { isActive: true };
    if (filters.partyCode)
      matchStage.partyCode = new mongoose.Types.ObjectId(filters.partyCode);
    if (filters.stockCode)
      matchStage["stockItems.stockCode"] = new mongoose.Types.ObjectId(
        filters.stockCode
      );
    if (filters.startDate && filters.endDate) {
      matchStage.voucherDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    const analysis = await MetalTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$transactionType",
          totalAmount: { $sum: "$totalSummary.totalAmountAED" },
          totalNetAmount: { $sum: "$totalSummary.netAmountAED" },
          transactionCount: { $sum: 1 },
          totalWeight: { $sum: { $sum: "$stockItems.weightInOz" } },
          averageRate: {
            $avg: { $avg: "$stockItems.metalRateRequirements.rate" },
          },
        },
      },
    ]);

    const purchases = analysis.find((item) => item._id === "purchase") || {
      totalAmount: 0,
      totalNetAmount: 0,
      transactionCount: 0,
      totalWeight: 0,
      averageRate: 0,
    };

    const sales = analysis.find((item) => item._id === "sale") || {
      totalAmount: 0,
      totalNetAmount: 0,
      transactionCount: 0,
      totalWeight: 0,
      averageRate: 0,
    };

    const grossProfit = sales.totalNetAmount - purchases.totalNetAmount;
    const profitMargin =
      sales.totalNetAmount > 0 ? (grossProfit / sales.totalNetAmount) * 100 : 0;

    return {
      purchases: { ...purchases, _id: undefined },
      sales: { ...sales, _id: undefined },
      profitLoss: {
        grossProfit,
        profitMargin,
        totalRevenue: sales.totalAmount,
        totalCost: purchases.totalAmount,
        netProfit: sales.totalAmount - purchases.totalAmount,
      },
    };
  }

  // Updated Registry helper methods with enhanced logic
  static async createCompleteRegistryEntries(
    transaction,
    party,
    adminId,
    session
  ) {
    const registryEntries = [];
    const transactionId = `TXN-${new Date().getFullYear()}-${
      Math.floor(Math.random() * 900) + 100
    }`;

    // Calculate totals for charges
    let totalMakingCharges = 0;
    let totalPremiumAmount = 0;
    let totalPureWeight = 0;
    let totalStockValue = 0;

    // Process each stock item
    for (const stockItem of transaction.stockItems) {
      const pureWeight = stockItem.pureWeight || 0;
      const itemValue = stockItem.itemTotal?.itemTotalAmount || 0;
      const makingCharges = stockItem.makingCharges?.amount || 0;
      const premiumAmount = stockItem.premium?.amount || 0;

      totalPureWeight += pureWeight;
      totalStockValue += itemValue;
      totalMakingCharges += makingCharges;
      totalPremiumAmount += premiumAmount;

      const isPurchase = transaction.transactionType === "purchase";
      const isSale = transaction.transactionType === "sale";
      const isPurchaseReturn = transaction.transactionType === "purchaseReturn";
      const isSaleReturn = transaction.transactionType === "saleReturn";

      // Gold Entry
      registryEntries.push(
        new Registry({
          transactionId: transactionId,
          type: "gold",
          description: `${
            isPurchaseReturn
              ? "Purchase Return"
              : isSaleReturn
              ? "Sale Return"
              : transaction.transactionType
          } - ${stockItem.description || "Metal Item"}`,
          paryty: transaction.partyCode,
          value: pureWeight,
          debit: isSale || isPurchaseReturn ? pureWeight : 0,
          credit: isPurchase || isSaleReturn ? pureWeight : 0,
          transactionDate: new Date(),
          reference: `Stock-${stockItem._id}`,
          createdBy: adminId,
        })
      );

      // Stock Balance Entry
      registryEntries.push(
        new Registry({
          transactionId: transactionId,
          type: "stock_balance",
          description: `${
            isPurchaseReturn
              ? "Purchase Return"
              : isSaleReturn
              ? "Sale Return"
              : transaction.transactionType
          } Stock Balance - ${stockItem.description || "Metal Item"}`,
          paryty: transaction.partyCode,
          value: pureWeight,
          debit: isSale || isPurchaseReturn ? pureWeight : 0,
          credit: isPurchase || isSaleReturn ? pureWeight : 0,
          transactionDate: new Date(),
          reference: `Stock-${stockItem._id}`,
          createdBy: adminId,
        })
      );
    }

    // Making Charges Entry
    if (totalMakingCharges > 0) {
      registryEntries.push(
        new Registry({
          transactionId: transactionId,
          type: "MAKING_CHARGES",
          description: `${
            transaction.transactionType === "purchaseReturn"
              ? "Purchase Return"
              : transaction.transactionType === "saleReturn"
              ? "Sale Return"
              : transaction.transactionType
          } - Making Charges`,
          paryty: transaction.partyCode,
          value: totalMakingCharges,
          debit:
            transaction.transactionType === "sale" ||
            transaction.transactionType === "purchaseReturn"
              ? totalMakingCharges
              : 0,
          credit:
            transaction.transactionType === "purchase" ||
            transaction.transactionType === "saleReturn"
              ? totalMakingCharges
              : 0,
          transactionDate: new Date(),
          reference: `MakingCharges-${transaction._id}`,
          createdBy: adminId,
        })
      );
    }

    if (totalOtherCharges > 0) {
      registryEntries.push(
        new Registry({
          transactionId: transactionId,
          type: "OTHER_CHARGES",
          description: `${
            transaction.transactionType === "purchaseReturn"
              ? "Purchase Return"
              : transaction.transactionType === "saleReturn"
              ? "Sale Return"
              : transaction.transactionType
          } - Other Charges`,
          paryty: transaction.partyCode,
          value: totalOtherCharges,
          debit:
            transaction.transactionType === "sale" ||
            transaction.transactionType === "purchaseReturn"
              ? totalOtherCharges
              : 0,
          credit:
            transaction.transactionType === "purchase" ||
            transaction.transactionType === "saleReturn"
              ? totalOtherCharges
              : 0,
          transactionDate: new Date(),
          reference: `OtherCharges-${transaction._id}`,
          createdBy: adminId,
        })
      );
    }

    if (totalVatAmount > 0) {
      registryEntries.push(
        new Registry({
          transactionId: transactionId,
          type: "VAT_AMOUNT",
          description: `${
            transaction.transactionType === "purchaseReturn"
              ? "Purchase Return"
              : transaction.transactionType === "saleReturn"
              ? "Sale Return"
              : transaction.transactionType
          } - VAT Amount`,
          paryty: transaction.partyCode,
          value: totalVatAmount,
          debit:
            transaction.transactionType === "sale" ||
            transaction.transactionType === "purchaseReturn"
              ? totalVatAmount
              : 0,
          credit:
            transaction.transactionType === "purchase" ||
            transaction.transactionType === "saleReturn"
              ? totalVatAmount
              : 0,
          transactionDate: new Date(),
          reference: `VatAmount-${transaction._id}`,
          createdBy: adminId,
        })
      );
    }

    // Premium Entry
    if (totalPremiumAmount > 0) {
      registryEntries.push(
        new Registry({
          transactionId: transactionId,
          type: "premium",
          description: `${
            transaction.transactionType === "purchaseReturn"
              ? "Purchase Return"
              : transaction.transactionType === "saleReturn"
              ? "Sale Return"
              : transaction.transactionType
          } - Premium Amount`,
          paryty: transaction.partyCode,
          value: totalPremiumAmount,
          debit:
            transaction.transactionType === "sale" ||
            transaction.transactionType === "purchaseReturn"
              ? totalPremiumAmount
              : 0,
          credit:
            transaction.transactionType === "purchase" ||
            transaction.transactionType === "saleReturn"
              ? totalPremiumAmount
              : 0,
          transactionDate: new Date(),
          reference: `Premium-${transaction._id}`,
          createdBy: adminId,
        })
      );
    }

    // Party Gold Balance Entry
    registryEntries.push(
      new Registry({
        transactionId: transactionId,
        type: "party_gold_balance",
        description: `${
          transaction.transactionType === "purchaseReturn"
            ? "Purchase Return"
            : transaction.transactionType === "saleReturn"
            ? "Sale Return"
            : transaction.transactionType
        } - Party Gold Balance`,
        paryty: transaction.partyCode,
        value: totalPureWeight,
        debit:
          transaction.transactionType === "purchase" ||
          transaction.transactionType === "saleReturn"
            ? totalPureWeight
            : 0,
        credit:
          transaction.transactionType === "sale" ||
          transaction.transactionType === "purchaseReturn"
            ? totalPureWeight
            : 0,
        transactionDate: new Date(),
        reference: `PartyGold-${transaction._id}`,
        createdBy: adminId,
      })
    );

    // Party Cash Balance Entry
    const totalAmountAED = transaction.totalSummary?.totalAmountAED || 0;
    if (totalAmountAED > 0) {
      registryEntries.push(
        new Registry({
          transactionId: transactionId,
          type: "party_cash_balance",
          description: `${
            transaction.transactionType === "purchaseReturn"
              ? "Purchase Return"
              : transaction.transactionType === "saleReturn"
              ? "Sale Return"
              : transaction.transactionType
          } - Party Cash Balance`,
          paryty: transaction.partyCode,
          value: totalAmountAED,
          debit:
            transaction.transactionType === "sale" ||
            transaction.transactionType === "purchaseReturn"
              ? totalAmountAED
              : 0,
          credit:
            transaction.transactionType === "purchase" ||
            transaction.transactionType === "saleReturn"
              ? totalAmountAED
              : 0,
          transactionDate: new Date(),
          reference: `PartyCash-${transaction._id}`,
          createdBy: adminId,
        })
      );
    }

    // Insert all registry entries
    if (registryEntries.length > 0) {
      await Registry.insertMany(registryEntries, { session });
    }
  }
  static async createReversalRegistryEntries(
    transaction,
    party,
    adminId,
    session
  ) {
    // Use buildRegistryEntries to get the original entries
    const originalEntries = this.buildRegistryEntries(
      transaction,
      party,
      adminId
    );

    // Reverse the entries by swapping debit and credit
    const reversalEntries = originalEntries.map((entry) => ({
      ...entry,
      transactionId: `${entry.transactionId}-REV`,
      description: `REVERSAL - ${entry.description}`,
      debit: entry.credit, // Swap debit and credit
      credit: entry.debit,
      transactionDate: new Date(), // Use current date for reversal
      reference: `REV-${entry.reference}`,
      createdAt: new Date(),
    }));

    // Insert reversal entries
    if (reversalEntries.length > 0) {
      await Registry.insertMany(reversalEntries, { session, ordered: false });
    }
  }

  /** 🔹 Used for reversal updates (undoing old balances) */
  static async updateTradeDebtorsBalances(
    partyId,
    transaction,
    session,
    isReversal = false
  ) {
    const party = await Account.findById(partyId).session(session);
    if (!party) throw createAppError("Party not found", 404, "PARTY_NOT_FOUND");

    const {
      transactionType,
      stockItems,
      totalSummary,
      fixed,
      unfix,
      partyCurrency,
    } = transaction;
    const totals = this.calculateTotals(stockItems, totalSummary);
    const mode = this.getTransactionMode(fixed, unfix);
    const ch = this.calculateBalanceChanges(
      transactionType,
      mode,
      totals,
      partyCurrency
    );
    const sign = isReversal ? -1 : 1;

    // GOLD
    if (ch.goldBalance !== 0 || ch.goldValue !== 0) {
      await this.incGold(
        partyId,
        sign * (ch.goldBalance || 0),
        sign * (ch.goldValue || 0),
        session
      );
    }

    // CASH
    const netCash =
      (ch.cashBalance || 0) +
      (ch.premiumBalance || 0) +
      (ch.otherCharges || 0) +
      (ch.discountBalance || 0);

    if (partyCurrency && netCash !== 0) {
      await this.ensureCashRow(partyId, partyCurrency, session);
      await this.incCash(partyId, partyCurrency, sign * netCash, session);
    }
  }

  // Get party balance summary
  static async getPartyBalanceSummary(partyId) {
    const party = await Account.findById(partyId)
      .populate("balances.goldBalance.currency", "code symbol")
      .populate("balances.cashBalance.currency", "code symbol");

    if (!party || !party.isActive) {
      throw createAppError(
        "Party not found or inactive",
        404,
        "PARTY_NOT_FOUND"
      );
    }

    return {
      partyInfo: {
        id: party._id,
        name: party.name,
        code: party.code,
        email: party.email,
        phone: party.phone,
      },
      goldBalance: party.balances.goldBalance,
      cashBalance: party.balances.cashBalance,
      summary: party.balances.summary,
      lastTransactionDate: party.balances.lastTransactionDate,
    };
  }

  // Get transaction summary by date range
  static async getTransactionSummaryByDateRange(
    startDate,
    endDate,
    transactionType = null
  ) {
    const matchStage = {
      isActive: true,
      voucherDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };

    if (transactionType) {
      matchStage.transactionType = transactionType;
    }

    const summary = await MetalTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$voucherDate" },
            },
            transactionType: "$transactionType",
          },
          transactionCount: { $sum: 1 },
          totalAmount: { $sum: "$totalSummary.totalAmountAED" },
          totalNetAmount: { $sum: "$totalSummary.netAmountAED" },
          totalVatAmount: { $sum: "$totalSummary.vatAmount" },
          totalWeight: { $sum: { $sum: "$stockItems.weightInOz" } },
          totalPureWeight: { $sum: { $sum: "$stockItems.pureWeight" } },
        },
      },
      {
        $sort: { "_id.date": 1, "_id.transactionType": 1 },
      },
    ]);

    return summary;
  }

  // Get top parties by transaction volume
  static async getTopPartiesByVolume(
    limit = 10,
    transactionType = null,
    startDate = null,
    endDate = null
  ) {
    const matchStage = { isActive: true };

    if (transactionType) {
      matchStage.transactionType = transactionType;
    }

    if (startDate && endDate) {
      matchStage.voucherDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const topParties = await MetalTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$partyCode",
          transactionCount: { $sum: 1 },
          totalAmount: { $sum: "$totalSummary.totalAmountAED" },
          totalWeight: { $sum: { $sum: "$stockItems.weightInOz" } },
          totalPureWeight: { $sum: { $sum: "$stockItems.pureWeight" } },
          averageTransactionAmount: {
            $avg: "$totalSummary.totalAmountAED",
          },
          lastTransactionDate: { $max: "$voucherDate" },
        },
      },
      {
        $lookup: {
          from: "tradedebtors",
          localField: "_id",
          foreignField: "_id",
          as: "partyInfo",
        },
      },
      {
        $unwind: "$partyInfo",
      },
      {
        $project: {
          partyId: "$_id",
          partyName: "$partyInfo.name",
          partyCode: "$partyInfo.code",
          transactionCount: 1,
          totalAmount: 1,
          totalWeight: 1,
          totalPureWeight: 1,
          averageTransactionAmount: 1,
          lastTransactionDate: 1,
        },
      },
      {
        $sort: { totalAmount: -1 },
      },
      {
        $limit: limit,
      },
    ]);

    return topParties;
  }

  // Validate transaction before processing
  static async validateTransaction(transactionData) {
    const errors = [];

    // Basic validations
    if (!transactionData.partyCode) {
      errors.push("Party code is required");
    }

    if (
      !transactionData.transactionType ||
      !["purchase", "sale"].includes(transactionData.transactionType)
    ) {
      errors.push("Valid transaction type (purchase/sale) is required");
    }

    if (!transactionData.voucherDate) {
      errors.push("Voucher date is required");
    }

    if (
      !transactionData.stockItems ||
      !Array.isArray(transactionData.stockItems) ||
      transactionData.stockItems.length === 0
    ) {
      errors.push("At least one stock item is required");
    }

    // Validate stock items
    if (transactionData.stockItems) {
      transactionData.stockItems.forEach((item, index) => {
        if (!item.stockCode) {
          errors.push(`Stock code is required for item ${index + 1}`);
        }
        if (!item.weightInOz || item.weightInOz <= 0) {
          errors.push(`Valid weight is required for item ${index + 1}`);
        }
        if (!item.purity || item.purity <= 0 || item.purity > 100) {
          errors.push(`Valid purity (0-100) is required for item ${index + 1}`);
        }
      });
    }

    // Check if party exists and is active
    if (transactionData.partyCode) {
      const party = await Account.findById(transactionData.partyCode);
      if (!party || !party.isActive) {
        errors.push("Party not found or inactive");
      }
    }

    if (errors.length > 0) {
      throw createAppError(
        `Validation failed: ${errors.join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    return true;
  }

  // Bulk operations
  static async bulkCreateTransactions(transactionsData, adminId) {
    const results = [];
    const errors = [];

    for (let i = 0; i < transactionsData.length; i++) {
      try {
        await this.validateTransaction(transactionsData[i]);
        const transaction = await this.createMetalTransaction(
          transactionsData[i],
          adminId
        );
        results.push({ index: i, success: true, transaction });
      } catch (error) {
        errors.push({ index: i, success: false, error: error.message });
      }
    }

    return {
      successful: results,
      failed: errors,
      summary: {
        total: transactionsData.length,
        successful: results.length,
        failed: errors.length,
      },
    };
  }
}

export default MetalTransactionService;
