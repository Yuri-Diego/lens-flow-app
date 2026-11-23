import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import routes from "./routes.js";

const app = express();

app.use(
    cors({
        origin: ["http://localhost:5173"],
        credentials: true,
    })
);
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.use(routes); //global routes

export default app;
