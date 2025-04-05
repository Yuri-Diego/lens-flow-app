import Movement from "../models/Movement.js";
import movementSheetService from "../services/movementSheetService.js";
import boxService from "./boxService.js";

class movementService {
    async createMovement({ clientName, orderService, note, boxId, movementSheetId }) {
        if (!clientName || clientName.trim() === '') {
            throw new Error('clientName é obrigatório e deve ser uma string não vazia');
        }
    
        if (!boxId) {
            throw new Error('boxId é obrigatório');
        }
    
        if (!movementSheetId) {
            throw new Error('movementSheetId é obrigatório');
        }

        const movement = new Movement({
            clientName: clientName.trim(),
            orderService: orderService || 'Sem OS',
            note: note || '',
            status: 'na surfaçagem',
            box: boxId,
            movementSheet: movementSheetId,
        });
        
        const movementSaved = await movement.save();

        await movementSheetService.addMovementToSheet(movementSheetId, movementSaved._id);

        return movementSaved;
    }

    async getAllMovements() {
        return await Movement.find().populate('box').populate('movementSheet');
    }

    async getMovementById(movementId) {
        return Movement.find({ _id: movementId }).populate('box').populate('movementSheet');
    }

    async getMovementsByBoxNumber(boxNumber) {
        const box = await boxService.searchBoxesByNumber(boxNumber);

        const movements = await Movement.find({ box: box[0]._id }).populate('box').populate('movementSheet');

        return movements;
    }

    async updateDataMovement(movementId, { clientName, orderService, note}) {
        if (!clientName && !orderService && !note) {
            throw new Error('Pelo menos um campo deve ser preenchido');
        }
    
        const updatedMovement = await Movement.findByIdAndUpdate(
            movementId,
            {
                clientName,
                orderService,
                note,
            },
            { new: true, runValidators: true }
        ).populate('box').populate('movementSheet');
    
        return updatedMovement;
    }

    async updateStatusMovement(movementId, status) {
        if (!status) {
            throw new Error('status é obrigatório');
        }
        const updatedMovement = await Movement.findByIdAndUpdate(
            movementId,
            status,
            { new: true, runValidators: true }
        ).populate('box').populate('movementSheet');
    
        return updatedMovement;
    }

    async updateBoxMovement(movementId, boxId) {
        if (!boxId) {
            throw new Error('boxId é obrigatório');
        }
    
        const updatedMovement = await Movement.findByIdAndUpdate(
            movementId,
            { box: boxId },
            { new: true, runValidators: true }
        ).populate('box').populate('movementSheet');
    
        return updatedMovement;
    }

    async deleteMovement(movementId) {
        const deletedMovement = await Movement.findByIdAndDelete(movementId);
    
        if (!deletedMovement) {
            throw new Error('Movimento não encontrado');
        }
    
        return deletedMovement;
    }

    async deleteAllMovementsByMovementSheetId(movementSheetId) {
        const deletedMovements = await Movement.deleteMany({ movementSheet: movementSheetId });
    
        if (deletedMovements.deletedCount === 0) {
            throw new Error('Nenhum movimento encontrado para a planilha de movimentos fornecida');
        }
    
        return deletedMovements;
    }
}

export default new movementService();