import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const server = process.env.DATABASE_URL;
const database = process.env.DATABASE_NAME;

const connectDB = async () => {
    try {
        await mongoose.connect(`${server}/${database}`, {
        });
        console.log("Conectado ao banco de dados");
    } catch (error) {
        console.log("Erro ao conectar ao banco de dados", error);
    }
}
export default connectDB;
