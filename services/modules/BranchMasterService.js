import Branch from "../../models/modules/BranchMaster.js";
import { createAppError } from "../../utils/errorHandler.js";

class BranchMasterService {
  static async createBranch(branchData, adminId) {
    const codeExists = await Branch.isCodeExists(branchData.code);
    if (codeExists) {
      throw createAppError(`Branch code '${branchData.code}' already exists`, 409, "DUPLICATE_CODE");
    }

    const branch = new Branch({
      ...branchData,
      createdBy: adminId,
    });

    await branch.save();
    return await this._populateBranch(branch._id);
  }

  static async updateBranch(id, updateData, adminId) {
    const branch = await Branch.findById(id);
    if (!branch) throw createAppError("Branch not found", 404, "NOT_FOUND");

    // Code change check
    if (updateData.code && updateData.code !== branch.code) {
      const codeExists = await Branch.isCodeExists(updateData.code, id);
      if (codeExists) {
        throw createAppError(`Branch code '${updateData.code}' already exists`, 409, "DUPLICATE_CODE");
      }
    }

    const updated = await Branch.findByIdAndUpdate(
      id,
      { ...updateData, updatedBy: adminId },
      { new: true, runValidators: true }
    );

    return await this._populateBranch(updated._id);
  }
  
  static async getAllBranches(page = 1, limit = 10, search = "", status = "") {
    const skip = (page - 1) * limit;
    const query = {};

    if (search) {
      query.$or = [
        { code: new RegExp(search, "i") },
        { name: new RegExp(search, "i") },
        { branchName: new RegExp(search, "i") },
      ];
    }
    if (status) query.status = status;

    const [branches, total] = await Promise.all([
      Branch.find(query)
        .populate("currency", "currencyCode conversionRate")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Branch.countDocuments(query),
    ]);

    return {
      branches,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    };
  }

  static async getBranchById(id) {
    const branch = await this._populateBranch(id);
    if (!branch) throw createAppError("Branch not found", 404, "NOT_FOUND");
    return branch;
  }



  static async deleteBranch(id) {
    const branch = await Branch.findById(id);
    if (!branch) throw createAppError("Branch not found", 404, "NOT_FOUND");

    branch.status = "inactive";
    branch.isActive = false;
    await branch.save();

    return { message: "Branch deleted (soft) successfully" };
  }

  static async _populateBranch(id) {
    return await Branch.findById(id)
      .populate("currency", "code name symbol")
      .populate("financialYear", "code startDate endDate")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");
  }
}

export default BranchMasterService;