import InventoryService from "../../services/modules/inventoryService.js";


// for fetching all inventory
export const getAllInventory = async (req, res, next) => {
    try {
        const getAllInventory = await InventoryService.fetchAllInventory()
        res.status(200).json(getAllInventory);
    } catch (error) {
        next(error);
    }
};

export const getInventoryById = async (req, res, next) => {
    try {
        const getAllInventory = await InventoryService.fetchInventoryById(req.params.id)
        res.status(200).json(getAllInventory);
    } catch (error) {
        next(error);
    }
};

export const getInventoryLogById = async (req, res, next) => {
    console.log("One log fetch controller hit");
    console.log(req.params.id);
    try {
        const singleInventoryLog = await InventoryService.getInventoryLogById(req.params.id)
        res.status(200).json(singleInventoryLog);
    } catch (error) {
        next(error);
    }
};

export const updateInventoryLog = async (req, res, next) => {
    const body = req.body;
    const adminId = req.user?._id;
    console.log("Update log controller hit");
    try {
        const updatedInventoryLog = await InventoryService.updateInventoryLog(req.params.id, body, adminId)
        res.status(200).json(updatedInventoryLog);
    } catch (error) {
        next(error);
    }
};

export const deleteInventoryLogById = async (req, res, next) => {
    console.log("Delete log controller hit");
    try {
        const response = await InventoryService.deleteInventoryLogById(req.params.id)
        res.status(200).json({ message: "Inventory log deleted successfully" });
    } catch (error) {
        next(error);
    }
};



export const getAllLogs = async (req, res, next) => {
    try {
        const InventoryLogs = await InventoryService.fetchInvLogs()
        res.status(200).json(InventoryLogs);
    } catch (error) {
        next(error);
    }
};


// inital invenoty add
export const createInventory = async (req, res, next) => {
    try {
        const adminId = req.user?._id; // Or however you're getting admin ID
        const data = req.body;

        const newItem = await InventoryService.addInventory(data, adminId);
        res.status(201).json(newItem);
    } catch (error) {
        next(error);
    }
};

// update the inventory
export const updateInventory = async (req, res, next) => {
    try {
        const {
            metalId,
            grossWeight,
            pieces,
            purity,
            pureWeight,
            avgMakingRate: rawAvgMakingRate,
            avgMakingAmount: rawAvgMakingAmount,
            voucherDate,
            voucher,
            goldBidPrice,
        } = req.body;

        const avgMakingRate =
            rawAvgMakingRate !== undefined && rawAvgMakingRate !== null && rawAvgMakingRate !== ""
                ? parseFloat(rawAvgMakingRate)
                : 0;

        const avgMakingAmount =
            rawAvgMakingAmount !== undefined && rawAvgMakingAmount !== null && rawAvgMakingAmount !== ""
                ? parseFloat(rawAvgMakingAmount)
                : 0;

        const adminId = req.admin.id;

        const updatedItem = await InventoryService.updateInventoryByFrontendInput({
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
        });

        res.status(200).json({
            success: true,
            message: "Inventory updated successfully",
            data: updatedItem,
        });
    } catch (error) {
        next(error);
    }
};


export const updateInventoryBatchWiseOpeningStock = async (req, res, next) => {
    try {
        const {
            metalId,
            grossWeight,
            pieces,
            purity,
            pureWeight,
            avgMakingRate: rawAvgMakingRate,
            avgMakingAmount: rawAvgMakingAmount,
            voucherDate,
            voucher,
            goldBidPrice,
        } = req.body;

        const avgMakingRate =
            rawAvgMakingRate !== undefined && rawAvgMakingRate !== null && rawAvgMakingRate !== ""
                ? parseFloat(rawAvgMakingRate)
                : 0;

        const avgMakingAmount =
            rawAvgMakingAmount !== undefined && rawAvgMakingAmount !== null && rawAvgMakingAmount !== ""
                ? parseFloat(rawAvgMakingAmount)
                : 0;

        const adminId = req.admin.id;

        const updatedItem = await InventoryService.updateInventoryByFrontendInput({
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
        });

        res.status(200).json({
            success: true,
            message: "Inventory updated successfully",
            data: updatedItem,
        });
    } catch (error) {
        next(error);
    }
};