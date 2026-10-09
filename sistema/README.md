# HabitaHub – Sistema (CRUDs, padrões de projeto e variabilidade)

Esta pasta contém a primeira versão funcional do HabitaHub. Ela tem back-end em Node.js, banco SQLite e telas web de CRUD.
Não há dependências externas: o sistema usa `node:http` e o SQLite nativo do Node (`node:sqlite`), então dispensa o `npm install`.

## Como rodar

Requer **Node.js 22.13 ou superior** (testado no 24).

```bash
cd sistema
npm start                 # produto "lana-mayan" em http://localhost:3200
npm run start:autonomo    # produto "corretor-autonomo" (use --porta=3201 para rodar os dois)
npm test                  # 9 testes automatizados
```

Outras opções: `node server.js --produto=<id> --porta=<n>`, ou as variáveis `HABITAHUB_PRODUTO`, `PORT` e `HABITAHUB_BANCO`.
O banco fica em `dados/<produto>.db` e é criado com dados de demonstração na primeira execução. Para recomeçar do zero, apague o arquivo.

Com Docker, a partir da raiz do repositório:

```bash
docker compose up -d --build
```

O comando sobe três endereços: o protótipo em http://localhost:3100 e os dois produtos da linha, em http://localhost:3200 (Lana Mayan) e http://localhost:3201 (Corretor Autônomo).

---

## Atividade 01 – Classes principais e padrões de projeto (Opção 01)

### Classes principais (11), em `src/modelos/`

| Classe | Atributos principais | Métodos principais |
|---|---|---|
| `Usuario` (base) | id, nome, email, telefone, criadoEm | primeiroNome, contatoPreferencial, emailValido, cpfValido, formatarCpf |
| `Corretor` | + creci, ativo | ativar, desativar, ufDoCreci, podeAtenderImoveis |
| `Proprietario` | + cpf | cpfMascarado, possuiImoveis |
| `Cliente` | + cpf, interesse | combinaCom(imovel) |
| `Endereco` | cep, logradouro, numero, bairro, cidade, uf | cepFormatado, formatado, mesmaCidade |
| `Imovel` | codigo, titulo, tipo, finalidade, preco, area, quartos, endereco, status, proprietarioId, corretorId | estaDisponivel, precoPorM2, reservar, concluirNegocio, inativar |
| `Visita` | imovelId, clienteId, corretorId, dataHora, status, feedback | ehFutura, reagendar, registrarRealizacao, cancelar |
| `Proposta` | imovelId, clienteId, valor, condicoes, status, valorContraproposta | aprovar, recusar, contrapropor, valorNegociado, percentualDoPreco, calcularComissao |
| `Contrato` | numero, propostaId, imovelId, tipo, valor, inicio, termino, assinaturas | aPartirDaProposta, adicionarAssinatura, estaAssinadoPor, duracaoEmMeses |
| `Avaliacao` | visitaId, corretorId, nota, comentario, anonimo | ehPositiva, autorExibido, media |
| `Notificacao` | canal, destinatario, mensagem, enviadoEm | resumo |

`Contrato` e `Avaliacao` ainda não têm tabela; elas entram nas próximas etapas.

### Padrões de projeto

| Padrão | Exemplo | Arquivo | Onde há reuso |
|---|---|---|---|
| **Singleton** | 1. `Database` | `src/infra/Database.js` | Uma conexão SQLite compartilhada por todos os repositórios. |
| | 2. `Configuracao` | `src/infra/Configuracao.js` | O produto da LPS ativo é decidido uma vez e consultado pelo sistema inteiro. |
| **Template Method** | 1. `Validador.validar()` | `src/validacao/Validador.js` + `validadores.js` | O roteiro de validação (normalizar → obrigatórios → opções → regras) é comum aos 6 cadastros. Cada validador só implementa os passos que variam. |
| | 2. `Repositorio.salvar()` / `excluir()` | `src/repositorios/Repositorio.js` + 7 subclasses | O SQL de INSERT, UPDATE, DELETE e SELECT é escrito uma vez. As subclasses usam os ganchos `antesDeSalvar`, `depoisDeSalvar`, `antesDeExcluir` e `paraResposta`. |
| | 3. `Relatorio.gerar()` | `src/relatorios/Relatorio.js` + `relatorios.js` | Roteiro fixo: buscar → filtrar → colunas → linhas → resumo → exportar. Os relatórios de imóveis, visitas e propostas só implementam os passos. |
| **Strategy** (padrão novo) | 1. Comissão | `src/estrategias/comissao/` | `ComissaoVenda` (percentual) e `ComissaoLocacao` (n aluguéis). A `Proposta` calcula sem saber qual regra está em uso. |
| | 2. Canal de notificação | `src/estrategias/notificacao/` | `CanalEmail`, `CanalWhatsApp` e `CanalSms`. Os repositórios chamam `Notificador.enviar()` sem conhecer o canal. |
| | 3. Formato de exportação | `src/estrategias/exportacao/` | `ExportadorCsv`, `ExportadorJson` e `ExportadorHtml`. Qualquer relatório sai em qualquer formato. |

Os padrões também se combinam: o Template Method `Relatorio.gerar()` entrega o resultado a uma Strategy de exportação, e o Singleton `Configuracao` define qual Strategy de notificação e de comissão está em uso.

---

## Atividade 02 – CRUDs, banco e variabilidade

### Telas de CRUD (6 telas, 2 por integrante)

