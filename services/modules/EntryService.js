// services/modules/EntryService.js
import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import CurrencyMaster from "../../models/modules/CurrencyMaster.js";
import RegistryService from "./RegistryService.js";
import InventoryService from "./inventoryService.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import { createAppError } from "../../utils/errorHandler.js";
import Entry from "../../models/modules/EntryModel.js";

class EntryService {
  static async ensureCashBalance(account, currencyId) {
    const id = currencyId.toString();
    let bal = account.balances.cashBalance.find(
      (b) => b.currency.toString() === id
    );
    if (!bal) {
      bal = { currency: currencyId, amount: 0, lastUpdated: new Date() };
      account.balances.cashBalance.push(bal);
    }
    return bal;
  }
  // === METAL ===
  static async handleMetalReceipt(entry) {
    const account = await Account.findById(entry.party);
    if (!account) throw createAppError("Party not found", 404);

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;
      account.balances.goldBalance = {
        totalGrams: prev + item.purityWeight,
        lastUpdated: new Date(),
      };

      const txId = await Registry.generateTransactionId();
      const desc = item.remarks?.trim() || "Metal receipt";

      await Registry.create([
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "GOLD_STOCK",
          description: desc,
          value: item.grossWeight,
          credit: item.grossWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          isBullion: true,
        },
        {
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "GOLD",
          description: desc,
          value: item.purityWeight,
          debit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          isBullion: true,
        },
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "PARTY_GOLD_BALANCE",
          description: desc,
          value: item.purityWeight,
          credit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          isBullion: true,
        },
      ]);

      await InventoryService.updateInventory(
        {
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              transactionType: "metalReceipt",
            },
          ],
        },
        false,
        entry.enteredBy
      );
    }
    await account.save();
  }

  static async handleMetalPayment(entry) {
    const account = await Account.findById(entry.party);
    if (!account) throw createAppError("Party not found", 404);

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;
      account.balances.goldBalance = {
        totalGrams: prev - item.purityWeight,
        lastUpdated: new Date(),
      };

      const txId = await Registry.generateTransactionId();
      const desc = item.remarks?.trim() || "Metal payment";

      await Registry.create([
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "GOLD_STOCK",
          description: desc,
          value: item.grossWeight,
          debit: item.grossWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          isBullion: true,
        },
        {
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "GOLD",
          description: desc,
          value: item.purityWeight,
          credit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          isBullion: true,
        },
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "PARTY_GOLD_BALANCE",
          description: desc,
          value: item.purityWeight,
          debit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          isBullion: true,
        },
      ]);

      await InventoryService.updateInventory(
        {
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              transactionType: "metalPayment",
            },
          ],
        },
        true,
        entry.enteredBy
      );
    }
    await account.save();
  }
  static async updateAccountCashBalance(accountId, currencyId, amountChange) {
    const account = await Account.findById(accountId);
    if (!account) return;

    const bal = await this.ensureCashBalance(account, currencyId);
    bal.amount += amountChange;
    bal.lastUpdated = new Date();
    await account.save();
  }

  // === CASH (UNIFIED) ===
  static async handleCashTransaction(entry, isReceipt = true) {
    const partyAccount = await Account.findById(entry.party);
    if (!partyAccount) throw createAppError("Party not found", 404);

    const registryEntries = [];

    for (const cashItem of entry.cash) {
      const currency = await CurrencyMaster.findById(cashItem.currency);
      if (!currency) throw createAppError("Currency not found", 404);

      const amount = Number(cashItem.amount);
      if (amount <= 0) throw createAppError("Amount > 0", 400);

      // --- Determine DR / CR ---
      const partyChange = isReceipt ? amount : -amount;
      const oppositeChange = isReceipt ? -amount : amount;

      // --- Update PARTY BALANCE ---
      await this.updateAccountCashBalance(
        entry.party,
        cashItem.currency,
        partyChange
      );

      // --- Determine which account is opposite (bank/cash/transfer etc) ---
      let oppositeAccount = null;

      if (["cash", "bank", "cheque", "card"].includes(cashItem.cashType)) {
        oppositeAccount = cashItem.chequeBank || cashItem.account;
      } else if (cashItem.cashType === "transfer") {
        oppositeAccount = cashItem.transferAccount;
      }

      // --- Update opposite account balance (if applicable) ---
      if (oppositeAccount) {
        await this.updateAccountCashBalance(
          oppositeAccount,
          cashItem.currency,
          oppositeChange
        );
      }

      // --- Build description ---
      let desc = `${isReceipt ? "Received" : "Paid"} ${amount} ${
        currency.currencyCode
      } via ${cashItem.cashType}`;
      if (cashItem.cashType === "transfer")
        desc += ` Ref: ${cashItem.transferReference || ""}`;

      // --- Registry Entries (same as before, but now balances are correct) ---
      const txId = await Registry.generateTransactionId();

      registryEntries.push(
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "PARTY_CASH_BALANCE",
          description: desc,
          value: amount,
          [isReceipt ? "credit" : "debit"]: amount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          isBullion: false,
          currency: cashItem.currency,
          cashType: cashItem.cashType,
          accountRef: oppositeAccount,
        },
        {
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "CASH",
          description: desc,
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          isBullion: false,
          currency: cashItem.currency,
          cashType: cashItem.cashType,
        }
      );

      // --- VAT ---
      if (cashItem.vatAmount > 0) {
        registryEntries.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "VAT_AMOUNT",
          description: `VAT ${cashItem.vatPercentage}%`,
          value: cashItem.vatAmount,
          [isReceipt ? "debit" : "credit"]: cashItem.vatAmount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: isReceipt ? entry.party : null,
          isBullion: false,
        });
      }
      if (oppositeAccount) {
        registryEntries.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "PARTY_CASH_BALANCE", // NEW TYPE
          description: desc + " (Opposite Account)",
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount, // opposite of party
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: oppositeAccount,
          currency: cashItem.currency,
          cashType: cashItem.cashType,
          isBullion: false,
        });
      }
      // --- Card Charge ---
      if (cashItem.cashType === "card" && cashItem.cardChargeAmount > 0) {
        registryEntries.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "CARD_CHARGE",
          description: `Card charge ${cashItem.cardChargePercent}%`,
          value: cashItem.cardChargeAmount,
          debit: cashItem.cardChargeAmount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          isBullion: false,
        });
      }
    }

    await Registry.create(registryEntries);
  }

  // services/modules/EntryService.js - Updated reverse functions

  static async reverseCashTransaction(entry, isReceipt = true) {
    const partyAccount = await Account.findById(entry.party);
    if (!partyAccount) return;

    for (const c of entry.cash) {
      // Reverse party balance
      const partyBal = await this.ensureCashBalance(partyAccount, c.currency);
      partyBal.amount += isReceipt ? -c.amount : c.amount;
      partyBal.lastUpdated = new Date();

      // Reverse opposite account balance (bank/cash/transfer account)
      let oppositeAccount = null;

      if (["cash", "bank", "cheque", "card"].includes(c.cashType)) {
        oppositeAccount = c.chequeBank || c.account;
      } else if (c.cashType === "transfer") {
        oppositeAccount = c.transferAccount;
      }

      if (oppositeAccount) {
        await this.updateAccountCashBalance(
          oppositeAccount,
          c.currency,
          isReceipt ? c.amount : -c.amount // opposite of party reversal
        );
      }
    }

    await partyAccount.save();
  }

  static async reverseMetal(entry, isReceipt = true) {
    const account = await Account.findById(entry.party);
    if (!account) return;

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;
      account.balances.goldBalance = {
        totalGrams: prev + (isReceipt ? -item.purityWeight : item.purityWeight),
        lastUpdated: new Date(),
      };

      // Reverse inventory
      await InventoryService.updateInventory(
        {
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              transactionType: isReceipt ? "metalPayment" : "metalReceipt", // reverse type
            },
          ],
        },
        isReceipt, // reverse the isOutgoing flag
        entry.enteredBy
      );
    }

    await account.save();
  }

  static async cleanup(voucherCode) {
    await Promise.all([
      RegistryService.deleteRegistryByVoucher(voucherCode),
      InventoryLog.deleteMany({ voucherCode }),
    ]);
  }

  // === FETCH ===
  static async getEntryById(id) {
    const entry = await Entry.findById(id)
      .lean()
      .populate("party", "customerName accountCode")
      .populate("enteredBy", "name")
      .populate("stockItems.stock", "code name")
      .populate("cash.currency", "currencyCode symbol")
      .populate("cash.chequeBank", "customerName accountCode")
      .populate("cash.account", "customerName accountCode")
      .populate("cash.transferAccount", "customerName accountCode")
      .populate("attachments.uploadedBy", "name");

    if (!entry) throw createAppError("Not found", 404);

    if (entry.cash) {
      entry.cash = entry.cash.map((c) => {
        const currency = c.currency?.currencyCode || "";
        let desc = "";
        switch (c.cashType) {
          case "cheque":
            desc = `Cheque #${c.chequeNo} from ${
              c.chequeBank?.customerName || ""
            }`;
            break;
          case "transfer":
            desc = `Transfer to ${c.transferAccount?.customerName || ""}`;
            break;
          case "card":
            desc = `Card (Charge: ${c.cardChargePercent}%)`;
            break;
          default:
            desc = c.cashType;
        }
        return {
          ...c,
          _display: { amount: `${currency} ${c.amount}`, description: desc },
        };
      });
    }

    return entry;
  }

  static async getEntriesByType({
    type,
    page = 1,
    limit = 20,
    search,
    startDate,
    endDate,
  }) {
    const query = { type };
    if (startDate || endDate) {
      query.voucherDate = {};
      if (startDate) query.voucherDate.$gte = new Date(startDate);
      if (endDate) query.voucherDate.$lte = new Date(endDate);
    }
    if (search) {
      const partyIds = await Account.find({
        customerName: { $regex: search, $options: "i" },
      }).select("_id");
      query.$or = [
        { voucherCode: { $regex: search, $options: "i" } },
        { party: { $in: partyIds.map((p) => p._id) } },
      ];
    }

    const [entries, total] = await Promise.all([
      Entry.find(query)
        .lean()
        .populate("party", "customerName")
        .populate("enteredBy", "name")
        .populate("cash.currency", "currencyCode")
        .populate("stockItems.stock", "code")
        .sort({ voucherDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Entry.countDocuments(query),
    ]);

    return { entries, total, page, pages: Math.ceil(total / limit) };
  }
}

export default EntryService;
