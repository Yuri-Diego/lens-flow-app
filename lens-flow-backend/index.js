import express from "express";
import cors from "cors";
import {config} from "dotenv";
import connectDB from "./db/database.js";
import cookieParser from "cookie-parser";
import routes from "./routes.js"
import { getBrazilianDate } from "./utils/dateUtils.js";

config();

const app = express();
const portApi= process.env.PORT || 5000;

console.log('=== TESTE DE DATA BRASILEIRA ===');
console.log(`Date.now(): ${new Date()}`);
console.log(`getBrazilianDate(): ${getBrazilianDate()}`);
console.log(`Diferença: ${new Date().getHours() - getBrazilianDate().getHours()}h`);

app.use(
    cors({
        origin: ["http://localhost:5173"],
        credentials: true,
    })
);
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

app.use(routes) //global routes

await connectDB();

app.listen(portApi, () => {
    console.log(`API Server rodando na porta ${portApi}`);
});