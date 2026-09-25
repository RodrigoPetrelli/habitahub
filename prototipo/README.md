# HabitaHub – Protótipo navegável

Protótipo em HTML, CSS e JavaScript puro, sem build e sem dependências. Para usar, **abra `index.html` no navegador** (funciona via `file://`).
Os dados ficam no `localStorage`. As integrações externas são simuladas em `js/apis.js`, exceto o ViaCEP, que usa a API real.

**Contas de demonstração** (senha `demo1234`):

| Perfil | E-mail |
|---|---|
| Corretor | carla@habitahub.demo |
| Administrador | admin@habitahub.demo |
| Cliente proprietário | joao@habitahub.demo, paulo@habitahub.demo |
| Cliente interessada | mariana@habitahub.demo |

O botão **⚙ Simulador** (topo) força respostas das APIs externas (CRECI suspenso, cartão recusado, Serasa com restrição etc.) para demonstrar os fluxos de exceção da especificação. O mesmo painel restaura os dados de demonstração.

---

## Arquitetura

```
index.html          carrega tudo na ordem: core → apis → fatias → app
css/base.css        design system (classes reutilizáveis)
css/<fatia>.css     estilos específicos de cada fatia (opcional)
js/core.js          namespace HH: banco, sessão, roteador, menu, slots, utilitários de UI
js/apis.js          HH.api: ViaCEP, CRECI, Gateway, Serasa, Assinatura, OAuth (simuladas)
js/modules/<fatia>.js  uma fatia vertical por arquivo
js/app.js           shell: layout, menu, notificações, simulador, painel da equipe
```

### Fatias verticais

Cada fatia entrega **um fluxo completo, de ponta a ponta**: as telas de todos os atores envolvidos, as regras de negócio, a integração externa e as notificações.
Uma fatia **só edita os próprios arquivos** (`js/modules/<fatia>.js` e `css/<fatia>.css`). Para aparecer na tela de outra fatia, ela usa um **slot**.

| Fatia | Arquivo | Casos de uso | Fluxo ponta a ponta |
|---|---|---|---|
| 1. Acesso | `acesso.js` | UC05, UC06 | Visitante cria conta (ViaCEP, CPF, senha forte, Google/Apple) → faz login → edita o perfil, a foto, a senha e as preferências |
| 2. Imóvel | `imovel.js` | UC01, UC02, UC03 | Corretor cadastra (ViaCEP + CRECI), edita (histórico de preço) e inativa imóveis → cliente encontra no catálogo com filtros → proprietário vê os seus em "Meus imóveis" |
| 3. Visita | `visita.js` | UC04, UC11 | Cliente agenda ou reagenda uma visita → corretor realiza e registra o feedback → proprietário recebe o feedback → cliente avalia o atendimento → média do corretor |
| 4. Proposta | `proposta.js` | UC07, UC08 | Cliente faz uma proposta → corretor aprova, recusa ou contrapropõe → proprietário acompanha → cliente paga a taxa de reserva (PIX/cartão) → imóvel fica reservado |
| 5. Contrato | `contrato.js` | UC09, UC10, UC12 | Corretor gera o contrato (Serasa) → edita a minuta ou registra aditivo → sincroniza as assinaturas → contrato vigente → cliente e proprietário acompanham |

### Rotas e menu de cada fatia

A fatia registra as rotas com `HH.route` e os itens de menu com `HH.nav`. **Não use rotas de outra fatia.**

| Fatia | Rotas | Menu (`group` · `order`) |
|---|---|---|
| Acesso | `#/login`, `#/cadastro` (`roles:'public'`, `bare:true`), `#/perfil` | Conta · 90 "Meu perfil" (todos) |
| Imóvel | `#/catalogo`, `#/imovel/:id`, `#/imoveis`, `#/imoveis/novo`, `#/imoveis/:id/editar`, `#/meus-imoveis`, `#/meus-imoveis/:id` | Cliente · 10 "Catálogo", Cliente · 40 "Meus imóveis"; Imobiliária · 10 "Imóveis" |
| Visita | `#/minhas-visitas`, `#/agenda`, `#/avaliacoes` | Cliente · 20 "Minhas visitas"; Imobiliária · 20 "Agenda", Imobiliária · 50 "Avaliações" |
| Proposta | `#/minhas-propostas`, `#/propostas` | Cliente · 30 "Minhas propostas"; Imobiliária · 30 "Propostas" |
| Contrato | `#/contratos`, `#/contratos/novo/:propostaId`, `#/contratos/:id`, `#/meus-contratos` | Cliente · 50 "Meus contratos"; Imobiliária · 40 "Contratos" |

O shell já registra `#/painel` (Imobiliária · 0). O perfil `cliente` cobre Cliente, Proprietário e Interessado, que são o mesmo ator na especificação. Proprietário é o cliente que tem imóveis com `proprietarioId` igual ao seu id.
Quem não está logado é redirecionado para `#/login`. A tela inicial é `#/painel` para a equipe e `#/catalogo` para o cliente.

### Slots (pontos de extensão)

```js
HH.slot('nome.do.slot', { order: 20, render: (ctx) => '<html>', mount: (root, ctx) => { /* listeners */ } });
```

