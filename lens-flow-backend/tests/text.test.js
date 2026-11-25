import { describe, expect, it } from "vitest";
import { escapeRegex, normalizeOrderService } from "../domain/text.js";

describe("normalizeOrderService: a regra de comparação da OS (D26)", () => {
    it.each([
        ["A-77", "a-77"],
        ["a-77", "a-77"],
        ["4521", "4521"],
        ["  OS  12B ", "os  12b"],
        ["É-10", "é-10"],
        ["ÇÃO", "ção"],
        ["Nº 5", "nº 5"],
    ])("%j vira %j", (orderService, expected) => {
        expect(normalizeOrderService(orderService)).toBe(expected);
    });

    it.each([[undefined], [null], [""], ["   "]])("%j é não ter OS", (orderService) => {
        expect(normalizeOrderService(orderService)).toBeNull();
    });

    it("não depende do idioma da máquina", () => {
        // Num servidor em turco, toLocaleLowerCase levaria "I" a um "i" sem ponto.
        expect("OS-I1".toLocaleLowerCase("tr")).not.toBe("os-i1");
        expect(normalizeOrderService("OS-I1")).toBe("os-i1");
    });
});

describe("escapeRegex", () => {
    it.each(["a.b", "(a)[b]{c}", "a+b*c?", "^a$", "a|b", "a\\d", "a-b/c #&%", "a\u0000b"])(
        "%j só casa com o próprio texto",
        (text) => {
            const pattern = new RegExp(`^${escapeRegex(text)}$`);

            expect(pattern.test(text)).toBe(true);
            expect(pattern.test("axb")).toBe(false);
        }
    );

    it("não deixa passar um NUL cru, que o MongoDB recusa", () => {
        expect(escapeRegex("a\u0000b")).toBe("a\\x00b");
    });
});
