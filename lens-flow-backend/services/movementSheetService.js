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
        return await MovementSheet.findById(movementSheetId).populate('movements');
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

