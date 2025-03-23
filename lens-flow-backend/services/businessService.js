import Business from "../models/Business.js";
import { isValidEmail } from "../utils/emailValidators.js";
import bcrypt from 'bcrypt';

class businessService {
    async createBusiness ({ businessName, email, password }) {
        if (!businessName || !email || !password) {
            throw new Error("Todos os campos são obrigatórios");
        }

        if (!isValidEmail(email)){
            throw new Error("Email inválido");
        }

        const checkEmailExists = await Business.findOne({email});
        
        if (checkEmailExists) {
            throw new Error("Email já cadastrado!");
        }

        const business = new Business({
            businessName: businessName.trim(),
            email: email.trim(),
            password: password,
        });

        const createdBusiness = await business.save();
        createdBusiness.password = undefined;

        return createdBusiness;
    }

    async findBusinessByEmail (email) {
        return await Business.findOne({email});
    };
    
    async findBusinessById (businessId) {
        return await Business.findById(businessId);
    };

    async getAllBusinesses () {
        return await Business.find();
    }

    async updateBusiness (businessId, { businessName, email, password }) {
        if (!businessName && !email && !password) {
            throw new Error("Pelo menos um campo deve ser preenchido");
        }

        if (email && !isValidEmail(email)){
            throw new Error("Email inválido");
        }

        const checkEmailExists = await Business.findOne({email});
        
        if (checkEmailExists) {
            throw new Error("Email já cadastrado!");
        }

        const salt = await bcrypt.genSalt(10);
        const updateData = {};

        if (businessName){
            updateData.businessName = businessName.trim();
        }
        if (email) {
            updateData.email = email.trim();
        }
        if (password) {
            updateData.password = await bcrypt.hash(password.trim(), salt);
        }

        const business = await Business.findByIdAndUpdate(businessId, updateData, {new: true});
        business.password = undefined;

        return business;

    }

    async deleteBusiness (businessId) {
        await Business.findByIdAndDelete(businessId)
    }
}

export default new businessService();