Todas as telas listam, criam, editam e excluem registros direto no banco. Elas reutilizam o componente `public/js/TelaCrud.js` no front-end e o `src/http/CrudControlador.js` no back-end.

| Integrante (sugestão, ajustar) | Tela | Arquivo da tela | Repositório / tabela |
|---|---|---|---|
| Erik Carvalho | Corretores | `public/js/telas/corretores.js` | `CorretorRepositorio` / `corretores` |
| Erik Carvalho | Proprietários | `public/js/telas/proprietarios.js` | `ProprietarioRepositorio` / `proprietarios` |
| Luiz Eduardo Assi | Clientes | `public/js/telas/clientes.js` | `ClienteRepositorio` / `clientes` |
| Luiz Eduardo Assi | Imóveis | `public/js/telas/imoveis.js` | `ImovelRepositorio` / `imoveis` |
| Rodrigo Glir | Visitas | `public/js/telas/visitas.js` | `VisitaRepositorio` / `visitas` |
| Rodrigo Glir | Propostas | `public/js/telas/propostas.js` | `PropostaRepositorio` / `propostas` |

Regras de negócio que aparecem nas telas:
- **Validação:** CPF com dígito verificador, e-mail, CRECI no formato `12345-F/PR`, UF e CEP.
- **Imóvel:** o código `HH-0001` é gerado ao salvar, o endereço é preenchido pelo ViaCEP e o corretor precisa estar ativo.
- **Exclusão:** é bloqueada quando o registro está em uso. Um proprietário com imóveis não pode ser excluído, por exemplo.
- **Propostas:** uma proposta aprovada reserva o imóvel, e a tela mostra a comissão estimada.
- **Visitas:** visita realizada exige feedback e envia esse feedback ao proprietário.
- **Notificações:** as notificações aparecem na tela "Notificações".

### Banco de dados (7 tabelas)

O esquema está em `src/infra/schema.sql`. As tabelas são `corretores`, `proprietarios`, `clientes` e `imoveis` (que referencia proprietário e corretor), `visitas` (que referencia imóvel, cliente e corretor), `propostas` (que referencia imóvel e cliente) e `notificacoes`.
As chaves estrangeiras ficam ativas (`PRAGMA foreign_keys = ON`).

### Variabilidade (LPS)

**Modelo de features** (`src/variabilidade/ModeloDeFeatures.js`):

```
HabitaHub
├── Cadastros ................ obrigatória  (Corretores, Proprietários, Clientes, Imóveis)
├── Visitas .................. opcional
├── Propostas ................ opcional     (requer Visitas)
├── Modalidades .............. grupo OR     (Venda | Locação – pelo menos uma)
├── Notificação .............. alternativa  (email | whatsapp | sms – exatamente uma)
└── Exportação de relatórios . grupo OR     (csv | html | json – pelo menos uma)
Parâmetros: % de comissão de venda, nº de aluguéis na locação, cor da marca
```

**Produtos da linha** (`produtos/*.json`). Cada arquivo é uma configuração do modelo:

| Feature | `lana-mayan` | `corretor-autonomo` |
|---|---|---|
| Visitas | ✔ | ✔ |
| Propostas | ✔ | ✘ |
| Modalidades | Venda, Locação | Venda |
| Notificação | WhatsApp | E-mail |
| Exportação | CSV, HTML, JSON | CSV |
| Comissão de venda | 6% | 5% |

**Pontos de variação no código** (procure por `VP1`…`VP5`):

| VP | Feature | Mecanismo | Onde |
|---|---|---|---|
| VP1 | Visitas (opcional) | Rotas, relatório e menu só existem se a feature estiver ligada | `src/app.js`, `public/js/app.js` |
| VP2 | Propostas (opcional) | Mesmo mecanismo do VP1 | `src/app.js`, `public/js/app.js` |
| VP3 | Modalidades (OR) | Os validadores e os selects das telas aceitam só as modalidades do produto | `validadores.js`, `telas/imoveis.js`, `telas/clientes.js` |
| VP4 | Exportação (OR) | Strategy: `exportadorPara()` só entrega os formatos habilitados | `estrategias/exportacao/` |
| VP5 | Notificação (alternativa) | Strategy: `Notificador.doProduto()` escolhe o canal | `estrategias/notificacao/` |

- **Tempo de vinculação:** na carga do sistema (*load time*), pelo parâmetro `--produto` ou pela variável `HABITAHUB_PRODUTO`.
- **Verificação:** antes de subir, `Configuracao.carregar()` valida o produto contra o modelo de features. Um produto com `"propostas": true` e `"visitas": false`, por exemplo, nem inicia.
- **Novo produto:** basta criar um novo JSON em `produtos/`, sem alterar código.

## Estrutura

```
sistema/
├── server.js                 inicialização (escolhe o produto)
├── produtos/                 produtos da linha (configurações de features)
├── src/
│   ├── app.js                rotas montadas conforme as features
│   ├── infra/                Database, Configuracao (Singletons), schema.sql, seed, erros
│   ├── modelos/              11 classes de domínio
│   ├── validacao/            Template Method 1
│   ├── repositorios/         Template Method 2
│   ├── relatorios/           Template Method 3
│   ├── estrategias/          Strategy: comissao, notificacao, exportacao
│   ├── variabilidade/        modelo de features
│   └── http/                 roteador e controlador CRUD genérico
├── public/                   telas (HTML/CSS/JS, sem build)
└── test/                     testes (node --test)
```
