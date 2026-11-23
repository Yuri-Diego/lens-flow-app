import * as z from "zod";

// Mensagens padrão do zod em pt-BR. Os campos da API têm mensagens próprias;
// estas só aparecem em casos que escaparem delas.
z.config(z.locales.ptBR());

export { z };
