import { AsyncLocalStorage } from "node:async_hooks";
import { clock } from "../utils/clock.js";

/**
 * O relógio das regras de negócio, por requisição: o E2E simula a meia-noite e
 * o fim da janela do desfazer sem mexer no Date do processo, e um teste não
 * atrapalha o outro. Só o start:e2e importa este arquivo.
 */
const scope = new AsyncLocalStorage();
const realNow = clock.now;

clock.now = function now() {
    const instant = scope.getStore();
    return instant ? new Date(instant) : realNow();
};

export function applyClockAt(instant, work) {
    return scope.run(new Date(instant).getTime(), work);
}
