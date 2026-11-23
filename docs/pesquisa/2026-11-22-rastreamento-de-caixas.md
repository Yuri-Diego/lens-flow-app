# F0 · Pesquisa do ramo: rastreamento de serviços em caixas (bandejas)

- Data: 2026-11-22
- Autor: pesquisador-sistemas (fase F0, onda 0)
- Serve a: G0 (decisões D1 a D14), F2, F3, F5 e, mais tarde, a revisão de UX da F8a
- Base: `docs/produto/ESPECIFICACAO.md` v0.1 e o código atual do web (`BoxCard.tsx`, `MovementList.tsx`)
- Não alterei código do app. Este arquivo é a única coisa criada.

## Como ler este documento

Cada afirmação leva uma marca:

| Marca | Significado |
|---|---|
| [F] | Fato: abri a fonte citada e li o trecho |
| [F*] | Fato parcial: vi só em trecho de resultado de busca, ou a página abriu truncada. É provável, não confirmado |
| [I] | Inferência minha (raciocínio, conta ou analogia). Não é evidência |
| [Q] | Pergunta para o Yuri (lista na seção 8) |

`[S12]` remete à lista numerada de fontes da seção 9, com a URL completa.

**Limites desta pesquisa (leia antes de confiar):**

1. As páginas de fornecedores são material comercial: dizem o que o produto promete, não o que ele entrega. Não testei nenhum produto.
2. A documentação do Rx-Universe (Confluence) não abriu pelo WebFetch. Usei trechos de resultados de busca, sempre marcados [F*].
3. Os PDFs acadêmicos brasileiros sobre laboratório de surfaçagem (UFCG, USP, IFRS) vieram comprimidos e não consegui lê-los. **Não há dado brasileiro de volume, retrabalho ou fluxo interno nesta pesquisa.**
4. Não achei fonte sobre: cor padrão de bandeja (nem em português), volume de laboratório pequeno no Brasil, e o "mínimo" de status que um laboratório pequeno realmente usa. Digo isso onde pesa.
5. O tamanho de alvo de toque para luvas vem de blog de fabricante de display (baixa confiabilidade).

---

## 1. Resumo executivo

1. O modelo do Lens Flow (uma bandeja por serviço, saída marcada à mão, bandeja livre depois) segue o mesmo princípio dos sistemas do ramo; eles atualizam o status por leitura de código de barras em 8 a 11 estações, e o Lens Flow troca a folha de papel por dois checks, que é um mínimo coerente (D7).
2. Não existe cor de bandeja padrão: cada laboratório cria a sua, e a cor costuma codificar o roteiro ou a prioridade (um laboratório americano usa verde = urgente, preto = antirreflexo, vermelho = revestimento no verso). D3 é plausível, mas só o Yuri sabe por que há duas cores por categoria.
3. Os erros do ramo (bandeja trocada, duplicidade, serviço esquecido) são tratados com leitura de código, validação e listas de atrasados; sem leitor, o Lens Flow precisa mostrar todas as caixas de mesmo número (inclusive ocupadas), avisar OS repetida e destacar atraso em níveis.
4. Para o G0: confirmar D3 [Q1]; ajustar a interface de D4 (o modelo de dados não muda); dar ênfase ao atalho "baixa + liberar" em D6; definir limiares de atraso em D8 (nova decisão D15); e prever desfazer em lote em D9. Nada disso muda o modelo da F2.
5. Volume: 10 a 30 serviços/dia em oficinas internas de acabamento, 80 a 100/dia num laboratório de rede com surfaçagem, centenas a milhares/dia em atacadistas. O padrão de 60/dia do `seed:demo` serve para pequeno e médio, mas teste também 150/dia e uma Conferência com 300 pendentes.

---

## 2. Sistemas e fontes analisados

### 2.1 Sistemas de gestão de laboratório (LMS) internacionais

| Nome | Público | O que importa para o Lens Flow | Fonte |
|---|---|---|---|
| **Ocuco Innovations / InnovaWeb** | Laboratórios de surfaçagem e acabamento, grandes e médios | [F] A leitura de código valida job x lente x armação x estação e sinaliza divergência na hora. O Workflow Monitor sinaliza job parado demais numa estação; há alertas e o gerente ajusta prioridade à distância. O InnovaWeb roda no navegador, com painéis de vazão, itens em staging e idade das ordens, e cada métrica abre uma lista filtrada. Um artigo conta que a bola de tênis na bandeja era o sinal de prioridade (impedia empilhar outra bandeja por cima) e que o software substitui isso. Não mencionam cor de bandeja nem uso em celular | [S1] [S2] [S3] [S4] |
| **Rx-Universe / Rx-Tracker** (Optifacts) | LMS dos EUA | [F] Tela de scanner de estação: o operador lê o código da estação e depois os jobs; a tela mostra última leitura, mensagem do sistema, sucesso ou falha e contadores da sessão. [F*] Número de bandeja numérico (até 5 dígitos), opcional e único entre pedidos ativos; a bandeja é atribuída ao job por leitura ("Tray Marry"), com mensagem diferente se o job já tem bandeja. [F*] "Late Job List" lista pedidos vencidos com cor por dias de atraso e a última estação lida | [S7] [S8] |
| **iCare Labs** (tela de status do job) | Laboratório atacadista dos EUA, para óticas clientes | [F] 11 estações: Order Entry, Lens Department, Surface Blocking, Surface, Backside Hard Coat, QA, AR Coating, QA, Frame Department, QA final, Jobs Completed. "Hold" é ação, não status. Job reprovado no QA volta ao processo com prioridade. Envio após 16h30 (ET) sai no dia útil seguinte. Armação pendente ("frame to come") deixa o job esperando | [S5] |
| **Optivision** (página antiga, sem data) | LMS | [F] Na sala de estoque o auxiliar lê o código da bandeja e depois as lentes direita e esquerda. O sistema confere estilo, material, índice, diâmetro, curva base, esfera/cilindro e lado; se há erro, imprime a lista; um erro pode ser liberado à mão por quem tem autoridade. Acompanhar o pedido pelo laboratório exige hardware adicional | [S6] |
| **Essilor, pedido de patente US 2015/0227877** ("Hot Jobs") | LMS Essilor (pedido abandonado) | [F] Lista de jobs importantes montada pelo usuário. Cor: verde (prazo ok), amarelo (24 h ou menos para o prazo), vermelho (prazo vencido). Cada item mostra o número da bandeja, que diz onde estão as peças | [S9] |
| **DVI e OptoTech Lab IQ** (Vision Monday 2018 e 2020) | LMS e fabricante de máquinas | [F] A DVI expõe status (quebras, atrasos, previsão de entrega) à equipe do laboratório e à ótica. O Lab IQ acompanha cada job e permite achar rápido uma bandeja para acelerar um pedido. São declarações dos próprios fornecedores | [S10] [S11] |

### 2.2 Sistemas brasileiros

| Nome | Público | O que importa para o Lens Flow | Fonte |
|---|---|---|---|
| **PWI VolpeLab + Web Pedidos** | Laboratórios ópticos | [F] Módulo de laboratório com pedidos em produção, status, prazos, operadores e perdas; gestão por etapa e setor. Portal opcional em que a ótica envia o pedido (o sistema avisa inconsistência antes do envio) e acompanha a etapa (exemplos dados: surfaçagem, tratamento, montagem, expedição), "evitando ligar para o laboratório". App SmartLab para gestores. A página não descreve código de barras na produção | [S12] [S13] |
| **TRION SAO ERP** | Laboratórios ópticos | [F] Status de produção em tempo real e tempo médio entre processos. Controles de surfaçagem, antirrisco, antirreflexo, coloração, gravação, montagem, laudos e corte remoto; quadro de produção; Pedidos Web. Código de barras só aparece como item de cadastro | [S14] |
| **Desempenho (SavWin One, SiaWin Revolution)** | Óticas e laboratórios de surfaçagem | [F] OS nasce da venda. Rastreamento do serviço no laboratório, com etapas de exemplo Venda, Laboratório, Montagem, Pronto, Entregue e previsão de entrega; aviso opcional por WhatsApp. O SiaWin para surfaçagem trata de pedidos, estoque e faturamento. Código de barras só no estoque | [S15] |
| **Presence** | Óticas | [F] Status por etapa da produção refletido para o cliente; aviso automático de lente pronta (WhatsApp e e-mail); controle de fila, prazo e devolução do laboratório. A página não lista os rótulos de status | [S16] |
| **Alterdata Shop (módulo Ótica)** | Óticas | [F] OS com fases (workflow); campos de ótica (laboratório, número do pedido do laboratório, grau, medidas); filtros por previsão e por entrega efetiva. O envio ao laboratório é por relatório impresso e o número do pedido do laboratório é digitado à mão. [F*] Alterações em lente e medidas ficam na auditoria | [S17] |
| **OticaHub Lab** (GitHub) | Projeto de portfólio, laboratório de montagem | [F] 5 etapas de bancada, status (entrada, aguardando lentes, aguardando montagem, em correção, pronta, entregue), Kanban por prazo com limite de OS por coluna, previsão de atraso, e regras que impedem "pronta" sem as etapas. O próprio texto diz que é código de portfólio e as capturas usam dados simulados, então o uso real não está comprovado | [S18] |

