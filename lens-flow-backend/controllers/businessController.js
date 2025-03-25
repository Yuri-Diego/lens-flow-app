import BusinessService from "../services/businessService.js";

class BusinessController {
    async create(req, res) {
        try {
            const businessData = req.body;
            const newBusiness = await BusinessService.createBusiness(businessData);
            res.status(201).json({ message: "Business Criado com sucesso", newBusiness });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getAllBusinesses(req, res) {
        try {
            const businesses = await BusinessService.getAllBusinesses();
            res.status(200).json(businesses);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getBusinessById(req, res) {
        try {
            const { id } = req.params;
            const business = await BusinessService.getBusinessById(id);
            if (!business) {
                return res.status(404).json({ message: 'Business não encontrado' });
            }
            res.status(200).json(business);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const businessData = req.body;
            const updatedBusiness = await BusinessService.updateBusiness(id, businessData);
            if (!updatedBusiness) {
                return res.status(404).json({ message: 'Business não encontrado' });
            }
            res.status(200).json({ message: "Business atualizado com sucesso", updatedBusiness });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const deleted = await BusinessService.deleteBusiness(id);
            if (!deleted) {
                return res.status(404).json({ message: 'Business não encontrado' });
            }
            res.status(200).json({ message: 'Business deletado' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export default new BusinessController();