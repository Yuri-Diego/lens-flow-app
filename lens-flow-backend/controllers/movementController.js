import movementService from "../services/movementService";

class MovementController {
    async create(req, res) {
        try {
            const movementData = req.body;
            const newMovement = await movementService.createMovement(movementData);
            res.status(201).json({ message: "Movimento criado com sucesso", newMovement });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getAllMovements(req, res) {
        try {
            const movements = await movementService.getAllMovements();
            res.status(200).json(movements);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getAllMovementsByMovementSheetId(req, res) {
        try {
            const { id } = req.params;
            const movements = await movementService.getAllMovementsByMovementSheetId(id);
            res.status(200).json(movements);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getMovementById(req, res) {
        try {
            const { id } = req.params;
            const movement = await movementService.getMovementById(id);
            if (!movement) {
                return res.status(404).json({ message: 'Movimento não encontrado' });
            }
            res.status(200).json(movement);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getMovementsByBoxNumber(req, res) {
        try {
            const { number } = req.params;
            const movements = await movementService.getMovementsByBoxNumber(number);
            res.status(200).json(movements);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async update(req, res) {
        try {
            const { id } = req.params;
            const movementData = req.body;
            const updatedMovement = await movementService.updateDataMovement(id, movementData);
            if (!updatedMovement) {
                return res.status(404).json({ message: 'Movimento não encontrado' });
            }
            res.status(200).json({ message: "Movimento atualizado com sucesso", updatedMovement });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async updateStatusMovement(req, res) {
        try {
            const { id } = req.params;
            const movementData = req.body;
            const updatedMovement = await movementService.updateStatusMovement(id, movementData);
            if (!updatedMovement) {
                return res.status(404).json({ message: 'Movimento não encontrado' });
            }
            res.status(200).json({ message: "Movimento atualizado com sucesso", updatedMovement });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async updateBoxMovement(req, res) {
        try {
            const { id } = req.params;
            const { boxId } = req.body;
            const updatedMovement = await movementService.updateBoxMovement(id, boxId);
            if (!updatedMovement) {
                return res.status(404).json({ message: 'Movimento não encontrado' });
            }
            res.status(200).json({ message: "Movimento atualizado com sucesso", updatedMovement });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const deleted = await movementService.deleteMovement(id);
            if (!deleted) {
                return res.status(404).json({ message: 'Movimento não encontrado' });
            }
            res.status(200).json({ message: 'Movimento deletado' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };
}

export default new MovementController();