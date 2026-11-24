import { describe, expect, it } from "vitest";
import {
    BOX_BATCH_MAX_ITEMS,
    boxNumberSortKey,
    compareBoxNumbers,
    parseBoxNumber,
    parseBoxNumberList,
} from "../domain/boxNumbers.js";

describe("parseBoxNumber", () => {
    it("aceita só dígitos e guarda o número como na etiqueta, com o zero à esquerda (D18)", () => {
        expect(parseBoxNumber("12")).toEqual({ value: "12" });
        expect(parseBoxNumber("007")).toEqual({ value: "007" });
        expect(parseBoxNumber(" 30 ")).toEqual({ value: "30" });
        expect(parseBoxNumber("000123")).toEqual({ value: "000123" });
    });

    it.each(["", "12a", "1.5", "-3", "1 2", "١٢"])("recusa %j", (raw) => {
        expect(parseBoxNumber(raw).error).toBe("Use só dígitos no número da caixa.");
    });

    it("recusa zero e mais de 6 dígitos, contando os zeros à esquerda", () => {
        expect(parseBoxNumber("0").error).toMatch(/maior que zero/);
        expect(parseBoxNumber("000").error).toMatch(/maior que zero/);
        expect(parseBoxNumber("1234567").error).toMatch(/no máximo 6 dígitos/);
        expect(parseBoxNumber("0000001").error).toMatch(/no máximo 6 dígitos/);
    });
});

describe("ordem natural do número (RN-10, D18)", () => {
    it('"2" antes de "10", e no empate de valor o de menos dígitos primeiro', () => {
        const numbers = ["10", "2", "007", "7", "1", "100", "08", "000009"];

        expect([...numbers].sort(compareBoxNumbers)).toEqual(["1", "2", "7", "007", "08", "000009", "10", "100"]);
    });

    it("a chave tem tamanho fixo, então a ordem de texto simples é a natural", () => {
        expect(boxNumberSortKey("7")).toBe("0000071");
        expect(boxNumberSortKey("007")).toBe("0000073");
        expect(boxNumberSortKey("123456")).toBe("1234566");
        expect(compareBoxNumbers("12", "12")).toBe(0);
    });
});

describe("parseBoxNumberList", () => {
    it('expande "3, 12, 27-30" na ordem digitada', () => {
        expect(parseBoxNumberList("3, 12, 27-30")).toEqual({
            numbers: ["3", "12", "27", "28", "29", "30"],
        });
    });

    it("aceita espaço, ponto e vírgula, quebra de linha e travessão", () => {
        expect(parseBoxNumberList("1 2;3\n4").numbers).toEqual(["1", "2", "3", "4"]);
        expect(parseBoxNumberList("27 - 29").numbers).toEqual(["27", "28", "29"]);
        expect(parseBoxNumberList("8–10").numbers).toEqual(["8", "9", "10"]);
    });

    it("intervalo com zero à esquerda mantém a largura das pontas (D18)", () => {
        expect(parseBoxNumberList("07-09").numbers).toEqual(["07", "08", "09"]);
        expect(parseBoxNumberList("08-11").numbers).toEqual(["08", "09", "10", "11"]);
        expect(parseBoxNumberList("098-102").numbers).toEqual(["098", "099", "100", "101", "102"]);
        expect(parseBoxNumberList("8-12").numbers).toEqual(["8", "9", "10", "11", "12"]);
        expect(parseBoxNumberList("007, 7").numbers).toEqual(["007", "7"]);
    });

    it("mantém as repetições, que o lote aponta item a item", () => {
        expect(parseBoxNumberList("5, 5, 4-6").numbers).toEqual(["5", "5", "4", "5", "6"]);
    });

    it.each([
        ["", /pelo menos um número/],
        [" , ; ", /pelo menos um número/],
        ["abc", /"abc" não é um número nem um intervalo/],
        ["12-", /não é um número nem um intervalo/],
        ["1-2-3", /não é um número nem um intervalo/],
        ["30-27", /invertido/],
        ["0-3", /maior que zero/],
        ["1-1234567", /no máximo 6 dígitos/],
        ["7-010", /mesma quantidade de dígitos nas duas pontas/],
        ["07-100", /mesma quantidade de dígitos nas duas pontas/],
    ])("recusa %j", (text, message) => {
        expect(parseBoxNumberList(text).error).toMatch(message);
    });

    it(`limita o lote a ${BOX_BATCH_MAX_ITEMS} números sem expandir intervalos enormes`, () => {
        expect(parseBoxNumberList(`1-${BOX_BATCH_MAX_ITEMS}`).numbers).toHaveLength(
            BOX_BATCH_MAX_ITEMS
        );
        expect(parseBoxNumberList(`1-${BOX_BATCH_MAX_ITEMS}, 999`).error).toMatch(/no máximo 500/);
        expect(parseBoxNumberList("1-999999").error).toMatch(/no máximo 500/);
    });

    it("corta itens longos na mensagem de erro", () => {
        const error = parseBoxNumberList(`x${"9".repeat(100)}`).error;
        expect(error).toContain("…");
        expect(error.length).toBeLessThan(120);
    });
});