### 2.3 Prática de chão de fábrica e fontes de apoio

| Fonte | O que mostra | Fonte |
|---|---|---|
| **Precision Optical Group (POG)**, Vision Monday, 2021-08-02 | [F] Código de cores de um laboratório: vermelho = revestimento no verso; rosa = progressivo com gravação a laser; preto = antirreflexo; verde = prioridade (rush); papel dourado = garantia de um dia; **bandeja vermelha = pedido de quebra**. Os técnicos leem as cores na bandeja ao longo da linha. O ticket traz também código de barras | [S19] |
| **Amcon Labs** (bandejas) | [F] Bandejas em várias cores, com divisor removível, porta-etiqueta e tags reutilizáveis. A página não atribui significado a nenhuma cor | [S20] |
| **Harvey & Lewis** (Eyecare Business, maio de 2021) | [F] Laboratório de rede de óticas com 80 a 100 jobs/dia. De manhã, os pedidos do dia anterior são casados com as bandejas. Prazo padrão de 2 a 3 dias; urgentes são priorizados de manhã; pedido especial tem corte às 15h30 | [S21] |
| **"Processing Primer"** (Eyecare Business, 2010) | [F] Etapas do processamento e a leitura do código na bandeja ao fim, que fatura e envia o trabalho | [S22] |
| Fornecedores de bandejas odontológicas | [F*] Sugerem cor por dia da semana ou por direção (entrada e saída). Analogia de outro ramo, peso baixo | [S23] |

### 2.4 Citados, mas não verificados (não usei como evidência)

- **Labstock / DiopLab**: a URL só mostra tela de login; não consegui ver as funcionalidades.
- **Optivo, RX-Solutions, Veevo, LabWare Optical**: só aparecem em rankings sem metodologia ou em resumo de busca que não consegui confirmar na página do produto.
- **Eyefinity (Lab OMICS)**: não achei documentação de tela ou de status.
- **SisOp Pedidos+**: sem evidência de relação com óptica.

---

## 3. Logística do ramo e onde o Lens Flow se encaixa

### 3.1 Fluxo real de um job de lente surfaçada

[F, S5 S21 S22] Entrada do pedido; staging (separar bloco e lente, casar armação, imprimir etiqueta); bloqueio; geração, fining e polimento; desbloqueio e limpeza; hard coat traseiro, quando pedido; QA; antirreflexo; QA; armação, traçado, edging e montagem; QA final; expedição. O iCare modela isso em 11 estações. O laboratório de rede tem seis pessoas distribuídas em staging, surfaçagem, acabamento, AR e inspeção final.

| Etapa no ramo | Como o status é atualizado | No Lens Flow |
|---|---|---|
| Recebimento e staging (casar armação e bandeja) | De manhã, os pedidos do dia anterior são casados com as bandejas [F, S21]. A leitura do código atribui a bandeja ao job [F*, S8]. Job com armação pendente fica esperando [F, S5] | **Lançar serviço** na caixa, na folha do dia |
| Surfaçagem, tratamento, montagem, QA | Leitura de código em cada estação [F, S1 S7] | Fora do MVP (D7) |
| Expedição | A leitura da bandeja no fim fatura e envia [F, S22]; o job vai para "Jobs Completed" [F, S5]; existe horário de corte [F, S5 S21] | **Baixa ("Saiu")**, feita no dia seguinte, em lote |
| Bandeja volta ao início | Número de bandeja único entre pedidos ativos [F*, S8], logo reutilizável depois de concluir | **Liberar caixa** |

### 3.2 Respostas às cinco perguntas da F0

**P1. Como o ramo rastreia serviços em bandejas? Há convenção de cor?**

Fatos:
- A bandeja é a unidade física do job. O número dela diz onde estão as peças [F, S9]; o LMS associa bandeja a job por leitura [F*, S8] e lê a bandeja no fim para faturar e enviar [F, S22].
- **Não achei padrão de cor de bandeja.** A Amcon vende bandejas coloridas sem atribuir significado [F, S20]. A Ocuco só descreve sinais físicos sem cor (bola de tênis, clipes, etiquetas), que o software substitui [F, S2]. Em português não achei nenhuma fonte sobre cor de bandeja.
- Cada laboratório cria a sua convenção, e ela costuma carregar o roteiro: no POG, a cor diz que processo o pedido precisa (AR, revestimento, gravação), e há cores para prioridade, garantia e quebra [F, S19].
- Sinal manual é opaco: a Ocuco diz que a maioria dos operadores não sabia por que a bandeja da bola de tênis era prioritária [F, S2].

Inferências:
- [I] "Cor = roteiro ou prioridade" é o padrão local mais comum, e o esquema do Lens Flow (vermelha urgente, azul tratamento, verde/amarela montagem) segue essa lógica.
- [I] O que o Lens Flow tem de diferente: **uma única categoria por cor**. Um job real combina atributos (urgente e com tratamento). O POG resolve combinando cor de bandeja e cor de ticket. No Lens Flow, quando a caixa é vermelha, a informação "com tratamento" some, a menos que vá na observação [Q2].
- [I] Cor sozinha não identifica nada com luz ruim ou para daltônico; a especificação já exige número, rótulo e ícone (WCAG 1.4.1 [F, S42]).

**P2. Que etapas e status os sistemas usam? Qual o mínimo de um laboratório pequeno?**

Fatos:
- LMS internacionais: de 8 a 11 estações por leitura (iCare: 11 [S5]); a Ocuco e o Rx-Universe dependem de leitor em cada estação [S1 S7].
- Sistemas brasileiros expõem poucos status "grossos" ao cliente: Venda, Laboratório, Montagem, Pronto, Entregue [S15]; surfaçagem, tratamento, montagem, expedição como exemplos [S13]; o TRION lista controles por etapa (surfaçagem, antirrisco, antirreflexo, coloração, gravação, montagem) [S14]. O projeto OticaHub usa 5 etapas de bancada [S18].
- **Não achei fonte que diga qual é o mínimo que um laboratório pequeno usa.**

Inferências:
- [I] O mínimo de quem substitui o papel é o que o papel já fazia: aberto, saiu, caixa livre. Etapas só valem se alguém registrar em cada estação; esse custo de adoção (leitor e disciplina) é o que os LMS pagam e o MVP evita.
- [I] A cor da caixa já funciona como roteiro: verde e amarela passam pela montagem, azul pelo tratamento. Quando as etapas vierem, dá para derivar o checklist da categoria.

**P3. Saída, reutilização da bandeja e erros comuns**

