# HabitaHub – Sistema (CRUDs, padrões de projeto e variabilidade)

Esta pasta contém a primeira versão funcional do HabitaHub. Ela tem back-end em Node.js e telas web de CRUD.

O banco depende de onde o sistema roda:
- **No Docker:** o banco é um **PostgreSQL em container próprio** (`habitahub-banco`).
- **Sem Docker e nos testes:** o sistema usa o SQLite embutido no Node (`node:sqlite`), sem precisar instalar banco nenhum.

A única dependência de produção é o driver `pg`. O `esbuild` entra só em desenvolvimento, para compactar o front-end.

## Como rodar

Requer **Node.js 22.13 ou superior** (testado no 24).

### Com Docker (PostgreSQL em container separado)

A partir da raiz do repositório:

```bash
docker compose up -d --build
```

| Container | O que é | Endereço |
|---|---|---|
| `habitahub-banco` | PostgreSQL 17, com um banco por produto: `habitahub_completo` e `habitahub_essencial` | `localhost:5433` (usuário e senha `habitahub`) |
| `habitahub-completo` | sistema, produto HabitaHub Completo | http://localhost:3200 |
| `habitahub-essencial` | sistema, produto HabitaHub Essencial | http://localhost:3201 |
| `habitahub` | protótipo navegável | http://localhost:3100 |

- **Persistência:** os dados ficam no volume `dados-banco`. O `docker compose down -v` apaga o volume, e o banco volta aos dados de demonstração.
- **Criação dos bancos:** o script `docker/postgres/01-bancos.sql` cria o segundo banco na primeira inicialização.
- **Acesso direto:** para consultar o banco, use `docker exec -it habitahub-banco psql -U habitahub -d habitahub_completo` ou um cliente como o DBeaver na porta 5433.
- **Credenciais:** servem só para desenvolvimento local.

### Sem Docker (SQLite local)

```bash
cd sistema
npm install
npm start                 # produto "completo" em http://localhost:3200
npm run start:essencial   # produto "essencial" (use --porta=3201 para rodar os dois)
npm test                  # 22 testes automatizados (SQLite em memória)
npm run build             # compacta o front-end em dist/ (npm run start:dist já serve essa versão)
npm run medir-reuso       # tabela de economia de código por reuso
```

- **Banco:** fica em `dados/<produto>.db` e recebe dados de demonstração na primeira execução. Para recomeçar do zero, apague o arquivo.
- **PostgreSQL fora do Docker:** defina `HABITAHUB_BANCO_URL=postgres://usuario:senha@host:porta/banco`. A mesma variável faz o `npm test` rodar contra o PostgreSQL; use um banco vazio, porque os testes gravam dados.
- **Outras opções:** `--produto=<id>`, `--porta=<n>`, `--front=dist`, `HABITAHUB_PRODUTO`, `HABITAHUB_FRONT` e `PORT`.

---

## Atividade 03 – Compactação de código focada em reuso

O passo a passo e os números estão em [`COMPACTACAO.md`](COMPACTACAO.md). São duas técnicas:

| Técnica | Comando | Resultado |
|---|---|---|
| Compactação por reuso (extração de componentes genéricos) | `npm run medir-reuso` | 1.139 linhas em vez de cerca de 3.169: 64% menos código |
| Minificação e empacotamento (esbuild) | `npm run build` | 10 módulos JS viram 1 arquivo, 38% menor. A biblioteca reutilizável `dist/lib/tela-crud.min.js` ficou 48% menor |

O Docker serve a versão compactada (`dist/`).

---

## Atividade 01 – Classes principais e padrões de projeto (Opção 01)

### Classes principais (12), em `src/modelos/`

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
| `Organizacao` | nome, criadoEm | deLinha, paraLinha (imobiliária ou corretor autônomo dono dos cadastros) |

`Contrato` e `Avaliacao` ainda não têm tabela; elas entram nas próximas etapas.

### Padrões de projeto

