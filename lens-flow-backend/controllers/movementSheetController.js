import movementSheetService from "../services/movementSheetService";

class MovementSheetController {
    async create(req, res) {
        try {
            const { businessId } = req.body;
            const newMovementSheet = await movementSheetService.createMovementSheet(businessId);
            res.status(201).json({ message: "Planilha de movimentação criada com sucesso", newMovementSheet });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getAll(req, res) {
        try {
            const movementSheets = await movementSheetService.getAllMovementSheets();
            res.status(200).json(movementSheets);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getById(req, res) {
        try {
            const { id } = req.params;
            const movementSheet = await movementSheetService.getMovementSheetById(id);
            if (!movementSheet) {
                return res.status(404).json({ message: 'Planilha de movimentação não encontrada' });
            }
            res.status(200).json(movementSheet);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getAllMovementsByMovementSheetIdSortedByBoxNumber(req, res) {
        try {
            const { id } = req.params;
            const movements = await movementSheetService.getAllMovementsByMovementSheetIdSortedByBoxNumber(id);
            res.status(200).json(movements);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const deleted = await movementSheetService.deleteMovementSheet(id);
            if (!deleted) {
                return res.status(404).json({ message: 'Planilha de movimentação não encontrada' });
            }
            res.status(200).json({ message: 'Planilha de movimentação deletada' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export default new MovementSheetController();