Fatos:
- Saída: o job passa pela inspeção final e vai para "Jobs Completed" [S5]; a leitura final da bandeja fatura e envia [S22]; há horário de corte para sair no mesmo dia (16h30 ET no iCare, 15h30 em pedidos especiais da rede) [S5 S21].
- Reuso: o número da bandeja é único entre pedidos ativos [F*, S8] e a lista de "Hot Jobs" mostra a bandeja para localizar as peças [S9]. No laboratório de rede, as bandejas são casadas com os pedidos pela manhã [S21].
- **Bandeja ou lente trocada:** a leitura de bandeja e lentes valida e sinaliza divergência na hora [S1 S6]; em caso de erro o sistema lista os problemas e só quem tem autoridade libera [S6]; o scanner do Rx-Universe mostra mensagem e contagem de falhas por leitura [S7].
- **Duplicidade:** o Rx-Universe avisa de forma diferente quando o job já tem bandeja [F*, S8], e a documentação alerta que PO repetido pode fazer um dispositivo anexar o traçado da armação ao pedido errado [F*, S8].
- **Serviço esquecido ou parado:** o Workflow Monitor sinaliza job parado demais na estação [S1]; a Late Job List mostra a última estação lida e o horário [F*, S8]; o TRION calcula o tempo médio por etapa [S14]; o OticaHub tem previsão de atraso e limite de OS por coluna [S18]; o Lab IQ localiza a bandeja para acelerar [S11].
- Job esperando componente é causa clássica de bandeja parada: "frame to come" [S5] e "staging" [S4 S11].
- Retrabalho: job que reprova no QA volta com prioridade [S5]. Óticas reportam cerca de 12% de garantias e remakes somados (2012, taxa de ótica, não de laboratório) [S29].

Inferências:
- [I] Sem leitor de código, o risco de bandeja trocada passa da leitura para a **digitação do número e da cor**. A defesa do Lens Flow tem de ser visual: mostrar todas as caixas de mesmo número e deixar óbvio qual foi escolhida (R1).
- [I] O que o ramo chama de "última estação lida e hora" o Lens Flow já tem de graça (lançado por, quando) mais "dias em aberto".
- [I] Os sistemas de leitura tratam saída e bandeja como um evento só. A separação em dois checks (D6) vem do papel e reflete dois estados físicos reais (o serviço saiu; a caixa voltou). Ela vira vantagem se houver a lista "saiu, caixa não liberada" (R15).

**P4. Boas práticas de entrada rápida e conferência em lote no celular**

Fatos:
- Campo numérico: usar `inputmode="numeric"` e não `type="number"` [F, S30]; `enterkeyhint` muda o rótulo da tecla Enter e é suportado amplamente [F, S31 S32].
- iOS: relatos de desenvolvedores dizem que `focus()` por código só abre o teclado dentro de um gesto do usuário, e que costuma falhar depois de `setTimeout` ou `requestAnimationFrame` [F*, S46]. Campos com fonte abaixo de 16 px fazem o Safari dar zoom ao focar [F*, S47]. Não achei documento oficial da Apple para nenhum dos dois.
- Erro: mensagem específica, junto do campo, sem validar enquanto a pessoa ainda digita [F, S33]; o GOV.UK desaconselha `maxlength` porque corta sem avisar [F, S30].
- Desfazer em vez de confirmar: confirmações do tipo "tem certeza?" viram hábito e não evitam o erro [F, S38]; "controle e liberdade" e "prevenção de erro" são heurísticas básicas [F, S39].
- Ações em lote: oferecer selecionar todos, barra de ações contextual e feedback com desfazer [F, S35]. A barra aparece depois da seleção, e as ações individuais das linhas ficam desabilitadas no modo lote [F, S36]. Em telas pequenas a barra fica na base [F*, S37].
- Snackbar com ação: no Material 3, fica até a pessoa agir ou dispensar; snackbar que some sozinho é inacessível para quem precisa de mais tempo, então na web convém ter também feedback junto ao controle [F*, S40]. O debate sobre WCAG 2.2.1 e toasts não está resolvido [F*, S43].
- Alvo de toque: o WCAG 2.5.8 exige no mínimo 24 x 24 px (AA) e cita 44 px como o critério mais estrito para controles importantes [F, S41]; o NN/g pede pelo menos 1 cm x 1 cm físico e mais para ação principal [F, S34]. Para mão enluvada, blogs de fabricantes falam em 15 a 25 mm [F*, S50] (baixa confiabilidade).
- Cor nunca é a única informação (WCAG 1.4.1) [F, S42].
- Reenvio seguro: o padrão do mercado é chave de idempotência gerada no cliente (Stripe) [F, S48].
- Digitação em celular: média de 36,2 palavras por minuto, com 2,3% de erros não corrigidos, em 37 mil voluntários [F, S44].
- Leitura de código no navegador: a Barcode Detection API é experimental e sem disponibilidade ampla; exige HTTPS e biblioteca de apoio nos navegadores sem suporte [F, S45]. A compatibilidade por navegador deve ser conferida antes de depender dela.
- Cookies: o Safari bloqueia por padrão cookies de terceiros desde o iOS 13.4, o que justifica site e API no mesmo site (T3) [F, S49].

Inferências:
- [I] **A meta de 15 s é apertada.** Conta com 36 palavras/min (cerca de 3 caracteres/s): cliente de 15 letras leva cerca de 5 s; caixa de 2 dígitos mais o toque na caixa, cerca de 2 s; OS de 5 dígitos, cerca de 2 s; três trocas de campo e o toque em salvar, cerca de 3 s. Soma de 12 a 13 s **sem errar** e sem a observação. Só fica folgada se a digitação do cliente cair (sugestões, R12) e se não houver troca de teclado a mais.
- [I] 1 cm equivale a cerca de 60 px CSS em celular comum. Por isso proponho 56 px nas linhas e botões principais da Conferência, acima dos 44 px da especificação.
- [I] O retorno de uma chamada de rede provavelmente se comporta como o `setTimeout` quanto ao foco no iOS. A validar em aparelho real.

**P5. Volume típico por dia**

Fatos:
- Oficinas internas de acabamento: 10 a 12 jobs/dia já é viável; um consultório movimentado faz 20 a 30/dia. Atenção: são laboratórios só de acabamento (edging), sem surfaçagem [F, S24; página sem data].
- Laboratório de rede de óticas com surfaçagem própria: 80 a 100 jobs/dia, seis pessoas nas estações [F, S21].
- Atacadista de surfaçagem digital: perto de 900 jobs/dia, com entrega no dia seguinte para a maioria (2012) [F, S25].
- Lista Top Labs 2017 (atacadistas): de cerca de 675 a 19.500 jobs/dia [F*, S26]; laboratório principal de uma rede: cerca de 11 mil pares/dia [F, S27].
- Brasil: uma nova planta de lentes fala em 50 mil pares/mês de capacidade inicial, algo como 2 mil a 2,5 mil por dia útil (conta minha). É indústria, não laboratório pequeno [F, S28]. **Não achei dado de laboratório pequeno brasileiro.**

Inferências e calibragem dos testes de desempenho (F3, `seed:demo`):
- [I] A meta da especificação (cerca de 20 mil serviços/ano) equivale a 60/dia, que cai entre a oficina interna e o laboratório de rede.
- [I] Perfis sugeridos: **base** 60/dia (20 mil/ano); **alto** 150/dia (50 mil/ano); **estresse** 600/dia (200 mil/ano, perto do menor atacadista da lista de 2017, só para medir a folga).
- [I] O gargalo real não é o volume anual, e sim a **Conferência com acúmulo**: teste com 300 pendentes abertos e lote de 100 itens, além dos dois lançamentos simultâneos na mesma caixa que a F3 já prevê.
- [I] Num atacadista de surfaçagem digital, a maioria sai no dia seguinte [S25]; isso sustenta tratar "ontem" como normal e "2 dias" como atenção (D8).

### 3.3 Onde o Lens Flow se encaixa e onde diverge