| Padrão | Exemplo | Arquivo | Onde há reuso |
|---|---|---|---|
| **Singleton** | 1. `Database` | `src/infra/Database.js` | Um único ponto de acesso ao banco (pool do PostgreSQL ou arquivo SQLite), compartilhado por todos os repositórios. Também controla as transações. |
| | 2. `Configuracao` | `src/infra/Configuracao.js` | O produto da LPS ativo é decidido uma vez e consultado pelo sistema inteiro. |
| **Template Method** | 1. `Validador.validar()` | `src/validacao/Validador.js` + `validadores.js` | O roteiro de validação (normalizar → obrigatórios → opções → regras) é comum aos 6 cadastros. Cada validador só implementa os passos que variam. |
| | 2. `Repositorio.salvar()` / `excluir()` | `src/repositorios/Repositorio.js` + 7 subclasses | O SQL de INSERT, UPDATE, DELETE e SELECT é escrito uma vez e serve aos dois bancos. As subclasses usam os ganchos `antesDeSalvar`, `depoisDeSalvar`, `antesDeExcluir` e `paraResposta`. |
| | 3. `Relatorio.gerar()` | `src/relatorios/Relatorio.js` + `relatorios.js` | Roteiro fixo: buscar → filtrar → colunas → linhas → resumo → exportar. Os relatórios de imóveis, visitas e propostas só implementam os passos. |
| **Strategy** (padrão novo) | 1. Comissão | `src/estrategias/comissao/` | `ComissaoVenda` (percentual) e `ComissaoLocacao` (n aluguéis). A `Proposta` calcula sem saber qual regra está em uso. |
| | 2. Canal de notificação | `src/estrategias/notificacao/` | `CanalEmail`, `CanalWhatsApp` e `CanalSms`. Os repositórios chamam `Notificador.enviar()` sem conhecer o canal. |
| | 3. Formato de exportação | `src/estrategias/exportacao/` | `ExportadorCsv`, `ExportadorJson` e `ExportadorHtml`. Qualquer relatório sai em qualquer formato. |

Os padrões também se combinam: o Template Method `Relatorio.gerar()` entrega o resultado a uma Strategy de exportação, e o Singleton `Configuracao` define qual Strategy de notificação e de comissão está em uso.

---

## Atividade 02 – CRUDs, banco e variabilidade

### Telas de CRUD (6 telas, 2 por integrante)

Todas as telas listam, criam, editam e excluem registros direto no banco. Elas reutilizam o componente `public/js/TelaCrud.js` no front-end e o `src/http/CrudControlador.js` no back-end. O visual segue o design system do protótipo (`prototipo/css/base.css`): menu lateral em grupos, painel com indicadores, cartões, selos de status, formulário em modal, confirmação de exclusão na própria página e busca na listagem.

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
- **Imóvel:** o código `HH-0001` é gerado ao salvar, o endereço é preenchido pelo ViaCEP e o corretor precisa estar ativo. Um imóvel novo começa como "Disponível" (ou "Inativo"), e o campo Status só aparece na edição. "Vendido" só vale para imóvel à venda, e "Alugado", para locação.
- **Exclusão:** é bloqueada quando o registro está em uso. Um proprietário com imóveis não pode ser excluído, por exemplo.
- **Propostas:** uma proposta aprovada reserva o imóvel, e a tela mostra a comissão estimada.
- **Visitas:** visita realizada exige feedback e envia esse feedback ao proprietário.
- **Notificações:** as notificações aparecem na tela "Notificações".

### Login

O sistema só abre depois do login. Quem entra são os **corretores**, e cada corretor pertence a uma **organização** (veja "Organizações" abaixo). Há dois jeitos de ter uma conta:
- **Criar conta (`#/cadastro`, link na tela de login):** o próprio corretor informa nome, e-mail, telefone, CRECI e senha, com o indicador de força do protótipo. Antes, ele escolhe uma de duas opções:
  - **Criar uma organização:** é o caminho do corretor autônomo ou de uma imobiliária nova. O corretor informa o nome da organização. A conta já nasce **ativa e administradora** dessa organização, e ele entra no sistema na hora.
  - **Entrar numa organização:** o corretor escolhe a organização numa lista. A conta nasce **aguardando aprovação** e não entra no sistema. Os administradores *daquela* organização recebem uma notificação, e o Painel deles mostra um aviso com o botão "Revisar cadastros". Para aprovar, o administrador edita o corretor e marca "Corretor ativo". O novo corretor recebe um aviso de que foi aprovado.

  São aceitas no máximo 5 contas por IP a cada hora.
