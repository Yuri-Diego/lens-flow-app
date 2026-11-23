import { describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp } from "./helpers/app.js";

describe("verificação de saúde", () => {
    it.each(["/health", "/api/health"])(
        "GET %s responde 200 sem sessão e sem precisar de banco",
        async (path) => {
            const response = await request(createTestApp()).get(path);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: "ok" });
        }
    );
});
