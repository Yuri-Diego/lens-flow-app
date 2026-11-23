import { describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

describe("GET /api/meta/box-colors", () => {
    it("exige sessão", async () => {
        const response = await request(createTestApp()).get("/api/meta/box-colors");

        expect(response.status).toBe(401);
    });

    it("lista as 6 cores com rótulo, categoria e rótulo da categoria (RN-03, RN-04, D3)", async () => {
        const app = createTestApp();
        const { operatorCookie } = await setupBusiness(app, "a");

        const response = await request(app).get("/api/meta/box-colors").set("Cookie", operatorCookie);

        expect(response.status).toBe(200);
        expect(response.body.colors).toEqual([
            { key: "branca", label: "Branca", category: "without_assembly", categoryLabel: "Sem montagem" },
            { key: "preta", label: "Preta", category: "without_assembly", categoryLabel: "Sem montagem" },
            { key: "verde", label: "Verde", category: "with_assembly", categoryLabel: "Com montagem" },
            { key: "amarela", label: "Amarela", category: "with_assembly", categoryLabel: "Com montagem" },
            { key: "vermelha", label: "Vermelha", category: "urgent", categoryLabel: "Urgente" },
            { key: "azul", label: "Azul", category: "with_treatment", categoryLabel: "Com tratamento" },
        ]);
        expect(response.body.categories).toEqual([
            { key: "without_assembly", label: "Sem montagem", colors: ["branca", "preta"] },
            { key: "with_assembly", label: "Com montagem", colors: ["verde", "amarela"] },
            { key: "urgent", label: "Urgente", colors: ["vermelha"] },
            { key: "with_treatment", label: "Com tratamento", colors: ["azul"] },
        ]);
        // O hex é decisão do web (B14).
        expect(JSON.stringify(response.body)).not.toContain("#");
    });
});