- **Cadastro pelo administrador:** o administrador cria o corretor na tela Corretores e define a senha ali. O corretor entra na organização do administrador.

| Conta de demonstração | Perfil | E-mail | Senha |
|---|---|---|---|
| Carla Mendes | Administrador | `carla@habitahub.demo` | `demo1234` |
| Rafael Costa | Corretor | `rafael@habitahub.demo` | `demo1234` |

**Perfis** (coluna `corretores.administrador`):

| Ação na tela Corretores | Administrador | Corretor |
|---|---|---|
| Ver a lista | ✔ | ✔ |
| Editar os próprios dados e a própria senha | ✔ | ✔ |
| Aprovar contas novas, ativar e desativar corretores | ✔ | ✘ |
| Criar, editar e excluir outros corretores | ✔ | ✘ |
| Dar ou tirar o perfil de administrador | ✔ | ✘ |

- **Onde as regras ficam:** o servidor confere tudo em `src/seguranca/AutorizacaoCorretores.js`, que o `CrudControlador` chama antes de cada ação e que nega com 403. A tela só esconde os botões e os campos que o usuário não pode usar.
- **Corretor comum não cria corretores:** sem essa regra, ele criaria uma conta já ativa e pularia a aprovação.
- **Sempre há administrador:** o administrador não pode se desativar, se excluir nem tirar o próprio perfil. Se, ao iniciar, uma organização estiver sem nenhum administrador ativo, como acontece em bancos criados antes do perfil existir, o corretor ativo mais antigo dela vira administrador.
- **Avisos:** só os administradores da organização recebem a notificação de conta nova, e só eles veem o aviso "Revisar cadastros" no Painel.

- **Senha:** fica só como hash scrypt com sal aleatório, na coluna `corretores.senha_hash`, e nunca sai da API. Ela precisa ter 8 ou mais caracteres, com letras e números (a mesma regra do protótipo). No formulário do corretor, deixar a senha em branco mantém a atual. Um corretor sem senha não consegue entrar.
- **Sessão:** é um token aleatório num cookie `HttpOnly` e `SameSite=Strict`, válido por 8 horas. As sessões ficam na memória do servidor, então reiniciar o servidor pede login de novo.
- **Rotas protegidas:** sem sessão, a API responde 401. Só ficam abertas `POST /api/login`, `POST /api/logout`, `POST /api/cadastro`, `GET /api/sessao`, `GET /api/organizacoes` (a lista do "Criar conta") e `GET /api/produto`, que a tela de login usa para mostrar o nome e a cor do produto.
- **Aguardando aprovação × desativado:** a coluna `corretores.aguardando_aprovacao` separa os dois casos, e cada um tem a sua mensagem no login. A marca some na primeira ativação, então desativar alguém depois não o faz voltar a "aguardando".
- **Perda do acesso:** a sessão termina na hora se o corretor for desativado ou excluído ou se a senha dele mudar. A tela volta sozinha para o login.
- **Tentativas erradas:** depois de 5 senhas erradas para o mesmo e-mail, o login fica bloqueado por 5 minutos. A mensagem de erro é a mesma para e-mail inexistente e senha errada.
- **Bancos antigos:** bancos criados antes do login ganham as colunas `senha_hash`, `aguardando_aprovacao` e `administrador` ao iniciar, e as contas de demonstração recebem a senha `demo1234`.
- **Código:** `src/seguranca/` (senhas e sessões), rotas de acesso em `src/app.js`, criação de conta em `CorretorRepositorio.criarConta()` e telas de login e de criar conta em `public/js/acesso.js`.

### Organizações

Uma organização é uma imobiliária ou um corretor autônomo. Várias organizações usam o mesmo sistema e o mesmo banco, mas cada uma só vê e altera os próprios corretores, proprietários, clientes, imóveis, visitas, propostas, notificações e relatórios.

