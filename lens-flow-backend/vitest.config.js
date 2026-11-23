import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.js"],
        // Cada arquivo sobe o próprio replica set em memória; o download do
        // binário na primeira execução pode demorar.
        hookTimeout: 120_000,
        testTimeout: 30_000,
    },
});
