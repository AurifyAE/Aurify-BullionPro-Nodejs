import Drafting from "../../models/modules/Drafting.js";
import AccountType from "../../models/modules/AccountType.js";
import MetalStock from "../../models/modules/MetalStock.js";
import Registry from "../../models/modules/Registry.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import Inventory from "../../models/modules/inventory.js";
import mongoose from "mongoose";

class DraftingService {
  // Create a new draft
  static async createDraft(draftData, adminId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    console.log(draftData,"draftData");
    try {
      // Generate draft number if not provided
      if (!draftData.draftNumber) {
        const count = await Drafting.countDocuments();
        draftData.draftNumber = `DRF${String(count + 1).padStart(3, "0")}`;
      }

      const draft = new Drafting({
        ...draftData,
        createdBy: adminId,
        status: draftData.status || "draft",
      });

      await draft.save({ session });

      // Calculate pure weight
      // Handle both percentage (0-100) and decimal (0-1) formats
      const grossWeight = parseFloat(draftData.grossWeight) || 0;
      let purity = parseFloat(draftData.purity) || parseFloat(draftData.goldAuPercent) || 0;
      
      // If purity is > 1, it's in percentage format, convert to decimal
      if (purity > 1) {
        purity = purity / 100;
      }
      
      const pureWeight = grossWeight * purity;
    
      // Only create entries if status is "draft" and we have required data
      if (draft.status === "draft" && draftData.partyId && draftData.stockId && pureWeight > 0) {
        // 1. Update Party Balance - Add to draftBalance
        const party = await AccountType.findById(draftData.partyId).session(session);
        if (party) {
          party.balances.goldBalance.draftBalance = 
            (party.balances.goldBalance.draftBalance || 0) + pureWeight;
          party.balances.goldBalance.lastUpdated = new Date();
          await party.save({ session });
        }

        // 2. Create Registry Entry with isDraft: true
        const transactionId = await Registry.generateTransactionId();
        const registryEntry = new Registry({
          transactionId,
          transactionType: "Draft-Metal",
          type: "GOLD_STOCK",
          description: `Draft - ${draftData.partyName || "Party"} - ${draftData.stockCode || ""}`,
          party: draftData.partyId,
          metalId: draftData.stockId,
          value: pureWeight,
          goldCredit: pureWeight,
          credit: pureWeight,
          pureWeight: pureWeight,
          grossWeight: grossWeight,
          purity: purity,
          costCenter: "DRAFT",
          reference: draft.voucherCode || draft.transactionId,
          isDraft: true,
          draftId: draft._id,
          createdBy: adminId,
          status: "completed",
        });
        await registryEntry.save({ session });

        // 3. Create Inventory Log with isDraft: true
        const stock = await MetalStock.findById(draftData.stockId).session(session);
        if (stock) {
          const inventoryLog = new InventoryLog({
            code: stock.code,
            transactionType: "draft",
            party: draftData.partyId,
            stockCode: draftData.stockId,
            pcs: stock.pcs || false,
            voucherCode: draftData.voucherCode || draft.draftNumber,
            voucherType: draftData.voucherType || "Draft",
            voucherDate: draftData.voucherDate || new Date(),
            grossWeight: grossWeight,
            action: "add",
            isDraft: true,
            draftId: draft._id,
            createdBy: adminId,
            note: `Draft entry - ${draft.draftNumber || draft.transactionId}`,
          });
          await inventoryLog.save({ session });
        }
      }

      await session.commitTransaction();
      
      // Populate and return the draft
      const populatedDraft = await Drafting.findById(draft._id)
        .populate("createdBy", "name email")
        .populate("partyId", "customerName accountCode name")
        .populate("stockId", "stockCode description standardPurity purity")
        .lean();
      
      return populatedDraft;
    } catch (error) {
      await session.abortTransaction();
      console.error("Error creating draft:", error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get all drafts with pagination and search
  static async getAllDrafts(adminId, page = 1, limit = 10, search = "") {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      // Add search functionality
      if (search) {
        query.$or = [
          { transactionId: { $regex: search, $options: "i" } },
          { draftNumber: { $regex: search, $options: "i" } },
          { partyName: { $regex: search, $options: "i" } },
          { itemCode: { $regex: search, $options: "i" } },
          { certificateNumber: { $regex: search, $options: "i" } },
          { voucherCode: { $regex: search, $options: "i" } },
        ];
      }

      const drafts = await Drafting.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "name email")
        .populate("partyId", "customerName accountCode name")
        .populate({
          path: "stockId",
          select: "stockCode description standardPurity purity karat",
          populate: {
            path: "karat",
            select: "karatCode description standardPurity"
          }
        })
        .lean();

      const totalDrafts = await Drafting.countDocuments(query);
      const totalPages = Math.ceil(totalDrafts / limit);

      return {
        drafts,
        currentPage: page,
        totalPages,
        totalDrafts,
      };
    } catch (error) {
      console.error("Error fetching drafts:", error);
      throw error;
    }
  }

  // Get draft by ID
  static async getDraftById(id, adminId) {
    try {
      const draft = await Drafting.findById(id)
        .populate("createdBy", "name email")
        .populate("partyId", "customerName accountCode name")
        .populate({
          path: "stockId",
          select: "stockCode description standardPurity purity karat",
          populate: {
            path: "karat",
            select: "karatCode description standardPurity"
          }
        })
        .lean();

      return draft;
    } catch (error) {
      console.error("Error fetching draft:", error);
      throw error;
    }
  }

  // Update draft
  static async updateDraft(id, draftData, adminId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existingDraft = await Drafting.findById(id).session(session);
      if (!existingDraft) {
        throw new Error("Draft not found");
      }

      const oldStatus = existingDraft.status;
      const newStatus = draftData.status || existingDraft.status;

      // Update draft document FIRST with any provided data (including partyId, stockId, etc.)
      // This ensures required fields are available when confirming
      const draft = await Drafting.findByIdAndUpdate(
        id,
        {
          ...draftData,
          updatedBy: adminId,
          updatedAt: new Date(),
        },
        { new: true, runValidators: true, session }
      )
        .populate("createdBy", "name email")
        .populate("partyId", "customerName accountCode name")
        .populate("stockId", "stockCode description standardPurity purity")
        .lean();

      // Handle status changes AFTER updating the draft document
      // This ensures required fields (partyId, stockId, etc.) are available
      if (oldStatus === "draft" && newStatus === "confirmed") {
        // Confirm draft - move from draft to confirmed
        await this.confirmDraft(id, adminId, session);
      } else if (oldStatus === "draft" && newStatus === "rejected") {
        // Reject draft - remove draft entries
        await this.rejectDraft(id, adminId, session);
      } else if (oldStatus === "confirmed" && newStatus === "draft") {
        // Revert confirmed to draft (shouldn't normally happen, but handle it)
        await this.revertConfirmedToDraft(id, adminId, session);
      }

      await session.commitTransaction();
      return draft;
    } catch (error) {
      await session.abortTransaction();
      console.error("Error updating draft:", error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Confirm draft - move from draft to confirmed
  static async confirmDraft(draftId, adminId, session = null) {
    try {
      const draft = await Drafting.findById(draftId).session(session);
      if (!draft) throw new Error("Draft not found");

      // Log draft data for debugging
      console.log(`Confirming draft ${draftId}:`, {
        partyId: draft.partyId,
        stockId: draft.stockId,
        grossWeight: draft.grossWeight,
        purity: draft.purity,
        goldAuPercent: draft.goldAuPercent,
        status: draft.status
      });

      // Detailed validation with specific error messages
      if (!draft.partyId) {
        console.error(`Cannot confirm draft ${draftId}: Missing partyId`);
        throw new Error("Cannot confirm draft: Missing partyId");
      }
      if (!draft.stockId) {
        console.error(`Cannot confirm draft ${draftId}: Missing stockId`);
        throw new Error("Cannot confirm draft: Missing stockId");
      }

      const grossWeight = parseFloat(draft.grossWeight) || 0;
      if (grossWeight <= 0) {
        console.error(`Cannot confirm draft ${draftId}: Invalid grossWeight (${grossWeight})`);
        throw new Error(`Cannot confirm draft: Invalid grossWeight (${grossWeight})`);
      }

      // Get stock to retrieve cost center and standardPurity
      const stock = await MetalStock.findById(draft.stockId).populate("costCenter", "code").populate("karat", "standardPurity").session(session);
      if (!stock) {
        console.error(`Cannot confirm draft ${draftId}: Stock not found`);
        throw new Error("Cannot confirm draft: Stock not found");
      }

      // Calculate purity with fallback to stock's standardPurity
      // Try in order: draft.purity, draft.goldAuPercent, stock.karat.standardPurity, stock.standardPurity, stock.purity
      let purity = parseFloat(draft.purity) || parseFloat(draft.goldAuPercent) || 0;
      
      // If purity is still 0, try to get it from stock
      if (purity <= 0) {
        // Try stock's karat standardPurity (0-100 percentage)
        if (stock.karat?.standardPurity) {
          purity = parseFloat(stock.karat.standardPurity);
        }
        // Try stock's standardPurity (could be 0-1 decimal or 0-100 percentage)
        else if (stock.standardPurity) {
          purity = parseFloat(stock.standardPurity);
        }
        // Try stock's purity field
        else if (stock.purity) {
          purity = parseFloat(stock.purity);
        }
      }
      
      // If purity is > 1, it's in percentage format, convert to decimal
      if (purity > 1) {
        purity = purity / 100;
      }
      
      const pureWeight = grossWeight * purity;

      if (purity <= 0) {
        console.error(`Cannot confirm draft ${draftId}: Invalid purity (${purity}) - checked draft.purity, draft.goldAuPercent, stock.karat.standardPurity, stock.standardPurity, stock.purity`);
        throw new Error(`Cannot confirm draft: Invalid purity (${purity})`);
      }
      if (pureWeight <= 0) {
        console.error(`Cannot confirm draft ${draftId}: Invalid pureWeight (${pureWeight}) - grossWeight: ${grossWeight}, purity: ${purity}`);
        throw new Error(`Cannot confirm draft: Invalid pureWeight (${pureWeight})`);
      }
      const costCenterCode = stock?.costCenter?.code || stock?.costCenter || "GOLD_STOCK";
      
      // 1. Update Registry entries - set isDraft to false and update costCenter
      const registryUpdateResult = await Registry.updateMany(
        { draftId: draftId, isDraft: true },
        { 
          $set: { 
            isDraft: false,
            costCenter: costCenterCode, // Change from DRAFT to actual cost center from stock
            transactionDate: draft.voucherDate || new Date(), // Ensure transactionDate is set
            updatedBy: adminId,
            updatedAt: new Date()
          } 
        },
        { session }
      );
      
      console.log(`Updated ${registryUpdateResult.modifiedCount} registry entries for draft ${draftId}`);
      
      // If no registry entries found, create them
      if (registryUpdateResult.matchedCount === 0) {
        console.log(`No existing registry entries found for draft ${draftId}, creating new ones...`);
        const transactionId = await Registry.generateTransactionId();
        const registryEntry = new Registry({
          transactionId,
          transactionType: "Draft-Metal",
          type: "GOLD_STOCK",
          description: `Confirmed Draft - ${draft.partyName || "Party"} - ${draft.stockCode || ""}`,
          party: draft.partyId,
          metalId: draft.stockId,
          value: pureWeight,
          goldCredit: pureWeight,
          credit: pureWeight,
          pureWeight: pureWeight,
          grossWeight: grossWeight,
          purity: purity,
          costCenter: costCenterCode,
          reference: draft.voucherCode || draft.transactionId || draft.draftNumber,
          transactionDate: draft.voucherDate || new Date(),
          isDraft: false,
          draftId: draft._id,
          createdBy: adminId,
          status: "completed",
        });
        await registryEntry.save({ session });
        console.log(`Created new registry entry for draft ${draftId}`);
      }

      // 2. Update Party Balance - move from draftBalance to actual balance
      const party = await AccountType.findById(draft.partyId).session(session);
      if (party) {
        const currentDraftBalance = party.balances.goldBalance.draftBalance || 0;
        const currentTotalGrams = party.balances.goldBalance.totalGrams || 0;

        // Remove from draftBalance
        party.balances.goldBalance.draftBalance = Math.max(0, currentDraftBalance - pureWeight);
        
        // Add to actual balance
        party.balances.goldBalance.totalGrams = currentTotalGrams + pureWeight;
        party.balances.goldBalance.lastUpdated = new Date();
        await party.save({ session });
        console.log(`Updated party balance for party ${draft.partyId}: DraftBalance=${party.balances.goldBalance.draftBalance}, TotalGrams=${party.balances.goldBalance.totalGrams}`);
      } else {
        console.warn(`Party not found: ${draft.partyId}`);
      }

      // 3. Update Inventory Logs - set isDraft to false
      const inventoryLogUpdateResult = await InventoryLog.updateMany(
        { draftId: draftId, isDraft: true },
        { 
          $set: { 
            isDraft: false,
            updatedBy: adminId,
            updatedAt: new Date()
          } 
        },
        { session }
      );
      
      console.log(`Updated ${inventoryLogUpdateResult.modifiedCount} inventory logs for draft ${draftId}`);
      
      // If no inventory logs found, create them
      if (inventoryLogUpdateResult.matchedCount === 0) {
        console.log(`No existing inventory logs found for draft ${draftId}, creating new ones...`);
        const stock = await MetalStock.findById(draft.stockId).session(session);
        if (stock) {
          const inventoryLog = new InventoryLog({
            code: stock.code,
            transactionType: "confirmed",
            party: draft.partyId,
            stockCode: draft.stockId,
            pcs: stock.pcs || false,
            voucherCode: draft.voucherCode || draft.draftNumber,
            voucherType: draft.voucherType || "Confirmed Draft",
            voucherDate: draft.voucherDate || new Date(),
            grossWeight: grossWeight,
            action: "add",
            isDraft: false,
            draftId: draft._id,
            createdBy: adminId,
            note: `Confirmed draft entry - ${draft.draftNumber || draft.transactionId}`,
          });
          await inventoryLog.save({ session });
          console.log(`Created new inventory log for draft ${draftId}`);
        }
      }

      // 4. Update Inventory - add to actual inventory
      let inventory = await Inventory.findOne({ metal: draft.stockId }).session(session);
      if (inventory) {
        const oldGrossWeight = inventory.grossWeight || 0;
        const oldPureWeight = inventory.pureWeight || 0;
        inventory.grossWeight = oldGrossWeight + grossWeight;
        inventory.pureWeight = oldPureWeight + pureWeight;
        // Update purity if not set or if it's different
        if (!inventory.purity || inventory.purity !== purity) {
          inventory.purity = purity;
        }
        inventory.updatedBy = adminId;
        await inventory.save({ session });
        console.log(`Updated inventory for stock ${draft.stockId}: GrossWeight=${inventory.grossWeight}, PureWeight=${inventory.pureWeight}`);
      } else {
        // Create inventory if it doesn't exist
        console.log(`Creating new inventory for stock ${draft.stockId}...`);
        const stock = await MetalStock.findById(draft.stockId).session(session);
        if (stock) {
          inventory = new Inventory({
            metal: draft.stockId,
            pcs: stock.pcs || false,
            pcsCount: stock.pcs ? (grossWeight / (stock.totalValue || 1)) : 0,
            grossWeight: grossWeight,
            pureWeight: pureWeight,
            purity: purity,
            status: "active",
            createdBy: adminId,
          });
          await inventory.save({ session });
          console.log(`Created new inventory for stock ${draft.stockId}: GrossWeight=${grossWeight}, PureWeight=${pureWeight}`);
        } else {
          console.warn(`Stock not found: ${draft.stockId}, cannot create inventory`);
        }
      }
    } catch (error) {
      console.error("Error confirming draft:", error);
      throw error;
    }
  }

  // Reject draft - remove draft entries
  static async rejectDraft(draftId, adminId, session = null) {
    try {
      const draft = await Drafting.findById(draftId).session(session);
      if (!draft) throw new Error("Draft not found");

      const grossWeight = parseFloat(draft.grossWeight) || 0;
      let purity = parseFloat(draft.purity) || parseFloat(draft.goldAuPercent) || 0;
      
      // If purity is > 1, it's in percentage format, convert to decimal
      if (purity > 1) {
        purity = purity / 100;
      }
      
      const pureWeight = grossWeight * purity;

      if (!draft.partyId || !draft.stockId || pureWeight <= 0) {
        return; // No entries to reject
      }

      // 1. Update Party Balance - remove from draftBalance
      const party = await AccountType.findById(draft.partyId).session(session);
      if (party) {
        const currentDraftBalance = party.balances.goldBalance.draftBalance || 0;
        party.balances.goldBalance.draftBalance = Math.max(0, currentDraftBalance - pureWeight);
        party.balances.goldBalance.lastUpdated = new Date();
        await party.save({ session });
      }

      // 2. Delete Registry entries (draft entries only)
      await Registry.deleteMany(
        { draftId: draftId, isDraft: true },
        { session }
      );

      // 3. Delete Inventory Logs (draft entries only)
      await InventoryLog.deleteMany(
        { draftId: draftId, isDraft: true },
        { session }
      );
    } catch (error) {
      console.error("Error rejecting draft:", error);
      throw error;
    }
  }

  // Revert confirmed to draft (rare case)
  static async revertConfirmedToDraft(draftId, adminId, session = null) {
    try {
      const draft = await Drafting.findById(draftId).session(session);
      if (!draft) throw new Error("Draft not found");

      const grossWeight = parseFloat(draft.grossWeight) || 0;
      let purity = parseFloat(draft.purity) || parseFloat(draft.goldAuPercent) || 0;
      
      // If purity is > 1, it's in percentage format, convert to decimal
      if (purity > 1) {
        purity = purity / 100;
      }
      
      const pureWeight = grossWeight * purity;

      if (!draft.partyId || !draft.stockId || pureWeight <= 0) {
        return;
      }

      // Reverse the confirmation process
      // 1. Update Registry entries - set isDraft to true
      await Registry.updateMany(
        { draftId: draftId, isDraft: false },
        { 
          $set: { 
            isDraft: true,
            updatedBy: adminId,
            updatedAt: new Date()
          } 
        },
        { session }
      );

      // 2. Update Party Balance - move from actual balance back to draftBalance
      const party = await AccountType.findById(draft.partyId).session(session);
      if (party) {
        const currentDraftBalance = party.balances.goldBalance.draftBalance || 0;
        const currentTotalGrams = party.balances.goldBalance.totalGrams || 0;

        party.balances.goldBalance.draftBalance = currentDraftBalance + pureWeight;
        party.balances.goldBalance.totalGrams = Math.max(0, currentTotalGrams - pureWeight);
        party.balances.goldBalance.lastUpdated = new Date();
        await party.save({ session });
      }

      // 3. Update Inventory Logs - set isDraft to true
      await InventoryLog.updateMany(
        { draftId: draftId, isDraft: false },
        { 
          $set: { 
            isDraft: true,
            updatedBy: adminId,
            updatedAt: new Date()
          } 
        },
        { session }
      );

      // 4. Update Inventory - remove from actual inventory
      const inventory = await Inventory.findOne({ metal: draft.stockId }).session(session);
      if (inventory) {
        inventory.grossWeight = Math.max(0, (inventory.grossWeight || 0) - grossWeight);
        inventory.pureWeight = Math.max(0, (inventory.pureWeight || 0) - pureWeight);
        await inventory.save({ session });
      }
    } catch (error) {
      console.error("Error reverting draft:", error);
      throw error;
    }
  }

  // Reverse confirmed draft - undo all calculations
  static async reverseConfirmedDraft(draftId, adminId, session = null) {
    try {
      const draft = await Drafting.findById(draftId).session(session);
      if (!draft) throw new Error("Draft not found");

      const grossWeight = parseFloat(draft.grossWeight) || 0;
      let purity = parseFloat(draft.purity) || parseFloat(draft.goldAuPercent) || 0;
      
      // If purity is > 1, it's in percentage format, convert to decimal
      if (purity > 1) {
        purity = purity / 100;
      }
      
      const pureWeight = grossWeight * purity;

      if (!draft.partyId || !draft.stockId || pureWeight <= 0) {
        console.warn(`Cannot reverse draft ${draftId}: Missing required data`);
        return;
      }

      // 1. Delete Registry entries (both draft and confirmed)
      const registryDeleteResult = await Registry.deleteMany(
        { draftId: draftId },
        { session }
      );
      console.log(`Deleted ${registryDeleteResult.deletedCount} registry entries for draft ${draftId}`);

      // 2. Reverse Party Balance - remove from totalGrams
      const party = await AccountType.findById(draft.partyId).session(session);
      if (party) {
        const currentTotalGrams = party.balances.goldBalance.totalGrams || 0;
        
        // Remove from actual balance (totalGrams)
        party.balances.goldBalance.totalGrams = Math.max(0, currentTotalGrams - pureWeight);
        party.balances.goldBalance.lastUpdated = new Date();
        await party.save({ session });
        console.log(`Reversed party balance for party ${draft.partyId}: TotalGrams=${party.balances.goldBalance.totalGrams}`);
      } else {
        console.warn(`Party not found: ${draft.partyId}`);
      }

      // 3. Delete Inventory Logs (both draft and confirmed)
      const inventoryLogDeleteResult = await InventoryLog.deleteMany(
        { draftId: draftId },
        { session }
      );
      console.log(`Deleted ${inventoryLogDeleteResult.deletedCount} inventory logs for draft ${draftId}`);

      // 4. Reverse Inventory - remove from actual inventory
      const inventory = await Inventory.findOne({ metal: draft.stockId }).session(session);
      if (inventory) {
        const oldGrossWeight = inventory.grossWeight || 0;
        const oldPureWeight = inventory.pureWeight || 0;
        
        inventory.grossWeight = Math.max(0, oldGrossWeight - grossWeight);
        inventory.pureWeight = Math.max(0, oldPureWeight - pureWeight);
        inventory.updatedBy = adminId;
        await inventory.save({ session });
        console.log(`Reversed inventory for stock ${draft.stockId}: GrossWeight=${inventory.grossWeight}, PureWeight=${inventory.pureWeight}`);
      } else {
        console.warn(`Inventory not found for stock ${draft.stockId}`);
      }
    } catch (error) {
      console.error("Error reversing confirmed draft:", error);
      throw error;
    }
  }

  // Delete draft
  static async deleteDraft(id, adminId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const draft = await Drafting.findById(id).session(session);
      if (!draft) {
        throw new Error("Draft not found");
      }

      // Handle different statuses
      if (draft.status === "draft") {
        // Remove draft entries (party draftBalance, registry, inventory logs)
        await this.rejectDraft(id, adminId, session);
      } else if (draft.status === "confirmed") {
        // Reverse all confirmed calculations (party totalGrams, registry, inventory logs, inventory)
        await this.reverseConfirmedDraft(id, adminId, session);
      } else if (draft.status === "rejected") {
        // Rejected drafts may still have draft entries, try to clean them up
        await this.rejectDraft(id, adminId, session);
      }

      // Delete the draft document
      await Drafting.findByIdAndDelete(id).session(session);

      await session.commitTransaction();
      console.log(`Successfully deleted draft ${id} with status ${draft.status}`);
      return draft;
    } catch (error) {
      await session.abortTransaction();
      console.error("Error deleting draft:", error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export default DraftingService;