| Aspecto | No ramo | No Lens Flow | Leitura |
|---|---|---|---|
| Identificação da bandeja | Leitura de código; validação na hora | Digitação de número + cor | Maior risco humano. Mitigar na interface (R1) |
| Status | 8 a 11 estações | aberto → saiu, mais caixa livre | Adequado ao MVP (D7) |
| Quem atualiza | O operador em cada estação, por leitura | Quem confere a prateleira no dia seguinte | Atualização em lote e com 1 dia de atraso: o desenho precisa ser ótimo para lote |
| Atraso | Contra data prometida; 3 níveis de cor | Dias em aberto | Falta definir limiar (D15) |
| Prioridade | Flag, lista de urgentes ou cor | Caixa vermelha | Coerente |
| Duplicidade | O sistema avisa ou recusa | Caixa protegida por transação; OS não | Falta aviso de OS repetida (R11) |
| Quem fez | Registro por estação e horário | Login individual e auditoria | Coerente, e é o diferencial do produto |
| Cliente final vê o status | Portais e WhatsApp (PWI, TRION, Presence, Desempenho) | Uso interno | Fora do MVP [Q13] |
| Integração com pedido | Padrão de dados da Vision Council (DCS) e portais [F*, S52] | OS digitada à mão | Fora do MVP. Manter `orderService` como texto livre |

---

## 4. Impacto nas decisões D1 a D14

Resumo:

| ID | Decisão | Veredito | Mudança sugerida |
|---|---|---|---|
| D1 | Plataforma: só o site | Concordo | Testar em iPhone real (foco e teclado). Se houver QR depois, usar link direto (R19) |
| D2 | Login individual | Concordo | Nenhuma |
| D3 | Branca = preta; verde = amarela | **Concordo, com uma pergunta que pode mudar a decisão** | Confirmar por que há duas cores por categoria [Q1] |
| D4 | Número único por cor | **Concordo no modelo, ajuste na interface** | Mostrar sempre as caixas homônimas (R1); esclarecer a contradição do texto [Q15] |
| D5 | Um serviço aberto por caixa | Concordo | Perguntar se dois pares do mesmo cliente dividem caixa [Q7] |
| D6 | Dois checks, com atalho | Concordo, com ênfase | "Saiu e liberar" como ação principal; lista "saiu, caixa não liberada" (R15) |
| D7 | Etapas fora do MVP | Concordo | Preparar o modelo sem implementar (R22) |
| D8 | Serviço que não sai no dia seguinte | **Concordo; falta definir o limiar** | Nova decisão D15 (limiares de atraso) |
| D9 | Correções (RN-11) | **Concordo, com ajuste** | Desfazer de lote e janela visível no detalhe (R7) |
| D10 | Várias empresas | Concordo | Nenhuma |
| D11 | Hospedagem | Sem pesquisa do ramo | Fato técnico confirma T3 (mesmo site) |
| D12 | Aparelho compartilhado | Concordo, com complemento | Identidade sempre visível e troca rápida (R16); avaliar bloqueio por inatividade [Q16] |
| D13 | Banco atual é de teste | Concordo | Nenhuma |
| D14 | Campos do serviço | Concordo, com complemento | Aviso de OS repetida (R11); definir "cliente" [Q3] |

### Comentários detalhados, D3 a D9

**D3. Branca = preta e verde = amarela.**
- Evidência: não existe padrão de cor no ramo [F, S20 S2]; cada laboratório define a sua, e a cor costuma carregar roteiro ou prioridade [F, S19]. Em outro ramo, as cores também separam dia ou direção do trabalho [F*, S23].
- Leitura: o desenho do Lens Flow é plausível. O risco é [I] **a segunda cor guardar um significado que o papel registrava e o sistema não** (turno, bancada, cliente, tipo de lente). Se existir, juntar as duas em uma categoria perde essa informação.
- Sugestão: manter a decisão, guardar a **chave da cor** na caixa (como a F2 já prevê) e mostrar o nome da cor. Perguntar ao Yuri o motivo das duas cores [Q1]. Há ainda o caso de combinação de atributos, em [Q2].
- Custo de errar: baixo se a chave da cor é guardada e a regra mora em um módulo só (`domain/boxColors.js`), porque mudar o mapeamento depois é trocar uma constante.

**D4. Número único por cor.**
- Evidência: o Rx-Universe usa um único espaço numérico de bandeja, único entre pedidos ativos [F*, S8]; no Lens Flow o mesmo número pode existir em até 6 cores. [I] Isso reflete a prateleira física, então o modelo está certo, mas multiplica o risco de escolher a caixa errada.
- Risco concreto [I]: a pessoa digita 12 com uma caixa vermelha de número 12 na mão; a vermelha 12 consta como ocupada (alguém esqueceu de liberar) e a única livre é a branca 12. Com a seleção automática, o serviço entra na branca 12, que não é a caixa física, e ninguém percebe. Isso é bandeja trocada sem aviso.
- Sugestão: mostrar sempre **todas** as caixas com aquele número, livres e ocupadas, com a seleção automática só quando houver exatamente uma livre e com as ocupadas visíveis ao lado (R1). Assim a caixa esquecida aparece no momento do lançamento. Opcional [Q6]: se for viável, renumerar fisicamente as caixas para números únicos, o que elimina a ambiguidade.
- O texto da especificação diz "se só uma bater" em D4 e "se só houver uma livre" na seção 6 [Q15].

**D5. Um serviço aberto por caixa.**
- Evidência: no ramo, uma bandeja é um job: o scanner lê a bandeja e depois as duas lentes do mesmo job [F, S6]; o número de bandeja é único entre pedidos ativos [F*, S8]; a bandeja diz onde estão as peças daquele job [F, S9].
- Leitura: concordo. Duas OS na mesma caixa misturariam histórico e baixa.
- Pergunta: duas OS do mesmo cliente (par de óculos) vão na mesma caixa hoje? [Q7].

**D6. Dois checks, com atalho para os dois juntos.**
- Evidência: nos sistemas com leitor, a leitura final da bandeja encerra o job e fatura em um só evento [F, S22]. Não achei fonte que separe "saiu" de "bandeja livre". [I] A separação vem do papel e representa dois estados físicos reais.
- Leitura: concordo, mas o caminho normal tem de ser **um toque** ("Saiu e liberar"). Os checks separados ficam para quando a caixa volta depois do serviço [Q8].
- Ganho extra [I]: a lista "saiu, caixa não liberada" mostra as caixas que não voltaram à prateleira, que é a forma natural de achar caixa perdida (R15).

**D7. Etapas intermediárias fora do MVP.**
- Evidência: LMS usam 8 a 11 estações com leitor [F, S5]; sistemas brasileiros mostram 3 a 5 status ao cliente [F, S13 S15]; o OticaHub usa 5 etapas de bancada [F, S18]. Não achei evidência do que um laboratório pequeno usa de fato.
- Leitura: concordo. Cada etapa extra exige alguém tocar a cada estação, que é justamente o que o papel não pedia.
- Preparar: manter `status` como enum extensível e o histórico por evento; quando as etapas vierem, derivar o roteiro da categoria (R22). Se a pergunta "onde está minha OS?" for frequente, considerar depois 2 ou 3 etapas grossas [Q13].

**D8. Serviço que não sai no dia seguinte.**
- Evidência: o Workflow Monitor sinaliza job parado [F, S1]; a Late Job List usa cor por dias de atraso [F*, S8]; a patente da Essilor usa verde, amarelo (24 h ou menos) e vermelho [F, S9]; o TRION mede tempo por etapa [F, S14].
- Leitura: concordo com "continua na Conferência com dias em aberto e destaque", e proponho **três níveis, sempre com texto e ícone** (R4). Falta o limiar [Q5].
- Sugestão de nova decisão **D15, limiares de atraso** [I, a confirmar]: lançado hoje = neutro; ontem = normal (é o dia de conferir); 2 dias = atenção; 3 ou mais = atrasado. Para vermelha (urgente), sobe um nível mais cedo (1 dia = atenção; 2 ou mais = atrasado). Os limiares ficam como constantes.

**D9. Correções conforme RN-11.**
- Evidência: o Optivision permite liberar um erro manualmente, mas só por quem tem autoridade [F, S6]; o Alterdata registra alterações em auditoria [F*, S17]. Para a interface, "desfazer" é melhor que "confirmar" [F, S38 S39], e as ações em lote pedem feedback com desfazer [F, S35].
- Leitura: concordo com a regra (própria, mesmo dia; desfazer em 10 min; admin corrige tudo). Faltam dois ajustes de interface: **desfazer o lote inteiro de uma vez** e **mostrar a janela de 10 min com contagem regressiva** no detalhe (R7).
- Pergunta: o admin está sempre presente para corrigir o que a janela de 10 min não cobre? [Q9]

