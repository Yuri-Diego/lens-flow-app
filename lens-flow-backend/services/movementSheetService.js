import MovementSheet from '../models/movementSheet.js';
import movementService from './movementService.js';

class movementSheetService {
    async createMovementSheet(businessId) {
        if (!businessId || businessId === '') {
            throw new Error('BusinessId é obrigatório');
        }

        const movementSheet = new MovementSheet({
            businessId,
        });

        return await movementSheet.save();
    }

    async getAllMovementSheets() {
        return await MovementSheet.find().populate('businessId');
    }

    async getMovementSheetWithMovements(movementSheetId) {
        const movementSheet = await MovementSheet.findById(movementSheetId).populate('movements');

        // Formatando os dados dos movimentos
        const formattedMovements = movementSheet.movements.map(movement => ({
            id: movement._id,
            clientName: movement.clientName,
            orderService: movement.orderService,
            note: movement.note,
            status: movement.status,
            box: movement.box ? movement.box.number : null,
            movementSheet: movement.movementSheet ? movement.movementSheet._id : null,
        }));

        return {
            id: movementSheet._id,
            businessId: movementSheet.businessId,
            createdAt: movementSheet.createdAt,
            movements: formattedMovements,
        };
    }

    async addMovementToSheet(movementSheetId, movementId) {
        if (!movementSheetId || !movementId) {
            throw new Error('movementSheetId e movementId são obrigatórios');
        }
        const updatedSheet = await MovementSheet.findOneAndUpdate(
            {
                _id: movementSheetId,
                movements: { $ne: movementId } // Só atualiza se o movimento não existir
            },
            { $push: { movements: movementId } },
            { new: true, runValidators: true }
        );
    
        if (!updatedSheet) {
            // Verifica se foi porque a sheet não existe ou porque o movimento já estava presente
            const existingSheet = await MovementSheet.exists({ _id: movementSheetId });
            if (!existingSheet) {
                throw new Error('Planilha de movimentos não encontrada');
            }
            throw new Error('Movimento já existe na planilha');
        }
    
        return updatedSheet;
    }

    async deleteMovementSheet(movementSheetId) {
        if (!movementSheetId) {
            throw new Error('movementSheetId é obrigatório');
        }
        await movementService.deleteAllMovementsByMovementSheetId(movementSheetId);
        return await MovementSheet.findByIdAndDelete(movementSheetId);
    }

}

export default new movementSheetService();

