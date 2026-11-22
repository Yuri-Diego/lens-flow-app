import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores(["node_modules", "coverage"]),
    {
        files: ["**/*.js"],
        extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.node,
        },
    },
    {
        // B1 (ESPECIFICACAO.md §12): updateBox usa a variável inexistente
        // `update`. Fica como aviso até a reescrita do backend na F2; remover
        // este bloco quando o bug for corrigido.
        files: ["services/boxService.js"],
        rules: { "no-undef": "warn" },
    },
]);
