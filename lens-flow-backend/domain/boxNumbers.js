/**
 * Número da caixa (RN-03, D4): só dígitos, maior que zero e com até 6
 * dígitos. É guardado sem zeros à esquerda ("007" vira "7"), para que digitar
 * "7" ou "07" encontre a mesma caixa e o índice único não aceite as duas.
 */

export const BOX_NUMBER_MAX_DIGITS = 6;
export const BOX_BATCH_MAX_ITEMS = 500;

const DIGITS = /^\d+$/;
const RANGE = /^(\d+)-(\d+)$/;
const MAX_ECHO = 20;

/**
 * Valida e normaliza um número digitado.
 * @returns {{ value: string } | { error: string }}
 */
export function parseBoxNumber(raw) {
    const value = String(raw).trim();
    if (!DIGITS.test(value)) {
        return { error: "Use só dígitos no número da caixa." };
    }
    const normalized = value.replace(/^0+/, "");
    if (normalized === "") {
        return { error: "O número da caixa precisa ser maior que zero." };
    }
    if (normalized.length > BOX_NUMBER_MAX_DIGITS) {
        return {
            error: `O número da caixa pode ter no máximo ${BOX_NUMBER_MAX_DIGITS} dígitos.`,
        };
    }
    return { value: normalized };
}

/**
 * Lê a lista do cadastro em lote, por exemplo "3, 12, 27-30", e devolve os
 * números na ordem digitada, com os intervalos expandidos e as repetições
 * mantidas (o resultado item a item aponta cada repetição).
 *
 * Aceita vírgula, ponto e vírgula, espaço ou quebra de linha entre os itens, e
 * hífen ou travessão nos intervalos. O total é conferido antes de expandir
 * cada intervalo, então "1-999999" é recusado sem alocar a lista: o custo é
 * O(n) no total de números, que nunca passa de BOX_BATCH_MAX_ITEMS.
 *
 * @returns {{ numbers: string[] } | { error: string }}
 */
export function parseBoxNumberList(text) {
    const tokens = String(text)
        .replace(/\s*[-–—]\s*/g, "-")
        .split(/[\s,;]+/)
        .filter(Boolean);
    if (tokens.length === 0) {
        return { error: "Informe pelo menos um número." };
    }

    const numbers = [];
    for (const token of tokens) {
        const range = RANGE.exec(token);
        if (range) {
            const start = parseBoxNumber(range[1]);
            const end = parseBoxNumber(range[2]);
            const problem = start.error ?? end.error;
            if (problem) {
                return { error: `Intervalo "${echo(token)}": ${problem}` };
            }
            const from = Number(start.value);
            const to = Number(end.value);
            if (from > to) {
                return {
                    error: `Intervalo "${echo(token)}" invertido: o primeiro número precisa ser menor ou igual ao segundo.`,
                };
            }
            if (numbers.length + (to - from + 1) > BOX_BATCH_MAX_ITEMS) {
                return tooMany();
            }
            for (let number = from; number <= to; number += 1) {
                numbers.push(String(number));
            }
            continue;
        }

        if (!DIGITS.test(token)) {
            return {
                error: `"${echo(token)}" não é um número nem um intervalo. Use, por exemplo, 12 ou 27-30.`,
            };
        }
        const single = parseBoxNumber(token);
        if (single.error) {
            return { error: `"${echo(token)}": ${single.error}` };
        }
        if (numbers.length + 1 > BOX_BATCH_MAX_ITEMS) {
            return tooMany();
        }
        numbers.push(single.value);
    }
    return { numbers };
}

function tooMany() {
    return { error: `Cadastre no máximo ${BOX_BATCH_MAX_ITEMS} caixas por lote.` };
}

function echo(token) {
    return token.length > MAX_ECHO ? `${token.slice(0, MAX_ECHO)}…` : token;
}
