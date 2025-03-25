import BoxService from "../services/boxService.js";

class BoxController {
    async create(req, res) {
        try {
            const boxData = req.body;
            const newBox = await BoxService.createBox(boxData);
            res.status(201).json({ message: "Box Criado com sucesso", newBox });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getAllBoxes(req, res) {
        try {
            const boxes = await BoxService.getAllBoxes();
            res.status(200).json(boxes);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async getBoxByNumber(req, res) {
        try {
            const { number } = req.params;
            const box = await BoxService.searchBoxesByNumber(number);
            if (!box || box.length === 0) {
                return res.status(404).json({ message: 'Box não encontrado' });
            }
            res.status(200).json(box);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async update(req, res) {
        try {
            const { id } = req.params;
            const boxData = req.body;
            const updatedBox = await BoxService.updateBox(id, boxData);
            if (!updatedBox) {
                return res.status(404).json({ message: 'Box não encontrado' });
            }
            res.status(200).json({ message: "Box atualizado com sucesso", updatedBox });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async updateStatusBox(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const updatedBox = await BoxService.updateStatusBox(id, status);
            if (!updatedBox) {
                return res.status(404).json({ message: 'Box não encontrado' });
            }
            res.status(200).json({ message: "Status do Box atualizado com sucesso", updatedBox });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    async delete(req, res) {
        try {
            const { id } = req.params;
            const deleted = await BoxService.deleteBoxById(id);
            if (!deleted) {
                return res.status(404).json({ message: 'Box não encontrado' });
            }
            res.status(200).json({ message: 'Box deletado' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

}

export default new BoxController();