- **Como o isolamento funciona:** todas as tabelas de cadastro têm a coluna `organizacao_id`. Antes de cada rota protegida, o servidor abre o contexto da organização do corretor logado (`src/infra/ContextoOrganizacao.js`). O `Repositorio` filtra todo SELECT, UPDATE e DELETE por ela e grava a organização em todo INSERT. Um id de outra organização responde 404, como se não existisse.
- **Falha segura:** um repositório usado fora de uma organização lança erro, em vez de enxergar o banco inteiro.
- **Referências:** imóvel, visita e proposta só aceitam corretor, proprietário, cliente e imóvel da mesma organização.
- **Únicos por organização:** CPF de proprietário e de cliente e o código do imóvel. Duas imobiliárias podem atender o mesmo proprietário, e cada organização tem a sua sequência `HH-0001`, `HH-0002`... E-mail e CRECI do corretor continuam únicos no sistema todo, porque o login é feito pelo e-mail.
- **Demonstração:** os dados de demonstração ficam na organização `organizacaoPadrao` do produto ("Lana Mayan Negócios Imobiliários" no Completo, "Carla Mendes Corretora de Imóveis" no Essencial).
- **Bancos antigos:** ao iniciar, os bancos criados antes das organizações ganham a coluna `organizacao_id`, e todos os registros passam para a organização padrão do produto. O UNIQUE antigo do CPF e do código sai (no SQLite, a tabela é recriada com os mesmos dados).
- **Relação com a LPS:** o produto (features) continua sendo escolhido por instalação. Todas as organizações de uma instalação usam as features daquele produto.

### Banco de dados (8 tabelas)

O esquema está em `src/infra/schema.postgres.sql`, com uma cópia equivalente para SQLite em `schema.sqlite.sql`. As tabelas são `organizacoes`, `corretores`, `proprietarios`, `clientes` e `imoveis` (que referencia proprietário e corretor), `visitas` (que referencia imóvel, cliente e corretor), `propostas` (que referencia imóvel e cliente) e `notificacoes`. Todas, menos `organizacoes`, referenciam a organização dona do registro.
As chaves estrangeiras são verificadas nos dois bancos. O esquema é criado ao iniciar o sistema (`CREATE TABLE IF NOT EXISTS`), e a escolha do driver fica em `src/infra/bancos/`.

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

| Feature | `completo` | `essencial` |
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
- **Novo produto:** basta criar um novo JSON em `produtos/`, sem alterar código. Além das features, o JSON informa `organizacaoPadrao`, a organização dos dados de demonstração.
- **Nova organização:** não precisa de produto novo. Ela é criada pelo próprio corretor, em "Criar conta".
- **Nomes dos produtos:** os produtos se chamam pelo conjunto de features (Completo, Essencial), não pelo cliente. Um mesmo produto atende várias organizações, como a imobiliária parceira Lana Mayan, que usa o Completo. Um produto por cliente seria uma cópia adaptada do sistema (*clone-and-own*), justamente o que a linha de produtos evita.

## Estrutura

```
sistema/
├── server.js                 inicialização (escolhe o produto)
├── produtos/                 produtos da linha (configurações de features)
├── src/
│   ├── app.js                rotas montadas conforme as features
│   ├── infra/                Database, Configuracao (Singletons), ContextoOrganizacao, drivers (bancos/), esquemas, seed, erros
│   ├── modelos/              12 classes de domínio
│   ├── validacao/            Template Method 1
│   ├── repositorios/         Template Method 2
│   ├── relatorios/           Template Method 3
│   ├── estrategias/          Strategy: comissao, notificacao, exportacao
│   ├── variabilidade/        modelo de features
│   ├── seguranca/            login: hash de senha (scrypt) e sessões
│   └── http/                 roteador e controlador CRUD genérico
├── public/                   telas (HTML/CSS/JS, código-fonte)
├── scripts/                  build.js (esbuild) e medir-reuso.js
├── dist/                     front-end compactado (gerado, fora do git)
└── test/                     testes (node --test)
```