| Slot | Dono (renderiza) | ctx | Quem contribui |
|---|---|---|---|
| `imovel.detalhe.acoes` | Imóvel (`#/imovel/:id`, área de botões do cliente) | `{ imovel, user }` | Visita → botão "Agendar visita" · Proposta → botão "Fazer proposta" |
| `proprietario.imovel` | Imóvel (`#/meus-imoveis/:id`) | `{ imovel, user }` | Visita → card de visitas e feedbacks · Proposta → card de propostas · Contrato → card do contrato |
| `painel.pendencias` | Shell (`#/painel`) | `{ user }` | Cada fatia devolve itens `<li>` (ex.: propostas em análise, contratos aguardando assinatura, visitas sem feedback) |

A dona do slot chama `HH.renderSlot(nome, ctx)` dentro do `render` e `HH.mountSlot(nome, root, ctx)` dentro do `mount`. Quem contribui usa seletores com prefixo da fatia (ex.: `[data-visita-agendar]`) para não colidir.

### API do núcleo (`HH`)

- **Dados**: `HH.db.<coleção>`, `HH.find(col, id)`, `HH.where(col, pred)`, `HH.insert(col, obj)`, `HH.update(col, id, patch)`, `HH.save()` (chame depois de mutar objetos diretamente), `HH.uid('p')`, `HH.nextCodigo('imovel'|'contrato')`.
- **Sessão**: `HH.me()`, `HH.isStaff()`, `HH.login(id)`, `HH.logout()`.
- **Rotas**: `HH.route(pattern, { title, roles, bare, render(ctx) → html, mount(root, ctx) })`, `HH.go('#/x')`, `HH.render()` (re-renderiza a rota atual), `HH.nav({ label, href, roles, group, order })`.
- **Notificações**: `HH.notify(usuarioId, texto, href)`, `HH.notifyStaff(texto, href)`.
- **Regras compartilhadas**: `HH.valorFinal(proposta)`, `HH.taxaReserva(proposta)`, `HH.pagamentoDe(propostaId)`, `HH.validaCPF`, `HH.formatCPF`, `HH.senhaForte`, `HH.hash`.
- **UI**: `HH.esc` (**sempre** escape dados do usuário no HTML), `HH.money`, `HH.date`, `HH.dateTime`, `HH.badge(status)`, `HH.ucTag('UC01')`, `HH.stars(n)`, `HH.thumb(imovel, 'sm')`, `HH.avatar(user)`, `HH.toast(msg, 'ok'|'danger'|'warn')`, `HH.modal({...})`, `HH.confirm(texto, opts) → Promise<bool>`, `HH.formData(form)`, `HH.markInvalid(form, [names])`, `HH.busy(btn, promise)`.
- **APIs externas**: veja o cabeçalho de `js/apis.js`. Em falha, a Promise é rejeitada com a mensagem exata da especificação.

**Não use `alert`, `confirm` nem `prompt` do navegador.** Use `HH.modal`, `HH.confirm` e `HH.toast`.

### Modelo de dados (seed em `core.js`)

- `usuarios` { id, nome, email, cpf, telefone, cep, endereco, senha(hash), perfil: cliente|corretor|admin, creci?, creciUf?, prefs{emailMarketing, whatsapp, alertaNovos}, foto, criadoEm, provedorSocial? }
- `imoveis` { id, codigo, titulo, descricao, tipo, modalidade: Venda|Aluguel, valor, cep, logradouro, numero, complemento, bairro, cidade, uf, quartos, area, proprietarioId, corretorId, status: Disponível|Reservado|Indisponível|Inativo, fotos[], historicoPreco[{data,de,para,usuarioId}], cor, criadoEm }
- `visitas` { id, imovelId, clienteId, corretorId, dataHora, status: Agendada|Realizada|Cancelada, obs, feedback, criadoEm }
- `propostas` { id, imovelId, clienteId, valor, pagamento, obs, cartaCredito, status: Em Análise|Contraproposta|Aprovada|Recusada, contraproposta, historico[{data,texto}], data }
- `pagamentos` { id, propostaId, forma, valor, status, transacaoId, data }
- `contratos` { id, numero, propostaId, imovelId, tipo, inicio, termino, valor, vencimento, indiceReajuste, clausulas, status: Aguardando Assinaturas|Vigente|Recusado pelo Assinante, serasa{score,situacao,restricao,pendente}, envelopeId, assinaturas[{nome,email,papel,status,data}], aditivos[{data,motivo,texto,usuarioId}], versao, pdfUrl, criadoEm }
- `avaliacoes` { id, visitaId, clienteId, corretorId, imovelId, notaCorretor, notaImovel, comentario, anonimo, data }
- `notificacoes` { id, usuarioId, texto, href, data, lida }

**Transições compartilhadas entre fatias:**

- Pagamento confirmado → imóvel `Reservado` (Proposta).
- Contrato `Vigente` → imóvel `Indisponível` (Contrato).
- Só imóveis `Disponível` aceitam novas visitas e propostas (Visita e Proposta).
- Inativação é bloqueada quando há proposta `Em Análise`, `Contraproposta` ou `Aprovada`, ou contrato que não esteja `Recusado pelo Assinante` (Imóvel).
