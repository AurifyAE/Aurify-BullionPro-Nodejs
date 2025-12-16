import StockAdjustmentService from '../../services/modules/stockAdjustmentService.js';


export const createStockAdjustment = async (req, res, next) => {
    try {
        console.log(req.admin)
        const adminId = req.admin?.id;
        console.log("Admin ID:", adminId);

        if (!adminId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const newStockAdjustment =
            await StockAdjustmentService.addStockAdjustment(req.body, adminId);

        res.status(201).json({
            success: true,
            data: newStockAdjustment,
        });
    } catch (error) {
        next(error);
    }
};


export const getAllStockAdjustments = async (req, res, next) => {
    // To be implemented
}

export const getStockAdjustmentById = async (req, res, next) => {
    // To be implemented
}

export const updateStockAdjustment = async (req, res, next) => {
    // To be implemented
}

export const deleteStockAdjustment = async (req, res, next) => {
    // To be implemented
}