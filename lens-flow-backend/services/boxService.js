import Box from '../models/Box.js';
import { isPositiveNumber } from '../utils/numberValidators.js';
import { getColorHex } from '../utils/colorValidators.js';

class boxService {
    async createBox({number, color}) {

        const NumberExists = await Box.findOne({ number: number });
        if (NumberExists) {
            throw new Error('Já existe uma caixa com esse número');
        };

        if (!number) {
            throw new Error('number e obrigatorio');
        };

        if (!isPositiveNumber(number)) {
            throw new Error('number deve ser um numero positivo');
        };
        
        const boxData = {};

        boxData.number = number;

        if (color) {
            boxData.color = getColorHex(color);
        };

        boxData.status = 'disponivel';

        const box = new Box(boxData);

        const createBox = await box.save();
        return createBox;
    };

    async getAllBoxes() {
        return await Box.find();
    };

    async searchBoxesByNumber(number) {
        const regex = new RegExp(number, 'i');
        const boxes = await Box.find({ 
            number: { $regex: regex } 
        })
        .sort({ number: 1 })
        .collation({ locale: "en_US", numericOrdering: true }); // Isso é crucial para ordenar strings numericamente
        return boxes;
    };

    async updateBox(id, { number , status, color }) {
        const box = await Box.findById(id);
        if (!box) {
            throw new Error('Box não encontrado');
        };

        if (!number && !status && !color) {
            throw new Error("Pelo menos um campo deve ser preenchido");
        };

        const updateData = {}

        if (number && number !== box.number) {
            if (!isPositiveNumber(number)) {
                throw new Error('number deve ser um numero positivo');
            }
            updateData.number = number;
        };

        if (status && status !== box.status) {
            updateData.status = status;
        };

        if (color && color !== box.color) {
            const colorHex = getColorHex(color);
            updateData.color = colorHex;
        };

        const updatedBox = await Box.findByIdAndUpdate(id, update, { new: true });
        return updatedBox;
    };

    async updateStatusBox(id, status) {
        return await Box.findByIdAndUpdate(id, { status: status });
    };

    async deleteBoxById(id) {
        return await Box.findByIdAndDelete(id);
    };

};

export default new boxService();