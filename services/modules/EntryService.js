import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import CurrencyMaster from "../../models/modules/CurrencyMaster.js";
import DocumentType from "../../models/modules/DocumentType.js";
import RegistryService from "./RegistryService.js";
import InventoryService from "./inventoryService.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import { createAppError } from "../../utils/errorHandler.js";
import Entry from "../../models/modules/EntryModel.js";
import PDCSchedule from "../../models/modules/PDCSchedule.js";
import mongoose from "mongoose";

class EntryService {
  // Helper to check if date is today
  static isToday(date) {
    const d = new Date(date);
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }

  // Helper to check if date is in the future (post-dated)
  static isPostDated(date) {
    if (!date) return false;
    const d = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d > today;
  }

  // Helper to normalize date to start of day (UTC)
  static normalizeToStartOfDay(date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  // Helper to check if date is today or past
  static isTodayOrPast(date) {
    if (!date) return false;
    const d = this.normalizeToStartOfDay(date);
    const today = this.normalizeToStartOfDay(new Date());
    return d <= today;
  }

  // Calculate FX Gain/Loss
  // For cash-payment: if fxBaseRate > fxRate = Loss (paying less than market)
  // For cash-receipt: if fxBaseRate > fxRate = Gain (receiving more than market)
  static calculateFxGainLoss(amount, fxRate, fxBaseRate, isPayment = true) {
    const givenValue = amount * fxRate;
    const marketValue = amount * fxBaseRate;
    const diff = marketValue - givenValue;

    if (isPayment) {
      // Payment: positive diff = loss (we paid less, party received less)
      // negative diff = gain (we paid more, party received more)
      return {
        fxGain: diff < 0 ? Math.abs(diff) : 0,
        fxLoss: diff > 0 ? diff : 0,
      };
    } else {
      // Receipt: positive diff = gain (we received more value)
      // negative diff = loss (we received less value)
      return {
        fxGain: diff > 0 ? diff : 0,
        fxLoss: diff < 0 ? Math.abs(diff) : 0,
      };
    }
  }

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
          value: item.purityWeight,
          debit: item.purityWeight, // Receipt: GOLD_STOCK is debited (stock increases)
          credit: 0,
          grossWeight: item.grossWeight,
          pureWeight: item.purityWeight,
          purity: item.purity,
          metalId: item.stock, // Add metal/stock ID
          transactionDate: entry.voucherDate || new Date(),
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          assetType: "AED",
          currencyRate: 1,
        },
        {
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "GOLD",
          description: desc,
          value: item.purityWeight,
          credit: item.purityWeight, // Receipt: GOLD is credited (gold comes in)
          debit: 0,
          grossWeight: item.grossWeight,
          pureWeight: item.purityWeight,
          purity: item.purity,
          metalId: item.stock, // Add metal/stock ID
          transactionDate: entry.voucherDate || new Date(),
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          assetType: "AED",
          currencyRate: 1,
        },
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "PARTY_GOLD_BALANCE",
          description: desc,
          value: item.purityWeight,
          credit: item.purityWeight,
          debit: 0,
          grossWeight: item.grossWeight,
          pureWeight: item.purityWeight,
          purity: item.purity,
          metalId: item.stock, // Add metal/stock ID
          transactionDate: entry.voucherDate || new Date(),
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          assetType: "AED",
          currencyRate: 1,
        },
      ]);

      await InventoryService.updateInventory(
        {
          partyCode: entry.party,
          voucherType: entry.type,
          voucherNumber: entry.voucherCode,
          voucherDate: entry.voucherDate || new Date(),
          transactionType: "metalReceipt",
          createdBy: entry.enteredBy,
          isDraft: entry.isDraft || false,
          draftId: entry.draftId || null,
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              voucherType: entry.type,
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
          value: item.purityWeight,
          credit: item.purityWeight, // Payment: GOLD_STOCK is credited (stock decreases)
          debit: 0,
          grossWeight: item.grossWeight,
          pureWeight: item.purityWeight,
          purity: item.purity,
          metalId: item.stock, // Add metal/stock ID
          transactionDate: entry.voucherDate || new Date(),
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          assetType: "AED",
          currencyRate: 1,
        },
        {
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "GOLD",
          description: desc,
          value: item.purityWeight,
          debit: item.purityWeight, // Payment: GOLD is debited (gold goes out)
          credit: 0,
          grossWeight: item.grossWeight,
          pureWeight: item.purityWeight,
          purity: item.purity,
          metalId: item.stock, // Add metal/stock ID
          transactionDate: entry.voucherDate || new Date(),
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          assetType: "AED",
          currencyRate: 1,
        },
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "PARTY_GOLD_BALANCE",
          description: desc,
          value: item.purityWeight,
          debit: item.purityWeight,
          credit: 0,
          grossWeight: item.grossWeight,
          pureWeight: item.purityWeight,
          purity: item.purity,
          metalId: item.stock, // Add metal/stock ID
          transactionDate: entry.voucherDate || new Date(),
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          assetType: "AED",
          currencyRate: 1,
        },
      ]);

      await InventoryService.updateInventory(
        {
          partyCode: entry.party,
          voucherType: entry.type,
          voucherNumber: entry.voucherCode,
          voucherDate: entry.voucherDate || new Date(),
          transactionType: "metalPayment",
          createdBy: entry.enteredBy,
          isDraft: entry.isDraft || false,
          draftId: entry.draftId || null,
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              voucherType: entry.type,
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
  // CASH RECEIPT/PAYMENT with FX Gain/Loss and PDC handling
  // ------------------------------------------------------------------------
  static async handleCashTransaction(entry, isReceipt = true) {
    if (entry.status !== "approved") return;

    // Only handle PDC logic for currency-receipt and currency-payment
    const isCurrencyTransaction = ["currency-receipt", "currency-payment"].includes(entry.type);
    
    const registryRows = [];

    for (let cashIndex = 0; cashIndex < entry.cash.length; cashIndex++) {
      const c = entry.cash[cashIndex];
      const currency = await CurrencyMaster.findById(c.currency);
      const amount = Number(c.amount);
      const fxRate = Number(c.fxRate) || 1;
      const fxBaseRate = Number(c.fxBaseRate) || 1;

      // Check if this is a cheque transaction
      const isCheque = c.cashType === "cheque";
      const isPostDatedCheque = isCheque && c.chequeDate && this.isPostDated(c.chequeDate);
      
      // For currency transactions with cheques, validate and handle PDC
      if (isCurrencyTransaction && isCheque) {
        // Get bank account and its configuration
        const bankAccount = await Account.findById(c.chequeBank || c.account);
        if (!bankAccount) {
          throw createAppError("Bank account not found", 404);
        }

        // Find the bankDetails record (use the one matching chequeBank or first one)
        let bankDetail = null;
        if (bankAccount.bankDetails?.length > 0) {
          bankDetail = bankAccount.bankDetails.find(
            (bd) => bd._id?.toString() === c.chequeBank?.toString()
          ) || bankAccount.bankDetails[0];
        }

        if (isPostDatedCheque) {
          // Validate PDC configuration
          if (isReceipt) {
            if (!bankDetail?.pdcReceipt) {
              throw createAppError(
                "PDC Receipt account not configured for this bank",
                400
              );
            }
            if (bankDetail.pdcReceiptMaturityDays === undefined || bankDetail.pdcReceiptMaturityDays === null || bankDetail.pdcReceiptMaturityDays < 0) {
              throw createAppError(
                "PDC Receipt maturity days not configured for this bank",
                400
              );
            }
          } else {
            // Payment
            if (!bankDetail?.pdcIssue) {
              throw createAppError(
                "PDC Issue account not configured for this bank",
                400
              );
            }
            if (bankDetail.maturityDays === undefined || bankDetail.maturityDays === null || bankDetail.maturityDays < 0) {
              throw createAppError(
                "PDC Issue maturity days not configured for this bank",
                400
              );
            }
          }

          // Calculate maturity posting date
          const chequeDate = this.normalizeToStartOfDay(c.chequeDate);
          const maturityDays = isReceipt 
            ? bankDetail.pdcReceiptMaturityDays 
            : bankDetail.maturityDays;
          
          const maturityPostingDate = new Date(chequeDate);
          maturityPostingDate.setUTCDate(maturityPostingDate.getUTCDate() + maturityDays);

          // Set PDC fields
          c.isPDC = true;
          c.pdcStatus = "pending";
          c.maturityPostingDate = maturityPostingDate;
          c.bankAccountId = bankAccount._id;
          
          if (isReceipt) {
            c.pdcReceiptAccount = bankDetail.pdcReceipt;
            c.pdcIssueAccount = null;
          } else {
            c.pdcIssueAccount = bankDetail.pdcIssue;
            c.pdcReceiptAccount = null;
          }

          // Create PDC schedule
          const pdcAccount = isReceipt ? bankDetail.pdcReceipt : bankDetail.pdcIssue;
          await PDCSchedule.create({
            entryId: entry._id,
            cashItemIndex: cashIndex,
            voucherCode: entry.voucherCode,
            entryType: entry.type,
            party: entry.party,
            currency: c.currency,
            amount: amount,
            chequeDate: chequeDate,
            maturityPostingDate: maturityPostingDate,
            pdcAccount: pdcAccount,
            bankAccountId: bankAccount._id,
            pdcStatus: "pending",
            remarks: c.remarks || entry.remarks || null,
          });
        } else {
          // Today or past date - normal posting, no PDC
          c.isPDC = false;
          c.pdcStatus = null;
          c.maturityPostingDate = null;
          c.bankAccountId = bankAccount._id;
        }
      }

      // Calculate FX Gain/Loss
      const { fxGain, fxLoss } = this.calculateFxGainLoss(
        amount,
        fxRate,
        fxBaseRate,
        !isReceipt // isPayment = !isReceipt
      );
      c.fxGain = fxGain;
      c.fxLoss = fxLoss;

      const partyChange = isReceipt ? amount : -amount;
      const oppChange = isReceipt ? -amount : amount;

      // Party balance update (always update party balance)
      await this.updateAccountCashBalance(entry.party, c.currency, partyChange);

      // Determine opposite account based on PDC status
      let opposite = null;
      let pdcAccount = null;

      if (isCheque) {
        if (isPostDatedCheque && isCurrencyTransaction) {
          // For PDC: use PDC Issue (payment) or PDC Receipt (receipt) account
          pdcAccount = isReceipt ? c.pdcReceiptAccount : c.pdcIssueAccount;
          // Update PDC account now, bank account will be updated at maturity
          if (pdcAccount) {
            await this.updateAccountCashBalance(pdcAccount, c.currency, oppChange);
          }
        } else {
          // Current date cheque or non-currency transaction - use actual bank account
          opposite = c.chequeBank || c.account;
          if (opposite) {
            await this.updateAccountCashBalance(opposite, c.currency, oppChange);
          }
        }
      } else if (["cash", "bank", "card"].includes(c.cashType)) {
        opposite = c.chequeBank || c.account;
        if (opposite) {
          await this.updateAccountCashBalance(opposite, c.currency, oppChange);
        }
      } else if (c.cashType === "transfer") {
        opposite = c.transferAccount;
        if (opposite) {
          await this.updateAccountCashBalance(opposite, c.currency, oppChange);
        }
      }

      // Build description with remarks
      const remarksPart = c.remarks ? ` - ${c.remarks}` : "";
      const desc = `${isReceipt ? "Received" : "Paid"} ${amount} ${
        currency.currencyCode
      } via ${c.cashType}${isPostDatedCheque ? " (PDC)" : ""}${remarksPart}`;

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

      // Registry for opposite account (Bank/Cash/PDC)
      if (isPostDatedCheque && isCurrencyTransaction && pdcAccount) {
        // PDC Account registry entry - NOW posting
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "PDC_ENTRY",
          description: `${desc} - ${isReceipt ? "PDC Receipt" : "PDC Issue"} (NOW)`,
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount,
          [isReceipt ? "cashDebit" : "cashCredit"]: amount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: pdcAccount,
          currency: c.currency,
        });
      } else if (opposite) {
        // Normal bank/cash account registry
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "BULLION_ENTRY",
          description: desc,
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount,
          [isReceipt ? "cashDebit" : "cashCredit"]: amount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: opposite,
          currency: c.currency,
        });
      }

      // FX Gain/Loss registry entries
      if (fxGain > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "FX_EXCHANGE",
          description: `Foreign Exchange Gain - ${isReceipt ? "Receipt from" : "Payment to"} Party (Rate: ${fxRate} vs Base: ${fxBaseRate})`,
          value: fxGain,
          credit: fxGain,
          cashCredit: fxGain,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          currency: c.currency,
        });
      }

      if (fxLoss > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "FX_EXCHANGE",
          description: `Foreign Exchange Loss - ${isReceipt ? "Receipt from" : "Payment to"} Party (Rate: ${fxRate} vs Base: ${fxBaseRate})`,
          value: fxLoss,
          debit: fxLoss,
          cashDebit: fxLoss,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
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
    
    // Save updated cash items with FX and PDC info
    await entry.save();
  }

  // ------------------------------------------------------------------------
  // CLEAR POST-DATED CHEQUE (when cheque date arrives)
  // ------------------------------------------------------------------------
  static async clearPDC(entryId, cashItemIndex, adminId) {
    const entry = await Entry.findById(entryId);
    if (!entry) throw createAppError("Entry not found", 404);

    const cashItem = entry.cash[cashItemIndex];
    if (!cashItem) throw createAppError("Cash item not found", 404);

    if (!cashItem.isPDC || cashItem.pdcStatus !== "pending") {
      throw createAppError("This is not a pending PDC", 400);
    }

    const currency = await CurrencyMaster.findById(cashItem.currency);
    const amount = Number(cashItem.amount);
    const isReceipt = entry.type.includes("cash-receipt");

    const registryRows = [];

    // Reverse PDC account balance
    const pdcAccount = isReceipt ? cashItem.pdcReceiptAccount : cashItem.pdcIssueAccount;
    if (pdcAccount) {
      // Reverse the PDC account entry
      const pdcReverseChange = isReceipt ? amount : -amount;
      await this.updateAccountCashBalance(pdcAccount, cashItem.currency, pdcReverseChange);

      // Registry: Reverse PDC account entry - use PDC_ENTRY type
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "PDC_ENTRY",
        description: `PDC Cleared - ${isReceipt ? "PDC Receipt" : "PDC Issue"} reversed - ${currency.currencyCode} ${amount}`,
        value: amount,
        [isReceipt ? "credit" : "debit"]: amount,
        [isReceipt ? "cashCredit" : "cashDebit"]: amount,
        reference: entry.voucherCode,
        createdBy: adminId,
        party: pdcAccount,
        currency: cashItem.currency,
      });
    }

    // Credit actual bank account
    const bankAccount = cashItem.chequeBank || cashItem.account;
    if (bankAccount) {
      const bankChange = isReceipt ? -amount : amount;
      await this.updateAccountCashBalance(bankAccount, cashItem.currency, bankChange);

      // Registry: Credit bank account - use BULLION_ENTRY type
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "BULLION_ENTRY",
        description: `PDC Cleared to Bank - ${currency.currencyCode} ${amount}`,
        value: amount,
        [isReceipt ? "debit" : "credit"]: amount,
        [isReceipt ? "cashDebit" : "cashCredit"]: amount,
        reference: entry.voucherCode,
        createdBy: adminId,
        party: bankAccount,
        currency: cashItem.currency,
      });
    }

    await Registry.create(registryRows);

    // Update PDC status
    cashItem.pdcStatus = "cleared";
    await entry.save();

    return entry;
  }

  // ------------------------------------------------------------------------
  // BOUNCE POST-DATED CHEQUE
  // ------------------------------------------------------------------------
  static async bouncePDC(entryId, cashItemIndex, adminId) {
    const entry = await Entry.findById(entryId);
    if (!entry) throw createAppError("Entry not found", 404);

    const cashItem = entry.cash[cashItemIndex];
    if (!cashItem) throw createAppError("Cash item not found", 404);

    if (!cashItem.isPDC || cashItem.pdcStatus !== "pending") {
      throw createAppError("This is not a pending PDC", 400);
    }

    const currency = await CurrencyMaster.findById(cashItem.currency);
    const amount = Number(cashItem.amount);
    const isReceipt = entry.type.includes("receipt");

    const registryRows = [];

    // Reverse PDC account balance
    const pdcAccount = isReceipt ? cashItem.pdcReceiptAccount : cashItem.pdcIssueAccount;
    if (pdcAccount) {
      const pdcReverseChange = isReceipt ? amount : -amount;
      await this.updateAccountCashBalance(pdcAccount, cashItem.currency, pdcReverseChange);

      // PDC Bounced - use PDC_ENTRY type
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "PDC_ENTRY",
        description: `PDC Bounced - ${isReceipt ? "PDC Receipt" : "PDC Issue"} reversed - ${currency.currencyCode} ${amount}`,
        value: amount,
        [isReceipt ? "credit" : "debit"]: amount,
        [isReceipt ? "cashCredit" : "cashDebit"]: amount,
        reference: entry.voucherCode,
        createdBy: adminId,
        party: pdcAccount,
        currency: cashItem.currency,
      });
    }

    // Reverse party balance
    const partyReverseChange = isReceipt ? -amount : amount;
    await this.updateAccountCashBalance(entry.party, cashItem.currency, partyReverseChange);

    // Party balance reversal - use PARTY_CASH_BALANCE type
    registryRows.push({
      transactionType: entry.type,
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId: entry._id,
      type: "PARTY_CASH_BALANCE",
      description: `PDC Bounced - Party balance reversed - ${currency.currencyCode} ${amount}`,
      value: amount,
      [isReceipt ? "debit" : "credit"]: amount,
      [isReceipt ? "cashDebit" : "cashCredit"]: amount,
      reference: entry.voucherCode,
      createdBy: adminId,
      party: entry.party,
      currency: cashItem.currency,
    });

    await Registry.create(registryRows);

    // Update PDC status
    cashItem.pdcStatus = "bounced";
    await entry.save();

    return entry;
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
          partyCode: entry.party,
          voucherType: entry.type,
          voucherNumber: entry.voucherCode,
          voucherDate: entry.voucherDate || new Date(),
          transactionType: isReceipt ? "metalPayment" : "metalReceipt",
          createdBy: entry.enteredBy,
          isDraft: entry.isDraft || false,
          draftId: entry.draftId || null,
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              voucherType: entry.type,
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
  // REVERSE METAL BALANCES AND INVENTORY (for delete - no inventory logs)
  // ------------------------------------------------------------------------
  static async reverseMetalBalancesOnly(entry, isReceipt = true) {
    const account = await Account.findById(entry.party);
    if (!account) return;

    const { default: Inventory } = await import("../../models/modules/inventory.js");

    for (const item of entry.stockItems) {
      // Reverse party gold balance
      const prev = account.balances.goldBalance?.totalGrams || 0;
      account.balances.goldBalance = {
        totalGrams: prev + (isReceipt ? -item.purityWeight : item.purityWeight),
        lastUpdated: new Date(),
      };

      // Reverse inventory changes without creating logs
      const metalId = new mongoose.Types.ObjectId(item.stock);
      const inventory = await Inventory.findOne({ metal: metalId });
      
      if (inventory) {
        // Calculate deltas (opposite of original transaction)
        // Receipt: originally added inventory, so we subtract
        // Payment: originally subtracted inventory, so we add
        const factor = isReceipt ? -1 : 1;
        const pcsDelta = factor * (item.pieces || 0);
        const weightDelta = factor * (item.grossWeight || 0);

        // Apply deltas
        inventory.pcsCount += pcsDelta;
        inventory.grossWeight += weightDelta;
        inventory.pureWeight = inventory.grossWeight * (inventory.purity || 1);

        await inventory.save();
      }
    }

    await account.save();
  }

  // ------------------------------------------------------------------------
  // CLEANUP REGISTRY + INVENTORY LOGS + PDC SCHEDULES
  // ------------------------------------------------------------------------
  static async cleanup(voucherCode) {
    // Cancel any pending PDC schedules for this voucher
    await PDCSchedule.updateMany(
      { voucherCode, pdcStatus: "pending" },
      {
        $set: {
          pdcStatus: "cancelled",
          processedAt: new Date(),
        },
      }
    );

    await Promise.all([
      RegistryService.deleteRegistryByVoucher(voucherCode),
      InventoryLog.deleteMany({ voucherCode }),
    ]);
  }

  // ------------------------------------------------------------------------
  // FETCH ENTRY BY ID
  // ------------------------------------------------------------------------
  static async getEntryById(id) {
    const entry = await Entry.findById(id)
      .populate({
        path: "party",
        populate: [
          { path: "accountType" },
          { path: "createdBy", select: "name email" },
          { path: "updatedBy", select: "name email" },
        ],
      })
      .populate("enteredBy", "name email")
      .populate("voucherId")
      .populate("cash.currency")
      .populate("cash.account")
      .populate("cash.chequeBank")
      .populate("cash.transferAccount")
      .populate("cash.pdcIssueAccount")
      .populate("cash.pdcReceiptAccount")
      .populate("stockItems.stock")
      .populate("attachments.uploadedBy", "name email")
      .lean();

    if (!entry) {
      throw createAppError("Entry not found", 404, "NOT_FOUND");
    }

    // Populate nested arrays within party if they exist
    if (entry.party) {
      const populatePromises = [];

      // Helper function to check if a field needs population
      // With .lean(), unpopulated fields are strings (ObjectId strings) or objects with only _id
      // Populated fields are objects with multiple properties
      const needsPopulation = (field) => {
        if (!field) return false;
        // If it's a string, it's an ObjectId string and needs population
        if (typeof field === 'string') return true;
        // If it's an object, check if it's already populated (has more than just _id)
        if (typeof field === 'object') {
          const keys = Object.keys(field);
          // If it has more than 2 keys (usually _id + other fields), it's populated
          return keys.length <= 2;
        }
        return true;
      };

      // Get the ID from a field (handles both ObjectId and string)
      const getId = (field) => {
        if (!field) return null;
        if (typeof field === 'string') return field;
        return field._id || field;
      };

      // Populate balances.cashBalance.currency
      if (entry.party.balances?.cashBalance?.length > 0) {
        entry.party.balances.cashBalance.forEach((balance, index) => {
          if (needsPopulation(balance.currency)) {
            const currencyId = getId(balance.currency);
            if (currencyId) {
              populatePromises.push(
                CurrencyMaster.findById(currencyId).lean().then((currency) => {
                  if (currency) entry.party.balances.cashBalance[index].currency = currency;
                })
              );
            }
          }
        });
      }

      // Populate acDefinition.currencies.currency
      if (entry.party.acDefinition?.currencies?.length > 0) {
        entry.party.acDefinition.currencies.forEach((currencyDef, index) => {
          if (needsPopulation(currencyDef.currency)) {
            const currencyId = getId(currencyDef.currency);
            if (currencyId) {
              populatePromises.push(
                CurrencyMaster.findById(currencyId).lean().then((currency) => {
                  if (currency) entry.party.acDefinition.currencies[index].currency = currency;
                })
              );
            }
          }
        });
      }

      // Populate kycDetails.documentType
      if (entry.party.kycDetails?.length > 0) {
        entry.party.kycDetails.forEach((kyc, index) => {
          if (needsPopulation(kyc.documentType)) {
            const docTypeId = getId(kyc.documentType);
            if (docTypeId) {
              populatePromises.push(
                DocumentType.findById(docTypeId).lean().then((docType) => {
                  if (docType) entry.party.kycDetails[index].documentType = docType;
                })
              );
            }
          }
        });
      }

      // Populate bankDetails.pdcIssue and pdcReceipt
      if (entry.party.bankDetails?.length > 0) {
        entry.party.bankDetails.forEach((bank, index) => {
          if (needsPopulation(bank.pdcIssue)) {
            const accountId = getId(bank.pdcIssue);
            if (accountId) {
              populatePromises.push(
                Account.findById(accountId).lean().then((account) => {
                  if (account) entry.party.bankDetails[index].pdcIssue = account;
                })
              );
            }
          }
          if (needsPopulation(bank.pdcReceipt)) {
            const accountId = getId(bank.pdcReceipt);
            if (accountId) {
              populatePromises.push(
                Account.findById(accountId).lean().then((account) => {
                  if (account) entry.party.bankDetails[index].pdcReceipt = account;
                })
              );
            }
          }
        });
      }

      // Execute all population queries in parallel
      await Promise.all(populatePromises);
    }

    return entry;
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
        .sort({ createdAt: -1, voucherDate: -1 }) // LIFO: Last In First Out - newest entries first
        .skip((page - 1) * limit)
        .limit(limit),

      Entry.countDocuments(q),
    ]);

    return { entries, total, page, pages: Math.ceil(total / limit) };
  }

  // ------------------------------------------------------------------------
  // PROCESS MATURED PDCs (Cron Job)
  // ------------------------------------------------------------------------
  static async processMaturedPDCs(adminId = null) {
    const today = this.normalizeToStartOfDay(new Date());
    
    // Find all pending PDCs where maturityPostingDate <= today
    const maturedPDCs = await PDCSchedule.find({
      pdcStatus: "pending",
      maturityPostingDate: { $lte: today },
    })
      .populate("entryId")
      .populate("party")
      .populate("currency")
      .populate("pdcAccount")
      .populate("bankAccountId")
      .lean();

    const results = {
      processed: 0,
      errors: [],
      skipped: 0,
    };

    for (const schedule of maturedPDCs) {
      try {
        // Double-check entry still exists and is approved
        const entry = await Entry.findById(schedule.entryId);
        if (!entry || entry.status !== "approved") {
          results.skipped++;
          continue;
        }

        // Get the cash item
        const cashItem = entry.cash[schedule.cashItemIndex];
        if (!cashItem || !cashItem.isPDC || cashItem.pdcStatus !== "pending") {
          results.skipped++;
          continue;
        }

        // Verify maturity date matches (idempotency check)
        const cashItemMaturityDate = cashItem.maturityPostingDate 
          ? this.normalizeToStartOfDay(cashItem.maturityPostingDate)
          : null;
        
        if (cashItemMaturityDate && cashItemMaturityDate > today) {
          results.skipped++;
          continue;
        }

        // Check if already processed (idempotency)
        const existingRegistry = await Registry.findOne({
          EntryTransactionId: entry._id,
          type: "PDC_MATURITY",
          reference: entry.voucherCode,
        });

        if (existingRegistry) {
          // Already processed, just update status
          await PDCSchedule.updateOne(
            { _id: schedule._id },
            {
              $set: {
                pdcStatus: "cleared",
                processedAt: new Date(),
                processedBy: adminId,
              },
            }
          );
          results.skipped++;
          continue;
        }

        const amount = Number(schedule.amount);
        const isReceipt = schedule.entryType === "currency-receipt";
        const registryRows = [];

        // Reverse PDC account entry
        const pdcReverseChange = isReceipt ? -amount : amount;
        await this.updateAccountCashBalance(
          schedule.pdcAccount,
          schedule.currency,
          pdcReverseChange
        );

        // Credit/Debit bank account
        const bankChange = isReceipt ? -amount : amount;
        await this.updateAccountCashBalance(
          schedule.bankAccountId,
          schedule.currency,
          bankChange
        );

        // Registry: Reverse PDC account
        registryRows.push({
          transactionType: schedule.entryType,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "PDC_MATURITY",
          description: `PDC Maturity - ${isReceipt ? "PDC Receipt" : "PDC Issue"} reversed - ${schedule.voucherCode}`,
          value: amount,
          [isReceipt ? "credit" : "debit"]: amount,
          [isReceipt ? "cashCredit" : "cashDebit"]: amount,
          reference: schedule.voucherCode,
          createdBy: adminId || entry.enteredBy,
          party: schedule.pdcAccount,
          currency: schedule.currency,
        });

        // Registry: Post to bank account
        registryRows.push({
          transactionType: schedule.entryType,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "PDC_MATURITY",
          description: `PDC Maturity - Posted to Bank - ${schedule.voucherCode}`,
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount,
          [isReceipt ? "cashDebit" : "cashCredit"]: amount,
          reference: schedule.voucherCode,
          createdBy: adminId || entry.enteredBy,
          party: schedule.bankAccountId,
          currency: schedule.currency,
        });

        await Registry.create(registryRows);

        // Update cash item status
        cashItem.pdcStatus = "cleared";
        await entry.save();

        // Update schedule status
        await PDCSchedule.updateOne(
          { _id: schedule._id },
          {
            $set: {
              pdcStatus: "cleared",
              processedAt: new Date(),
              processedBy: adminId,
            },
          }
        );

        results.processed++;
      } catch (error) {
        console.error(`Error processing PDC schedule ${schedule._id}:`, error);
        results.errors.push({
          scheduleId: schedule._id,
          voucherCode: schedule.voucherCode,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ------------------------------------------------------------------------
  // CANCEL PDC (Reverse NOW entry and mark cancelled)
  // ------------------------------------------------------------------------
  static async cancelPDC(entryId, cashItemIndex, adminId) {
    const entry = await Entry.findById(entryId);
    if (!entry) throw createAppError("Entry not found", 404);

    const cashItem = entry.cash[cashItemIndex];
    if (!cashItem) throw createAppError("Cash item not found", 404);

    if (!cashItem.isPDC || cashItem.pdcStatus !== "pending") {
      throw createAppError("This is not a pending PDC", 400);
    }

    // Find the schedule
    const schedule = await PDCSchedule.findOne({
      entryId: entry._id,
      cashItemIndex: cashItemIndex,
      pdcStatus: "pending",
    });

    if (!schedule) {
      throw createAppError("PDC schedule not found", 404);
    }

    const amount = Number(cashItem.amount);
    const isReceipt = entry.type === "currency-receipt";
    const currency = await CurrencyMaster.findById(cashItem.currency);
    const registryRows = [];

    // Reverse party balance
    const partyReverseChange = isReceipt ? -amount : amount;
    await this.updateAccountCashBalance(entry.party, cashItem.currency, partyReverseChange);

    // Reverse PDC account balance
    const pdcAccount = isReceipt ? cashItem.pdcReceiptAccount : cashItem.pdcIssueAccount;
    if (pdcAccount) {
      const pdcReverseChange = isReceipt ? -amount : amount;
      await this.updateAccountCashBalance(pdcAccount, cashItem.currency, pdcReverseChange);

      // Registry: Reverse PDC account
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "PDC_ENTRY",
        description: `PDC Cancelled - ${isReceipt ? "PDC Receipt" : "PDC Issue"} reversed - ${currency.currencyCode} ${amount}`,
        value: amount,
        [isReceipt ? "credit" : "debit"]: amount,
        [isReceipt ? "cashCredit" : "cashDebit"]: amount,
        reference: entry.voucherCode,
        createdBy: adminId,
        party: pdcAccount,
        currency: cashItem.currency,
      });
    }

    // Registry: Reverse party balance
    registryRows.push({
      transactionType: entry.type,
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId: entry._id,
      type: "PARTY_CASH_BALANCE",
      description: `PDC Cancelled - Party balance reversed - ${currency.currencyCode} ${amount}`,
      value: amount,
      [isReceipt ? "debit" : "credit"]: amount,
      [isReceipt ? "cashDebit" : "cashCredit"]: amount,
      reference: entry.voucherCode,
      createdBy: adminId,
      party: entry.party,
      currency: cashItem.currency,
    });

    await Registry.create(registryRows);

    // Update cash item status
    cashItem.pdcStatus = "cancelled";
    cashItem.isPDC = false;
    await entry.save();

    // Update schedule status
    await PDCSchedule.updateOne(
      { _id: schedule._id },
      {
        $set: {
          pdcStatus: "cancelled",
          processedAt: new Date(),
          processedBy: adminId,
        },
      }
    );

    return entry;
  }
}

export default EntryService;
