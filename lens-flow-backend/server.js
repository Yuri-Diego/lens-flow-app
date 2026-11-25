import "dotenv/config";
import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config/env.js";
import { connectDB, ensureIndexes, supportsTransactions } from "./db/database.js";
import { rebuildAllClientNames } from "./services/clientService.js";
import { migrateOrderServices } from "./services/orderServiceMigration.js";

async function main() {
    const config = loadConfig();

    try {
        await connectDB(config);
        await ensureIndexes();
        // A OS normalizada (D26) dos serviços de uma versão anterior da API:
        // sem ela, a busca e o aviso de OS repetida não os achariam.
        await migrateOrderServices();
    } catch (error) {
        throw new Error(`Não foi possível preparar o banco de dados: ${error.message}`, {
            cause: error,
        });
    }

    if (await supportsTransactions()) {
        // O resumo dos nomes de cliente (sugestões, D24) é refeito a partir dos
        // serviços: preenche um banco que já tinha serviços e corrige qualquer
        // diferença antes de a API começar a responder.
        await rebuildAllClientNames();
    } else {
        const message =
            "O MongoDB não está em replica set, então não há transações: cadastros e alterações vão falhar (T6). Veja o README.";
        if (config.isProduction) {
            throw new Error(message);
        }
        console.warn(`Aviso: ${message}`);
    }

    const app = createApp(config);
    app.listen(config.port, (error) => {
        if (error) {
            console.error(`Falha ao abrir a porta ${config.port}: ${error.message}`);
            process.exit(1);
        }
        console.log(`API do Lens Flow rodando na porta ${config.port}`);
    });
}

main().catch((error) => {
    console.error(error instanceof ConfigError ? error.message : `Falha ao subir a API: ${error.message}`);
    process.exit(1);
});