### D1, D2, D10 a D14 (comentário curto)

- **D1.** Concordo. O InnovaWeb roda no navegador [S3]; um fornecedor brasileiro tem app para gestores [S12]. Leitura de código no navegador ainda é irregular (a Barcode Detection API é experimental [S45]), por isso o QR deve entrar como link aberto pela câmera nativa (R19). Teste de foco, teclado e zoom em iPhone real é obrigatório na F5 [S46 S47].
- **D2.** Concordo. É a base de "quem fez" (RN-02); sistemas brasileiros de ótica já registram alterações em auditoria [F*, S17].
- **D10.** Concordo. Sem evidência do ramo; é seguro barato manter `business` em tudo.
- **D11.** Fora do escopo desta pesquisa. Fato técnico: o Safari bloqueia cookies de terceiros por padrão [F, S49], o que confirma T3.
- **D12.** Concordo. Fontes de fornecedores recomendam identidade individual com troca rápida de usuário e PIN pessoal, e relatam que aparelho compartilhado quebra a atribuição de quem fez [F*, S51]. [I] Com sessão de 12 h num celular compartilhado, esquecer a sessão aberta registra as ações do colega no nome do anterior; mitigar com identidade sempre visível e, se o Yuri aceitar, bloqueio por inatividade [Q16] (isso mudaria RN-14).
- **D13.** Concordo. Sem pesquisa necessária.
- **D14.** Concordo. No ramo, a OS costuma ser a chave obrigatória e a bandeja, opcional [F*, S8]; no Lens Flow é o inverso. [I] Manter a OS opcional por velocidade, mas a busca e a detecção de duplicidade dependem dela: por isso o aviso de OS repetida (R11), teclado numérico se a OS for só dígitos [Q4] e definição de "cliente" [Q3].

---

## 5. Decisões de UX/UI recomendadas

Esforço: **P** até meio dia · **M** de 1 a 2 dias · **G** mais de 2 dias. Agente: `frontend-ux` ou `backend-api`.
Tudo abaixo é recomendação; nada altera regra de negócio sem decisão do Yuri.

### Prioridade alta

**R1. O número digitado mostra todas as caixas daquele número (livres e ocupadas) como chips grandes.**
- Problema: bandeja trocada sem aviso e caixa esquecida (ver D4).
- Detalhe: chip com amostra de cor, número, nome da cor e categoria; ocupada em cinza, com "ocupada por Fulano desde dd/mm"; seleção automática só se houver exatamente uma livre, e as ocupadas continuam visíveis; número exato primeiro, prefixo depois; ordem estável das cores. Se a pessoa notar que a caixa na mão aparece ocupada, ela descobre o esquecimento ali mesmo.
- Evidência: [F, S1 S6] sistemas com leitor validam a bandeja; [F*, S8] número único entre ativos; o resto é [I].
- Prioridade: alta · Esforço: P a M · Agente: `frontend-ux`. `backend-api`: confirmar que `GET /boxes?number=` devolve todas as cores, livres e ocupadas, com o resumo do serviço, em ordem estável.

**R2. Teclado, foco e campos no celular.**
- Problema: digitar rápido com uma mão, sem zoom nem teclado errado.
- Detalhe: caixa e OS com `inputmode="numeric"` (não `type="number"`); `enterkeyhint="next"`; fonte de 16 px ou mais nos campos; cliente com `autocapitalize="words"` e `spellcheck="false"`. **Não depender só do Enter:** no iPhone o teclado numérico pode não ter tecla Enter [I, a validar em aparelho real]; oferecer botão "Próximo" fixo acima do teclado e avançar o foco ao tocar num chip de caixa.
- Evidência: [F, S30 S31 S32]; [F*, S47] zoom do iOS.
- Prioridade: alta · Esforço: P · Agente: `frontend-ux`.

**R3. "Salvar e próximo" otimista, com foco devolvido no mesmo toque.**
- Problema: [I] no iOS, o teclado pode fechar se o foco for devolvido só depois da resposta da rede, e cada lançamento custaria um toque a mais.
- Detalhe: no próprio manipulador do toque, limpar o formulário, devolver o foco à caixa e enviar em segundo plano (UI otimista, T2). Se a API falhar (por exemplo `BOX_OCCUPIED`), toast que fica na tela com "Corrigir", que restaura os dados e explica o conflito com o nome do cliente da caixa. Para o foco inicial, abrir o formulário na mesma tela (painel), em vez de navegar para outra rota, para que o foco aconteça dentro do toque; se o teclado não abrir no iPhone, aceitar um toque extra.
- Evidência: [F*, S46] foco só dentro de gesto; T2 e "nada se perde" da especificação.
- Prioridade: alta · Esforço: M · Agente: `frontend-ux`.

**R4. Atraso em três níveis, sempre com texto e ícone, calculado com a data do servidor.**
- Problema: serviço esquecido na Conferência (D8).
- Detalhe: mostrar "aberto há N dias" como fato e uma etiqueta "Atenção" ou "Atrasado" (cor mais ícone mais texto). Limiares como constantes (proposta D15). O servidor devolve `daysOpen` e a data de hoje (RN-06), para não depender do relógio do aparelho.
- Evidência: [F, S9] verde/amarelo/vermelho com limiar de 24 h; [F*, S8] atraso por cor; [F, S1] alerta de job parado; [F, S42] cor não é única informação.
- Prioridade: alta · Esforço: P · Agente: `frontend-ux` e `backend-api` (campos `daysOpen` e `serverDate` nas listas).

**R5. Linha da Conferência com a ação principal em um toque e alvos grandes.**
- Problema: conferir dezenas de caixas na prateleira com pouca atenção e às vezes de luva.
- Detalhe: BoxChip grande à esquerda; cliente e OS; ação principal **"Saiu e liberar"** em um toque; os checks separados "Saiu" e "Caixa liberada" como secundários; "Liberar" desabilitado com o motivo escrito ("dê baixa primeiro"); alvos de 56 px ou mais, com espaço de 8 px entre eles; tocar no corpo da linha abre o detalhe, nunca marca.
- Evidência: [F, S41 S34] tamanho de alvo; [F, S22] o fim do processo é um evento só; 56 px é [I].
- Prioridade: alta · Esforço: M · Agente: `frontend-ux`.

**R6. Barra de seleção em lote fixa na base, com contagem, escopo e resultado item a item.**
- Problema: lote com erro parcial e risco de agir sobre mais itens do que a pessoa imagina.
- Detalhe: "Dar baixa e liberar (28 de 31 visíveis)", com "Selecionar todos os visíveis" respeitando o filtro ativo; ações por linha desabilitadas durante a seleção; espaço reservado no fim da lista; no fim, lista de sucessos e falhas com o motivo, mantendo os que falharam selecionados para nova tentativa. Sem diálogo "tem certeza?": o desfazer faz o papel (R7).
- Evidência: [F, S35 S36] padrão de lote; [F*, S37] barra na base em tela pequena; [F, S38] desfazer no lugar de confirmar.
- Prioridade: alta · Esforço: M · Agente: `frontend-ux`.

**R7. Desfazer em duas camadas, incluindo lote.**
- Problema: toque errado em lote; o toast some e a pessoa perde a chance.
- Detalhe: (1) toast com "Desfazer" que **fica até a pessoa agir ou dispensar**, ou por 10 s no mínimo; (2) no detalhe, o botão "Desfazer" com a **contagem regressiva** dos 10 min da RN-11, para quem perdeu o toast; (3) para lote, **um** "Desfazer lote". Backend: `POST /movements/batch` devolve um `batchId`, e um endpoint de desfazer lote (ou `ids` no `undo`) respeita, item a item, a janela de 10 min e a regra "caixa não reutilizada".
- Evidência: [F, S38 S39 S35]; [F*, S40] toast com ação persiste; [F*, S43] debate do WCAG 2.2.1.
- Prioridade: alta (interface) e média (endpoint de lote) · Esforço: M · Agente: `frontend-ux` e `backend-api`.

