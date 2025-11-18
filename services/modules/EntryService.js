import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import CurrencyMaster from "../../models/modules/CurrencyMaster.js";
import RegistryService from "./RegistryService.js";
import InventoryService from "./inventoryService.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import { createAppError } from "../../utils/errorHandler.js";
import Entry from "../../models/modules/EntryModel.js";

class EntryService {
  // Ensure a balance record exists
  static async ensureCashBalance(account, currencyId) {
    let bal = account.balances.cashBalance.find(
      (b) => b.currency.toString() === currencyId.toString()
    );

    if (!bal) {
      bal = { currency: currencyId, amount: 0, lastUpdated: new Date() };
      account.balances.cashBalance.push(bal);
    }

    return bal;
  }

  static async updateAccountCashBalance(accountId, currencyId, amount) {
    if (!accountId) return;
    const acc = await Account.findById(accountId);
    if (!acc) return;

    const bal = await this.ensureCashBalance(acc, currencyId);

    bal.amount += amount;
    bal.lastUpdated = new Date();

    await acc.save();
  }

  // ------------------------------------------------------------------------
  // METAL RECEIPT
  // ------------------------------------------------------------------------
  static async handleMetalReceipt(entry) {
    if (entry.status !== "approved") return;

    const account = await Account.findById(entry.party);
    if (!account) throw createAppError("Party not found", 404);

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;

      account.balances.goldBalance = {
        totalGrams: prev + item.purityWeight,
        lastUpdated: new Date(),
      };

      const txId = await Registry.generateTransactionId();
      const desc = item.remarks || "Metal receipt";

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

  // ------------------------------------------------------------------------
  // METAL PAYMENT
  // ------------------------------------------------------------------------
  static async handleMetalPayment(entry) {
    if (entry.status !== "approved") return;

    const account = await Account.findById(entry.party);
    if (!account) throw createAppError("Party not found", 404);

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;

      account.balances.goldBalance = {
        totalGrams: prev - item.purityWeight,
        lastUpdated: new Date(),
      };

      const txId = await Registry.generateTransactionId();
      const desc = item.remarks || "Metal payment";

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

  // ------------------------------------------------------------------------
  // CASH RECEIPT/PAYMENT
  // ------------------------------------------------------------------------
  static async handleCashTransaction(entry, isReceipt = true) {
    if (entry.status !== "approved") return;

    const registryRows = [];

    for (const c of entry.cash) {
      // Skip cheque here (handled by status logic)
      if (c.cashType === "cheque") continue;

      const currency = await CurrencyMaster.findById(c.currency);
      const amount = Number(c.amount);

      const partyChange = isReceipt ? amount : -amount;
      const oppChange = isReceipt ? -amount : amount;

      // Party balance update
      await this.updateAccountCashBalance(entry.party, c.currency, partyChange);

      // Opposite account
      let opposite = null;
      if (["cash", "bank", "card", "cheque"].includes(c.cashType)) {
        opposite = c.chequeBank || c.account;
      }
      if (c.cashType === "transfer") {
        opposite = c.transferAccount;
      }

      if (opposite)
        await this.updateAccountCashBalance(opposite, c.currency, oppChange);

      const desc = `${isReceipt ? "Received" : "Paid"} ${amount} ${
        currency.currencyCode
      } via ${c.cashType}`;

      // Registry Party
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "PARTY_CASH_BALANCE",
        description: desc,
        value: amount,
        [isReceipt ? "credit" : "debit"]: amount,
        reference: entry.voucherCode,
        createdBy: entry.enteredBy,
        party: entry.party,
        currency: c.currency,
      });

      // Registry System CASH
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "CASH",
        description: desc,
        value: amount,
        [isReceipt ? "debit" : "credit"]: amount,
        reference: entry.voucherCode,
        createdBy: entry.enteredBy,
        currency: c.currency,
      });

