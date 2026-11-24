/**
 * Texto para busca (R9): sem acento, em minúsculas e com um espaço só entre
 * as palavras. "Ótica  São João" vira "otica sao joao".
 */
export function normalizeSearchText(value) {
    return String(value)
        .normalize("NFD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Escapa os caracteres especiais de expressão regular: a busca vira um texto
 * literal, sem injeção de operadores nem retrocesso exponencial (S5).
 */
export function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
