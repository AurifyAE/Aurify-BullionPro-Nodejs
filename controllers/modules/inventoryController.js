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
            type,
            value,
            metalId,
            voucher,
            goldBidPrice,
            purity,
            avgMakingRate: rawAvgMakingRate,
            avgMakingAmount: rawAvgMakingAmount,
        } = req.body;

        const parsedValue = parseFloat(value);

        if (!["pcs", "grams"].includes(type) || isNaN(parsedValue)) {
            return res.status(400).json({
                success: false,
                message: "Invalid update type or value",
            });
        }

        // ✅ Normalize optional fields
        const avgMakingRate =
            rawAvgMakingRate !== undefined && rawAvgMakingRate !== null && rawAvgMakingRate !== ""
                ? parseFloat(rawAvgMakingRate)
                : 0;

        const avgMakingAmount =
            rawAvgMakingAmount !== undefined && rawAvgMakingAmount !== null && rawAvgMakingAmount !== ""
                ? parseFloat(rawAvgMakingAmount)
                : 0;

        const adminId = req.admin.id;
        console.log(metalId,
            type,
            parsedValue,
            adminId,
            voucher,
            goldBidPrice,
            purity,
            avgMakingRate,
            avgMakingAmount
        )

        const updatedItem = await InventoryService.updateInventoryByFrontendInput({
            metalId,
            type,
            value: parsedValue,
            adminId,
            voucher,
            goldBidPrice,
            purity,
            avgMakingRate,
            avgMakingAmount,
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