      // Opp account registry
      if (opposite) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "PARTY_CASH_BALANCE",
          description: desc + " (Opposite)",
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: opposite,
          currency: c.currency,
        });
      }

      // VAT
      if (c.vatAmount > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "VAT_AMOUNT",
          description: `VAT ${c.vatPercentage}%`,
          value: c.vatAmount,
          [isReceipt ? "debit" : "credit"]: c.vatAmount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
        });
      }

      // Card charge
      if (c.cashType === "card" && c.cardChargeAmount > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "CARD_CHARGE",
          description: `Card charge ${c.cardChargePercent}%`,
          value: c.cardChargeAmount,
          debit: c.cardChargeAmount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
        });
      }
    }

    await Registry.create(registryRows);
  }

  // ------------------------------------------------------------------------
  // REVERSE CASH
  // ------------------------------------------------------------------------
  static async reverseCashTransaction(entry, isReceipt = true) {
    const partyAcc = await Account.findById(entry.party);
    if (!partyAcc) return;

    for (const c of entry.cash) {
      if (c.cashType === "cheque") continue;

      const partyBal = await this.ensureCashBalance(partyAcc, c.currency);
      partyBal.amount += isReceipt ? -c.amount : c.amount;
      partyBal.lastUpdated = new Date();

      let opposite = null;
      if (["cash", "bank", "card", "cheque"].includes(c.cashType)) {
        opposite = c.chequeBank || c.account;
      }
      if (c.cashType === "transfer") {
        opposite = c.transferAccount;
      }

      if (opposite) {
        await this.updateAccountCashBalance(
          opposite,
          c.currency,
          isReceipt ? c.amount : -c.amount
        );
      }
    }

    await partyAcc.save();
  }

  // ------------------------------------------------------------------------
  // REVERSE METAL
  // ------------------------------------------------------------------------
  static async reverseMetal(entry, isReceipt = true) {
    const account = await Account.findById(entry.party);
    if (!account) return;

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;

      account.balances.goldBalance = {
        totalGrams: prev + (isReceipt ? -item.purityWeight : item.purityWeight),
        lastUpdated: new Date(),
      };

      await InventoryService.updateInventory(
        {
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              transactionType: isReceipt ? "metalPayment" : "metalReceipt",
            },
          ],
        },
        isReceipt,
        entry.enteredBy
      );
    }

    await account.save();
  }

  // ------------------------------------------------------------------------
  // CLEANUP REGISTRY + INVENTORY LOGS
  // ------------------------------------------------------------------------
  static async cleanup(voucherCode) {
    await Promise.all([
      RegistryService.deleteRegistryByVoucher(voucherCode),
      InventoryLog.deleteMany({ voucherCode }),
    ]);
  }

  // ------------------------------------------------------------------------
  // FETCH ENTRY BY ID
  // ------------------------------------------------------------------------
  static async getEntryById(id) {
    return await Entry.findById(id)
      .lean()
      .populate("party", "customerName accountCode")
      .populate("enteredBy", "name")
      .populate("cash.currency", "currencyCode")
      .populate("cash.account", "customerName accountCode")
      .populate("cash.chequeBank", "customerName accountCode")
      .populate("cash.transferAccount", "customerName accountCode")
      .populate("stockItems.stock", "code name")
      .populate("attachments.uploadedBy", "name");
  }

  // ------------------------------------------------------------------------
  // FILTER LIST
  // ------------------------------------------------------------------------
  static async getEntriesByType({
    type,
    page = 1,
    limit = 20,
    search,
    startDate,
    endDate,
    status,
  }) {
    const q = { type };

    if (status) q.status = status;

    if (startDate || endDate) {
      q.voucherDate = {};
      if (startDate) q.voucherDate.$gte = new Date(startDate);
      if (endDate) q.voucherDate.$lte = new Date(endDate);
    }

    if (search) {
      const partyIds = await Account.find({
        customerName: { $regex: search, $options: "i" },
      }).select("_id");

      q.$or = [
        { voucherCode: { $regex: search, $options: "i" } },
        { party: { $in: partyIds.map((p) => p._id) } },
      ];
    }

    const [entries, total] = await Promise.all([
      Entry.find(q)
        .lean()
        .populate("party", "customerName")
        .populate("enteredBy", "name")
        .populate("cash.currency", "currencyCode")
        .populate("stockItems.stock", "code")
        .sort({ voucherDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),

      Entry.countDocuments(q),
    ]);

    return { entries, total, page, pages: Math.ceil(total / limit) };
  }
}

export default EntryService;
