/**
 * Regras do serviço (Movement) que não dependem do banco: níveis de atraso
 * (D15), janela do desfazer (RN-11), permissões de correção e troca de caixa
 * (D19).
 */

/** Ações do lote (D6): "Saiu e liberar" é a ação principal da Conferência. */
export const BATCH_ACTIONS = Object.freeze(["checkout", "release-box", "checkout-and-release"]);

/** O que se desfaz: a baixa ou a liberação (RN-11). */
export const UNDO_ACTIONS = Object.freeze(["checkout", "release-box"]);

/** Ordenações da lista de serviços (RN-10). */
export const MOVEMENT_SORTS = Object.freeze(["priority", "box", "recent", "oldest"]);

/** O operador desfaz a própria baixa ou liberação em até 10 minutos (RN-11). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export const BATCH_MAX_ITEMS = 100;

/**
 * Níveis de atraso (D15), do mais leve ao mais grave. Hoje é neutro, ontem é
 * normal, com 2 dias pede atenção e com 3 ou mais está atrasado. A caixa
 * vermelha (urgente) sobe um nível: lançada hoje, ela já é normal.
 */
export const DELAY_LEVELS = Object.freeze(["neutral", "normal", "attention", "late"]);

export function delayLevelFor(daysOpen, urgent) {
    const level = Math.max(0, daysOpen) + (urgent ? 1 : 0);
    return DELAY_LEVELS[Math.min(level, DELAY_LEVELS.length - 1)];
}

/** A última ação que pode ser desfeita: a liberação, se houve; senão a baixa. */
export function lastUndoableAction(movement) {
    if (movement.boxReleasedAt) {
        return { action: "release-box", actor: movement.boxReleasedBy, at: movement.boxReleasedAt };
    }
    if (movement.status === "out") {
        return { action: "checkout", actor: movement.outBy, at: movement.outAt };
    }
    return null;
}

export function undoDeadline(at) {
    return new Date(new Date(at).getTime() + UNDO_WINDOW_MS);
}

/**
 * Quem pode desfazer uma ação (RN-11): o admin, sempre; o operador, só a
 * própria ação e em até 10 minutos. Devolve o motivo da recusa, ou null.
 */
export function undoRefusal(viewer, actor, at, now) {
    if (viewer.role === "admin") {
        return null;
    }
    if (String(actor) !== viewer.userId) {
        return "Você só pode desfazer as suas próprias ações.";
    }
    if (now.getTime() > undoDeadline(at).getTime()) {
        return "O prazo de 10 minutos para desfazer já passou.";
    }
    return null;
}

/**
 * Quem pode editar ou excluir um lançamento (RN-11): o admin, sempre; o
 * operador, só o próprio lançamento e no mesmo dia.
 */
export function canEditMovement(viewer, movement, today) {
    if (viewer.role === "admin") {
        return true;
    }
    return String(movement.createdBy) === viewer.userId && movement.sheetDate === today;
}

/**
 * Quando a caixa de um serviço pode ser trocada (RN-12, D19): enquanto ele
 * estiver aberto, por qualquer pessoa logada da empresa (admin ou operador),
 * em qualquer dia e de qualquer autor. Depois da baixa, ninguém troca: a caixa
 * só espera ser liberada. A empresa já vem garantida pela consulta, que
 * responde 404 para serviço de outra empresa.
 */
export function canChangeMovementBox(movement) {
    return movement.status === "open";
}
