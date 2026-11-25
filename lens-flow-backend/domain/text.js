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
 * A OS para comparar e buscar (D26, RN-15), ou null se não houver OS. Só deixa
 * de contar a diferença entre maiúsculas e minúsculas: "a-77" e "A-77" são a
 * mesma OS, mas acentos, espaços e pontuação contam ("É-1" e "E-1" não são).
 *
 * toLowerCase usa a tabela do Unicode, igual em qualquer máquina. O
 * toLocaleLowerCase dependeria do idioma: em turco, "I" não vira "i".
 */
export function normalizeOrderService(value) {
    return String(value ?? "").trim().toLowerCase() || null;
}

/**
 * Escapa os caracteres especiais de expressão regular: a busca vira um texto
 * literal, sem injeção de operadores nem retrocesso exponencial (S5). O NUL vai
 * como código, porque o MongoDB recusa uma expressão com ele cru.
 */
export function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\0", "\\x00");
}