**R8. Alerta passivo de atrasados.**
- Problema: sem push (fora do MVP), ninguém vê o atraso se não abrir a Conferência.
- Detalhe: contador na aba "Conferência" da barra inferior, com ponto vermelho quando houver atrasados, e um contador "atrasados" na tela Hoje que leva à Conferência já filtrada.
- Evidência: [F, S1 S3] alertas e painéis em LMS; push está no backlog da especificação (seção 13).
- Prioridade: alta · Esforço: P · Agente: `frontend-ux` (`backend-api` só se faltar contador pronto em `GET /sheets`).

**R9. Buscar responde "onde está a OS ou a caixa?" sem abrir o detalhe.**
- Problema: o telefonema "cadê meu serviço?" é o gatilho clássico do rastreio [F, S4 S13].
- Detalhe: um campo só; se tiver só dígitos, buscar OS (exata e prefixo) e número de caixa; cliente por trecho sem acento. Cada resultado mostra caixa atual (chip), situação (aberto há N dias / saiu), quem lançou e quando.
- Evidência: [F, S4] bandejas paradas e clientes ligando; [F, S13] o portal existe para evitar ligações; [F, S11] achar a bandeja rápido. O desenho do resultado é [I].
- Prioridade: alta · Esforço: M · Agente: `frontend-ux`; `backend-api` confirma busca por OS exata ou prefixo e por número de caixa no mesmo endpoint.

**R10. Cor como amostra, com nome, categoria e ícone; hex tirado de foto das caixas.**
- Problema: cor sozinha falha com luz ruim e daltonismo; o `BoxCard` atual pinta o cartão inteiro e só troca a cor do texto para dois hex, o que não garante contraste nas seis cores.
- Detalhe: amostra pequena (borda na branca) sobre fundo neutro, mais "Azul · Com tratamento" em texto e um ícone distinto por categoria; hex definido a partir de fotos das caixas físicas (B14, pergunta 2 da seção 14 da especificação).
- Evidência: [F, S42]; [F, S19] a cor é a linguagem de um laboratório e tem de bater com a caixa real.
- Prioridade: alta · Esforço: P · Agente: `frontend-ux`.

### Prioridade média

**R11. Aviso de OS repetida, sem bloquear.**
- Problema: lançamento duplicado, já que a caixa é protegida mas a OS não.
- Detalhe: ao digitar a OS, avisar "OS 4521 já está na caixa 12 vermelha, aberta desde ontem", com a opção de continuar. Bloquear ou só avisar é decisão do Yuri [Q4] (proposta D16: só avisar).
- Evidência: [F*, S8] o Rx-Universe avisa quando o job já tem bandeja e alerta contra identificador repetido; o restante é [I].
- Prioridade: média · Esforço: M · Agente: `backend-api` (filtro por OS exata entre abertos, com o índice `{business, orderService}` da F3) e `frontend-ux` (o aviso).

**R12. Sugestões de cliente e "repetir o último cliente".**
- Problema: o nome do cliente é a maior parte da digitação (cerca de 5 s dos 12 a 13 s).
- Detalhe: sugerir nomes já usados (prefixo ou trecho sem acento, recentes primeiro) e um chip com o cliente do último lançamento. Vale **se o cliente for a ótica** (nome que se repete) e vale pouco se for o paciente [Q3]. Sem nova entidade: só nomes distintos dos últimos 90 dias.
- Evidência: [F*, S8 S13] os sistemas modelam contas de clientes (óticas); a conta de tempo é [I, S44].
- Prioridade: média, e alta se a resposta de [Q3] for "ótica" · Esforço: M · Agente: `backend-api` (endpoint de sugestões usando `clientNameNormalized`) e `frontend-ux`.

**R13. Idempotência no lançamento e no lote.**
- Problema: toque duplo ou rede lenta no 4G geram envio repetido, ou um falso `BOX_OCCUPIED` quando a primeira tentativa funcionou e a resposta se perdeu.
- Detalhe: `clientRequestId` (UUID gerado no cliente) opcional em `POST /movements` e `POST /movements/batch`; repetir a mesma chave devolve o resultado original. Índice único parcial por empresa.
- Evidência: [F, S48] é o padrão de mercado.
- Prioridade: média · Esforço: M · Agente: `backend-api` (índice e regra) e `frontend-ux` (gera o UUID por tentativa).

**R14. "Trocar caixa" a dois toques, a partir da Conferência e do detalhe.**
- Problema: a bandeja trocada é descoberta na prateleira, durante a conferência.
- Detalhe: ação no menu da linha, reaproveitando o seletor de caixas de R1 (RN-12).
- Evidência: [I]; os sistemas com leitor evitam a troca na origem [S1 S6].
- Prioridade: média · Esforço: P · Agente: `frontend-ux`.

**R15. Filtro "saiu, caixa não liberada".**
- Problema: com dois checks, caixas que saíram e não voltaram ficam invisíveis.
- Detalhe: filtro ou aba com os serviços com baixa e caixa ainda ocupada, com dias desde a baixa.
- Evidência: [I]; análogo à "última estação lida" do Rx-Universe [F*, S8].
- Prioridade: média · Esforço: P · Agente: `backend-api` (parâmetro de filtro nas listas) e `frontend-ux`.

**R16. Troca de usuário rápida em aparelho compartilhado.**
- Problema: quem fez cada ação é a promessa do produto, e o celular é compartilhado (D12).
- Detalhe: nome do usuário sempre visível; os toasts dizem "por Ana"; "Trocar usuário" abre o login com a lista dos últimos usuários **guardada só no aparelho** (sem endpoint) e foco na senha, e volta à mesma tela. Opcional: bloqueio por inatividade [Q16].
- Evidência: [F*, S51] troca rápida e PIN pessoal em aparelho compartilhado.
- Prioridade: média · Esforço: P a M · Agente: `frontend-ux`.

**R17. Rascunho do formulário preservado quando a sessão expira.**
- Problema: a sessão dura 12 h e pode vencer no meio de um lançamento.
- Detalhe: guardar o rascunho em memória ou `sessionStorage`, e restaurá-lo depois do novo login, na mesma rota.
- Evidência: [I]; a especificação exige que nada se perca em erro.
- Prioridade: média · Esforço: P · Agente: `frontend-ux`.

**R18. Perfis de carga e metas do `seed:demo`.**
- Problema: calibrar o p95 de 300 ms com volume realista.
- Detalhe: base 60/dia, alto 150/dia, estresse 600/dia, por 1 ano; Conferência com 300 pendentes; lote de 100 itens; registrar o p95 de cada lista.
- Evidência: seção 3.2, P5.
- Prioridade: média · Esforço: P · Agente: `backend-api`.

### Prioridade baixa (ou pós-MVP)

**R19. Link direto por caixa, para QR depois do MVP.**
- Problema: no ramo, identificar a bandeja por leitura é o caminho padrão [F, S1 S6 S22]; digitar é o ponto fraco do Lens Flow.
- Detalhe: **sem leitor embutido**: um QR impresso em cada caixa que abre `/caixas/:id` na câmera nativa do celular, mostrando o serviço aberto com "Saiu e liberar", ou "Novo serviço nesta caixa" se estiver livre. Evita a dependência da API experimental de leitura [S45]. Preparar agora o que é barato: `GET /boxes/:id` e a rota `/caixas/:id`. A etiqueta e a impressão ficam para depois [Q14].
- Prioridade: baixa agora (média depois) · Esforço: P (a preparação) · Agente: `backend-api` (`GET /boxes/:id`) e `frontend-ux` (rota).

**R20. Atalhos de observação ("aguardando armação", "refação").**
- Problema: o sistema não tem estados de espera (D7), mas armação pendente e refação explicam boa parte dos serviços parados [F, S5].
- Detalhe: chips que só preenchem a observação (sem novo campo). Depende de saber quais motivos são comuns [Q5].
- Prioridade: baixa · Esforço: P · Agente: `frontend-ux`.

**R21. Conferência em colunas por idade no desktop.**
- Problema: quem trabalha no balcão com tela grande ganha panorama.
- Detalhe: colunas "Hoje, Ontem, 2 dias, 3 ou mais", como o Kanban por prazo do OticaHub [F, S18]. No celular continua a lista agrupada.
- Prioridade: baixa · Esforço: M · Agente: `frontend-ux`.

