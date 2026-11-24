/**
 * O relógio das regras de negócio: o dia da folha, a hora das ações, a janela
 * do desfazer e os dias em aberto saem daqui.
 *
 * Os testes simulam horários trocando `clock.now` (vi.spyOn), em vez de falsear
 * o Date global: o Mongoose usa o Date.now() para saber se a conexão está viva
 * (heartbeat), e um Date adiantado em dias derrubaria a conexão no meio do teste.
 */
export const clock = {
    now() {
        return new Date();
    },
};
