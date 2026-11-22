import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("GET /health", () => {
    it("responde 200 com status ok sem precisar de banco", async () => {
        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "ok" });
    });
});