**R22. Preparar a evolução para etapas (D7), sem implementar.**
- Detalhe: `status` como enum extensível, histórico por evento (já previsto) e, no futuro, roteiro derivado da categoria. Registrar em nota de design, sem código.
- Prioridade: baixa · Esforço: P · Agente: `backend-api`.

---

## 6. Requisitos para as telas da F5

**Transversal**
- Alvos de 56 px nas ações principais da Conferência e 44 px no mínimo no resto, sem rolagem horizontal a 360 px. Fonte de 16 px ou mais nos campos.
- Cor sempre acompanhada de nome, número e ícone; BoxChip com amostra sobre fundo neutro (R10).
- Nome do usuário sempre visível e "Trocar usuário" à mão (R16). Erros específicos, junto do campo, sem apagar o que foi digitado [S33].

**Hoje**
- Contadores: lançados hoje, pendentes de dias anteriores e **atrasados** (toque leva à Conferência filtrada) (R8).
- Botão "Novo serviço" fixo na base, acima da barra de navegação e da área segura.

**Novo serviço**
- Caixa por `inputmode="numeric"`; chips com **todas** as caixas do número, ocupadas em cinza com autor e data; seleção automática só com uma livre (R1).
- Cliente com sugestões e `autocapitalize="words"` (R12); OS numérica se a OS for só dígitos [Q4]; Enter avança, mais botão "Próximo" visível (R2).
- Aviso de OS repetida sem bloquear (R11).
- "Salvar e próximo" otimista, foco de volta na caixa no mesmo toque, toast com "Desfazer" (R3, R7).
- `BOX_OCCUPIED` explicado com cliente, autor e data da caixa, com escolha de outra caixa sem perder os dados; sem envio duplicado (botão desabilitado e `clientRequestId`) (R13).

**Conferência**
- Agrupada por idade, com rótulos relativos e contagem ("Ontem 21/11 · 12 serviços") e atraso em três níveis com texto e ícone (R4).
- Filtros por cor (seis botões) e por categoria; busca por número; ordenação Prioridade, Prateleira (número e cor), Mais antigos (R5).
- Linha com "Saiu e liberar" em um toque e checks separados; "Liberar" desabilitado com o motivo (R5).
- Modo seleção com barra fixa na base, contagem e escopo, ações por linha desabilitadas, resultado de lote item a item e falhas mantidas selecionadas (R6).
- UI otimista com rollback; um "Desfazer lote" (R7); "Trocar caixa" no menu da linha (R14); filtro "saiu, caixa não liberada" (R15).

**Baixas, Buscar, Detalhe, Folhas**
- Baixas: por dia, com quem e quando, filtro por período e usuário, e "Desfazer" visível dentro da janela.
- Buscar: um campo, resultado que já mostra caixa atual, situação, idade e autor (R9).
- Detalhe: linha do tempo; ações do perfil; "Desfazer" com contagem regressiva (R7).
- Folhas: contadores por dia (lançados, saíram, ainda abertos).

**Para testar em aparelho real (F5):** iPhone (foco, teclado numérico sem Enter, zoom) e Android; o tempo cronometrado de um lançamento, com e sem sugestão de cliente.

---

## 7. Insumos para o `CONTRATO.md` (a decidir com o backend-api, F2 e F3)

Propostas, que dependem da aprovação do Yuri onde tocam regra:

1. `GET /boxes?number=`: todas as cores daquele número, livres e ocupadas (o filtro `state` opcional), com o resumo do serviço, em ordem estável (R1).
2. `GET /boxes/:id`: link direto (R19).
3. Listas de serviços com `daysOpen` e data do servidor; filtro por "saiu, caixa não liberada"; contador de atrasados (R4, R8, R15).
4. `clientRequestId` opcional em `POST /movements` e `POST /movements/batch` (R13).
5. Busca de serviço aberto por OS exata para o aviso de duplicidade (R11).
6. Sugestões de cliente por prefixo ou trecho (R12), só se [Q3] indicar que vale.
7. `batchId` na resposta do lote e desfazer de lote (R7).
8. `seed:demo` com os perfis da R18.

---

## 8. Lacunas e perguntas em aberto para o Yuri

Agrupadas pelo momento em que cada resposta é necessária.

**Antes da F2 (G0)**
- **Q1 (D3).** Por que existem duas cores para a mesma categoria (branca e preta, verde e amarela)? Alguma tem outro significado (turno, bancada, cliente, tipo de lente)? Se tiver, D3 muda.
- **Q15 (D4).** A especificação diz "se só uma bater" em D4 e "se só houver uma livre" na seção 6. Qual vale? Recomendo: só uma livre entre as caixas de mesmo número, com as ocupadas visíveis.
- **Q7 (D5).** Dois pares do mesmo cliente ou duas OS podem dividir a mesma caixa hoje?

**Antes da F3**
- **Q5 (D8, nova D15).** O que é "atrasado" na rotina? A maioria sai no dia seguinte? O urgente tem prazo mais curto? Existe data prometida por cliente (precisaria de campo de prazo) ou é sempre "dia seguinte"? Quais são os motivos mais comuns de um serviço não sair no dia seguinte (armação pendente, refação, falta de lente)?
- **Q4 (D14, nova D16).** Qual o formato da OS (só dígitos? quantos)? Pode a mesma OS ocupar duas caixas? Ao repetir, avisar ou bloquear? (Proposta: só avisar.)
- **Q2 (RN-04).** Serviço urgente que também tem tratamento ou montagem: em que caixa vai? Hoje essa informação se perde? (Pode virar decisão D17: marcas independentes por serviço, fora do MVP.)

**Antes da F5**
- **Q3 (D14).** "Cliente" é a ótica (nome que se repete) ou o paciente? Define as sugestões e a busca.
- **Q9 (seção 14, item 3).** Quem dá baixa é quem lança? No balcão ou na bancada? Usa luva ou mão molhada ao mexer no celular? Quantos aparelhos e quantas pessoas por aparelho? O admin está sempre presente para corrigir?
- **Q11.** Há Wi-Fi ou 4G estável na bancada e na prateleira? Isso define se o modo offline (fora do MVP) vira necessidade e o peso da UI otimista.
- **Q6 (D4).** Quantas caixas há de cada cor e os números se repetem entre cores? Seria viável renumerar para números únicos?
- **Q8 (D6).** Quem devolve a caixa à prateleira e quando? É comum o serviço sair e a caixa voltar depois?

**Backlog e produto**
- **Q10.** Média e pico de serviços por dia, e caixas por cor (já na seção 14 da especificação). Não encontrei dado brasileiro de laboratório pequeno; o seu número substitui a calibragem da seção 3.2.
- **Q12.** Refação ou conserto entra como serviço novo? Usa caixa vermelha? Querem marcar "refação" para medir retrabalho?
- **Q13.** Querem avisar a ótica quando o serviço sai (WhatsApp ou portal)? É a função que mais aparece nos sistemas brasileiros [S13 S15 S16].
- **Q14.** Interesse em imprimir QR nas caixas depois do MVP?
- **Q16 (D12).** Aceita bloquear a tela após alguns minutos sem uso, pedindo a senha? Isso muda RN-14.

**Candidatas a nova decisão (para o orquestrador registrar na especificação depois do OK do Yuri):** D15 limiares de atraso; D16 comportamento ao repetir a OS. D17 fica só como pergunta [Q2].

---

## 9. Fontes

Sistemas e prática do ramo

