/**
 * Número da caixa (RN-03, D4, D18): só dígitos, com até 6, e maior que zero.
 * É guardado exatamente como na etiqueta: o zero à esquerda importa, então
 * "007" e "7" são caixas diferentes. Só os espaços nas pontas saem.
 */

export const BOX_NUMBER_MAX_DIGITS = 6;
export const BOX_BATCH_MAX_ITEMS = 500;

const DIGITS = /^\d+$/;
const ALL_ZEROS = /^0+$/;
const RANGE = /^(\d+)-(\d+)$/;
const MAX_ECHO = 20;

/**
 * Valida um número digitado e o devolve como veio (sem os espaços nas pontas).
 * @returns {{ value: string } | { error: string }}
 */
export function parseBoxNumber(raw) {
    const value = String(raw).trim();
    if (!DIGITS.test(value)) {
        return { error: "Use só dígitos no número da caixa." };
    }
    if (ALL_ZEROS.test(value)) {
        return { error: "O número da caixa precisa ser maior que zero." };
    }
    if (value.length > BOX_NUMBER_MAX_DIGITS) {
        return {
            error: `O número da caixa pode ter no máximo ${BOX_NUMBER_MAX_DIGITS} dígitos.`,
        };
    }
    return { value };
}

function hasLeadingZero(value) {
    return value.length > 1 && value.startsWith("0");
}

/**
 * Chave da ordem natural (RN-10): o valor numérico e, no empate entre "7" e
 * "007", menos dígitos primeiro. Toda chave tem 7 caracteres (o valor com 6
 * dígitos e a quantidade de dígitos digitada), então a ordem de texto simples
 * da chave é a ordem natural, no banco ou em memória.
 */
export function boxNumberSortKey(number) {
    const value = number.replace(/^0+/, "").padStart(BOX_NUMBER_MAX_DIGITS, "0");
    return `${value}${number.length}`;
}

/** Comparador da ordem natural: "2" antes de "10", "7" antes de "007". */
export function compareBoxNumbers(a, b) {
    const keyA = boxNumberSortKey(a);
    const keyB = boxNumberSortKey(b);
    if (keyA === keyB) {
        return 0;
    }
    return keyA < keyB ? -1 : 1;
}

/**
 * Lê a lista do cadastro em lote, por exemplo "3, 12, 27-30", e devolve os
 * números na ordem digitada, com os intervalos expandidos e as repetições
 * mantidas (o resultado item a item aponta cada repetição).
 *
 * Aceita vírgula, ponto e vírgula, espaço ou quebra de linha entre os itens, e
 * hífen ou travessão nos intervalos. Um intervalo com zero à esquerda mantém a
 * largura das pontas (D18): "007-010" vira 007, 008, 009 e 010. Por isso as
 * duas pontas precisam ter a mesma quantidade de dígitos.
 *
 * O total é conferido antes de expandir cada intervalo, então "1-999999" é
 * recusado sem alocar a lista: o custo é O(n) no total de números, que nunca
 * passa de BOX_BATCH_MAX_ITEMS.
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
            const expanded = expandRange(token, range[1], range[2], numbers.length);
            if (expanded.error) {
                return expanded;
            }
            numbers.push(...expanded.numbers);
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

function expandRange(token, rawStart, rawEnd, alreadyListed) {
    const start = parseBoxNumber(rawStart);
    const end = parseBoxNumber(rawEnd);
    const problem = start.error ?? end.error;
    if (problem) {
        return { error: `Intervalo "${echo(token)}": ${problem}` };
    }
    const padded = hasLeadingZero(start.value) || hasLeadingZero(end.value);
    if (padded && start.value.length !== end.value.length) {
        return {
            error: `Intervalo "${echo(token)}": com zero à esquerda, use a mesma quantidade de dígitos nas duas pontas, por exemplo 007-012.`,
        };
    }
    const from = Number(start.value);
    const to = Number(end.value);
    if (from > to) {
        return {
            error: `Intervalo "${echo(token)}" invertido: o primeiro número precisa ser menor ou igual ao segundo.`,
        };
    }
    if (alreadyListed + (to - from + 1) > BOX_BATCH_MAX_ITEMS) {
        return tooMany();
    }
    const width = start.value.length;
    const numbers = [];
    for (let number = from; number <= to; number += 1) {
        numbers.push(padded ? String(number).padStart(width, "0") : String(number));
    }
    return { numbers };
}

function tooMany() {
    return { error: `Cadastre no máximo ${BOX_BATCH_MAX_ITEMS} caixas por lote.` };
}

function echo(token) {
    return token.length > MAX_ECHO ? `${token.slice(0, MAX_ECHO)}…` : token;
}
