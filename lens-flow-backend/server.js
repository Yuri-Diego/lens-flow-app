import { config } from "dotenv";
import app from "./app.js";
import connectDB from "./db/database.js";

config();

const portApi = process.env.PORT || 5000;

await connectDB();

app.listen(portApi, () => {
    console.log(`API Server rodando na porta ${portApi}`);
});