- [S1] Ocuco, rastreamento de jobs: https://www.ocuco.com/blog/laboratory-job-tracking-software-the-engine-behind-lab-improvement/
- [S2] Ocuco, bola de tênis e priorização: https://www.ocuco.com/blog/optical-lab-software-solutions-power-your-lab-with-innovations/
- [S3] Ocuco InnovaWeb: https://www.ocuco.com/blog/innovaweb-optical-lms-module/
- [S4] Ocuco, recursos de um LMS: https://www.ocuco.com/blog/top-features-to-look-for-in-optical-lab-management-software
- [S5] iCare Labs, tela de status: https://blog.icarelabs.com/blog/myicarelabs-job-status-screen
- [S6] Optivision, leitura de bandeja e lentes: https://www.optivision.com/?p=101
- [S7] Rx-Universe, scanner de estação: https://rxuniverse.atlassian.net/wiki/spaces/RXSUITE/pages/2695266314/Work+Station+Tracking+Scanner+Page
- [S8] Rx-Universe, números de bandeja, Tray Marry e Late Job List (só trechos de busca, [F*]): https://rxuniverse.atlassian.net/wiki/spaces/RXUN/pages/2692218886 · https://rxuniverse.atlassian.net/wiki/x/AYBKdw · https://rxuniverse.atlassian.net/wiki/x/AQAFsw
- [S9] Essilor, pedido de patente US 2015/0227877: https://patents.google.com/patent/US20150227877A1/en
- [S10] Vision Monday, "LMS Puts Lab Managers in Control" (2018): https://www.visionmonday.com/business/labs/article/lms-puts-lab-managers-in-control/
- [S11] Vision Monday, "Technology Partnerships Drive Lab Service" (2020): https://visionmonday.com/business/labs/article/technology-partnerships-drive-lab-service
- [S12] PWI VolpeLab: https://pwi.com.br/erp-volpelab/
- [S13] PWI, portal de pedidos: https://pwi.com.br/blog/portal-de-pedidos-para-laboratorio-optico/
- [S14] TRION: https://trion.com.br/sistema-para-laboratorio-otico/
- [S15] Desempenho (SavWin e SiaWin): https://desempenho.com.br/
- [S16] Presence: https://www.presence.com.br/segmentos/oticas
- [S17] Alterdata Shop, OS e ótica: https://ajuda.alterdata.com.br/shop/ordem-de-servico-aba-do-shop/ordem-de-servico-entrada · https://ajuda.alterdata.com.br/x/tYPFCg · (auditoria, só trecho de busca) https://ajuda.alterdata.com.br/shop/ordem-de-servico-aba-do-shop/os-configurador
- [S18] OticaHub Lab (GitHub): https://github.com/alexferreiraindustrial-hue/laboratorio-optico
- [S19] POG, código de cores (Vision Monday, 2021): https://mobile.visionmonday.com/business/labs/article/problem-solved-pogs-work-ticket-hack
- [S20] Amcon, bandejas: https://www.amconlabs.com/SP/115/Job-Trays
- [S21] Eyecare Business, um dia num laboratório (2021): https://eyecarebusiness.com/issues/2021/may/lab-insider
- [S22] Eyecare Business, "Processing Primer" (2010): https://eyecarebusiness.com/issues/2010/june/processing-primer/
- [S23] Bandejas odontológicas por cor (analogia, [F*]): https://www.valuemed.ca/zirc-lab-pan/ · https://shop.benco.com/Product/4686-637/keystone-lab-work-pan-purple-case-of-12

Volume

- [S24] Eyes on Eyecare, laboratório interno: https://eyesoneyecare.com/resources/when-to-consider-an-in-house-lab-for-your-optical
- [S25] 2020 Mag, Digital Eye Lab (2012): https://2020mag.com/article/digital-eye-lab-expands-operations
- [S26] Vision Monday, Top Labs 2017 (só trecho de busca, [F*]): https://www.visionmonday.com/vm-reports/top-labs/article/vision-mondays-top-labs-2017-in-alphabetical-order/
- [S27] Walman Optical, visita ao laboratório: https://www.walmanoptical.com/labtour
- [S28] Movimento Econômico, planta de lentes na Bahia (2026): https://movimentoeconomico.com.br/estados/bahia/2026/04/09/mais-visao-compra-fabrica-de-lentes-em-sao-paulo-e-move-operacao-para-a-bahia/
- [S29] Eyecare Business, "Redos & Remakes" (2012): https://eyecarebusiness.com/issues/2012/may/redos-remakes/

UX, acessibilidade e plataforma

- [S30] GOV.UK, campo de texto: https://design-system.service.gov.uk/components/text-input/
- [S31] MDN, `inputmode`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
- [S32] MDN, `enterkeyhint`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint
- [S33] NN/g, erros em formulários: https://www.nngroup.com/articles/errors-forms-design-guidelines/
- [S34] NN/g, tamanho de alvo de toque: https://www.nngroup.com/articles/touch-target-size/
- [S35] NN/g, ações em lote: https://www.nngroup.com/videos/bulk-actions-design-guidelines/
- [S36] Carbon, ações em lote em tabela: https://carbondesignsystem.com/components/data-table/usage/
- [S37] Adobe Spectrum, action bar (só trecho de busca, [F*]): https://spectrum.adobe.com/page/action-bar
- [S38] A List Apart, "Never Use a Warning When You Mean Undo": https://alistapart.com/article/neveruseawarning/
- [S39] NN/g, 10 heurísticas: https://www.nngroup.com/articles/ten-usability-heuristics/
- [S40] Material Design 3, snackbar (só trecho de busca, [F*]): https://m3.material.io/components/snackbar/guidelines
- [S41] W3C, WCAG 2.5.8 tamanho de alvo: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- [S42] W3C, WCAG 1.4.1 uso de cor: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- [S43] W3C, WCAG 2.2.1 tempo ajustável (debate sobre toasts, [F*]): https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html
- [S44] Aalto, velocidade de digitação em celular: https://userinterfaces.aalto.fi/typing37k
- [S45] MDN, Barcode Detection API: https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
- [S46] Foco por código no iOS (relatos, [F*]): https://bugs.webkit.org/show_bug.cgi?id=195884 · https://adamdbradley.github.io/mobile-ux-issues/keyboard-focus.html
- [S47] Zoom do iOS em campos abaixo de 16 px (relatos, [F*]): https://www.stefanjudis.com/blog/mobile-safari-doesnt-zoom-into-form-inputs-with-minimum-16px
- [S48] Stripe, requisições idempotentes: https://docs.stripe.com/api/idempotent_requests
- [S49] WebKit, bloqueio de cookies de terceiros: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- [S50] Alvos para luvas, blog de fabricante de display (baixa confiabilidade): https://www.cdtech-display.com/knowledges/how-to-optimize-ui-button-size-for-gloved-users-in-industrial-hmis/
- [S51] Aparelho compartilhado, documentação de fornecedores ([F*]): https://www.servicenow.com/docs/r/7wrwdYVsvypbnj~ci7KrPA/X3iSp2wCKKBdbKvXQ1IOcw · https://learn.microsoft.com/en-us/entra/fundamentals/frontline-worker-management
- [S52] Vision Council, padrão de comunicação de dados (DCS) ([F*]): https://thevisioncouncil.org/blog/vision-council-announces-updated-data-communication-standard-optical-industry

---

## 10. Checklist "Pronto quando" (F0)

- [x] **OK.** 5 ou mais sistemas ou fontes analisados, com URL: 12 sistemas ou projetos (6 internacionais na seção 2.1 e 6 brasileiros na 2.2), 5 fontes de chão de fábrica (2.3) e 6 de volume, todos com URL na seção 9. Os não verificados estão listados à parte (2.4) e não foram usados como evidência.
- [x] **OK.** Cada decisão de D3 a D9 comentada: seção 4 (comentário detalhado de D3 a D9, e resumo de D1 a D14).
- [x] **OK.** Recomendações priorizadas, com o agente que executa: seção 5 (R1 a R22, com prioridade, esforço e agente).
- [x] **OK.** Fatos separados de inferências: marcas [F], [F*] e [I] em cada afirmação, e limites declarados no começo.

Seções extras pedidas: "Impacto nas decisões D1 a D14" (seção 4) e "Requisitos para as telas da F5" (seção 6).

Fora da minha área (para o orquestrador): (a) registrar D15 e D16 na seção 10 da especificação depois do OK do Yuri; (b) esclarecer a contradição "se só uma bater" x "se só houver uma livre" (D4 e seção 6); (c) levar os insumos da seção 7 ao backend-api antes de a F2 fechar o `CONTRATO.md`.
