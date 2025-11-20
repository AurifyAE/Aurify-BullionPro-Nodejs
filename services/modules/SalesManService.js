// src/services/modules/SalesmanService.js
import Salesman from "../../models/modules/SalesMan.js";
import { createAppError } from "../../utils/errorHandler.js";

export class SalesmanService {
  static async createSalesman(salesmanData, adminId) {
    const { name, email, phone, status = true } = salesmanData;

    if (!name?.trim()) {
      throw createAppError("Salesman name is required", 400, "REQUIRED_FIELD_MISSING");
    }

    const nameExists = await Salesman.isNameExists(name.trim());
    if (nameExists) {
      throw createAppError(`Salesman with name '${name}' already exists`, 409, "DUPLICATE_NAME");
    }

    const salesman = new Salesman({
      name: name.trim(),
      email: email?.trim()?.toLowerCase() || null,
      phone: phone?.trim() || null,
      status: status !== undefined ? !!status : true,
      createdBy: adminId,
    });

    await salesman.save();

    return await Salesman.findById(salesman._id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");
  }

  static async getAllSalesmen(page = 1, limit = 10, search = "", statusFilter = "") {
    const skip = (page - 1) * limit;
    const query = {};

    if (statusFilter === "active") query.status = true;
    if (statusFilter === "inactive") query.status = false;

    if (search) {
      query.$or = [
        { code: new RegExp(search, "i") },
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
      ];
    }

    const [salesmen, total] = await Promise.all([
      Salesman.find(query)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Salesman.countDocuments(query),
    ]);

    return {
      salesmen,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    };
  }

  static async getSalesmanById(id) {
    const salesman = await Salesman.findById(id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!salesman) throw createAppError("Salesman not found", 404, "NOT_FOUND");

    return salesman;
  }

  static async updateSalesman(id, updateData, adminId) {
    const salesman = await Salesman.findById(id);
    if (!salesman) throw createAppError("Salesman not found", 404, "NOT_FOUND");

    const { name, email, phone, status } = updateData;

    if (name && name.trim() !== salesman.name) {
      const nameExists = await Salesman.isNameExists(name.trim(), id);
      if (nameExists) {
        throw createAppError(`Salesman with name '${name}' already exists`, 409, "DUPLICATE_NAME");
      }
    }

    const payload = {
      updatedBy: adminId,
    };

    if (name) payload.name = name.trim();
    if (email !== undefined) payload.email = email?.trim()?.toLowerCase() || null;
    if (phone !== undefined) payload.phone = phone?.trim() || null;
    if (status !== undefined) payload.status = !!status;

    const updatedSalesman = await Salesman.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    return updatedSalesman;
  }

  static async updateSalesmanStatus(id, status, adminId) {
    const salesman = await Salesman.findById(id);
    if (!salesman) throw createAppError("Salesman not found", 404, "NOT_FOUND");

    salesman.status = !!status;
    salesman.updatedBy = adminId;
    await salesman.save();

    return await Salesman.findById(id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");
  }

  static async deleteSalesman(id) {
    const salesman = await Salesman.findById(id);
    if (!salesman) throw createAppError("Salesman not found", 404, "NOT_FOUND");

    await Salesman.deleteOne({ _id: id });
    return { message: "Salesman deleted successfully" };
  }
}

export default SalesmanService;