import Drafting from "../../models/modules/Drafting.js";
import AccountType from "../../models/modules/AccountType.js";
import MetalStock from "../../models/modules/MetalStock.js";

class DraftingService {
  // Create a new draft
  static async createDraft(draftData, adminId) {
    try {
      // Generate draft number if not provided
      if (!draftData.draftNumber) {
        const count = await Drafting.countDocuments();
        draftData.draftNumber = `DRF-${String(count + 1).padStart(3, "0")}`;
      }

      const draft = new Drafting({
        ...draftData,
        createdBy: adminId,
        status: draftData.status || "draft",
      });

      await draft.save();
      
      // Populate and return the draft
      const populatedDraft = await Drafting.findById(draft._id)
        .populate("createdBy", "name email")
        .populate("partyId", "customerName accountCode name")
        .populate("stockId", "stockCode description standardPurity purity")
        .lean();
      
      return populatedDraft;
    } catch (error) {
      console.error("Error creating draft:", error);
      throw error;
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
        .populate("stockId", "stockCode description standardPurity purity")
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
        .populate("stockId", "stockCode description standardPurity purity")
        .lean();

      return draft;
    } catch (error) {
      console.error("Error fetching draft:", error);
      throw error;
    }
  }

  // Update draft
  static async updateDraft(id, draftData, adminId) {
    try {
      const draft = await Drafting.findByIdAndUpdate(
        id,
        {
          ...draftData,
          updatedBy: adminId,
          updatedAt: new Date(),
        },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("partyId", "customerName accountCode name")
        .populate("stockId", "stockCode description standardPurity purity")
        .lean();

      return draft;
    } catch (error) {
      console.error("Error updating draft:", error);
      throw error;
    }
  }

  // Delete draft
  static async deleteDraft(id, adminId) {
    try {
      const draft = await Drafting.findByIdAndDelete(id);
      return draft;
    } catch (error) {
      console.error("Error deleting draft:", error);
      throw error;
    }
  }
}

export default DraftingService;

