const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Configuracao = require('../src/infra/Configuracao');
const Database = require('../src/infra/Database');
const ModeloDeFeatures = require('../src/variabilidade/ModeloDeFeatures');
const { ValidadorCliente } = require('../src/validacao/validadores');
const { ComissaoVenda, ComissaoLocacao } = require('../src/estrategias/comissao');
const { CanalEmail, CanalSms, CanalWhatsApp } = require('../src/estrategias/notificacao');
const { ExportadorCsv, ExportadorJson, exportadorPara } = require('../src/estrategias/exportacao');
const { RelatorioImoveis } = require('../src/relatorios/relatorios');
const { popularSeVazio, SENHA_DEMO } = require('../src/infra/seed');
const { criarAplicacao } = require('../src/app');
const { Autenticacao, DURACAO_SESSAO } = require('../src/seguranca/Autenticacao');
const { gerarHash, conferir } = require('../src/seguranca/senhas');
const CorretorRepositorio = require('../src/repositorios/CorretorRepositorio');
const ClienteRepositorio = require('../src/repositorios/ClienteRepositorio');
const ImovelRepositorio = require('../src/repositorios/ImovelRepositorio');
const ProprietarioRepositorio = require('../src/repositorios/ProprietarioRepositorio');
const PropostaRepositorio = require('../src/repositorios/PropostaRepositorio');
const NotificacaoRepositorio = require('../src/repositorios/NotificacaoRepositorio');
const { ErroValidacao, ErroRegraNegocio, ErroAplicacao } = require('../src/infra/erros');

// Sem HABITAHUB_BANCO_URL os testes usam SQLite em memória. Com ela, rodam
// contra o PostgreSQL. Use um banco vazio, porque os testes gravam dados.
before(async () => {
  Configuracao.instancia().carregar('lana-mayan');
  await Database.instancia().conectar(process.env.HABITAHUB_BANCO_URL || ':memory:');
  await popularSeVazio();
});

after(() => Database.instancia().fechar());

test('Singleton: sempre a mesma instância e construtor bloqueado', () => {
  assert.equal(Database.instancia(), Database.instancia());
  assert.equal(Configuracao.instancia(), Configuracao.instancia());
  assert.throws(() => new Database(), /Database.instancia/);
  assert.throws(() => new Configuracao(), /Configuracao.instancia/);
});

test('Variabilidade: o modelo de features rejeita configurações inválidas', () => {
  const modelo = new ModeloDeFeatures();
  const valida = { visitas: true, propostas: true, modalidades: ['Venda'], notificacao: 'email', exportacao: ['csv'] };
  assert.deepEqual(modelo.validar(valida), []);
  assert.match(modelo.validar({ ...valida, visitas: false }).join(), /requer "visitas"/);
  assert.match(modelo.validar({ ...valida, modalidades: [] }).join(), /pelo menos uma/);
  assert.match(modelo.validar({ ...valida, notificacao: 'pombo' }).join(), /exatamente uma/);
});

test('Variabilidade: os dois produtos da linha são configurações válidas', () => {
  const modelo = new ModeloDeFeatures();
  for (const arquivo of fs.readdirSync(path.join(__dirname, '..', 'produtos'))) {
    const produto = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'produtos', arquivo), 'utf8'));
    assert.deepEqual(modelo.validar(produto.features), [], arquivo);
  }
});

test('Template Method (Validador): passos fixos e regras do cliente', () => {
  const r = new ValidadorCliente().validar({ nome: '  Ana ', cpf: '52998224725', email: 'ANA@X.COM', interesse: 'Venda' });
  assert.equal(r.valido, true);
  assert.equal(r.dados.nome, 'Ana');
  assert.equal(r.dados.cpf, '529.982.247-25');
  assert.equal(r.dados.email, 'ana@x.com');
  const ruim = new ValidadorCliente().validar({ nome: '', cpf: '123', email: 'x', interesse: 'Permuta' });
  assert.deepEqual(Object.keys(ruim.erros).sort(), ['cpf', 'email', 'interesse', 'nome']);
});

test('Template Method (Repositorio): CRUD completo com ganchos', async () => {
  const repo = new ClienteRepositorio();
  const criado = await repo.salvar({ nome: 'Teste da Silva', cpf: '529.982.247-25', email: 't@t.com', interesse: 'Locação' });
  assert.ok(criado.id);
  const alterado = await repo.salvar({ telefone: '(41) 90000-0000' }, criado.id);
  assert.equal(alterado.nome, 'Teste da Silva');
  assert.equal(alterado.telefone, '(41) 90000-0000');
  await assert.rejects(repo.salvar({ email: 'invalido' }, criado.id), ErroValidacao);
  await repo.excluir(criado.id);
  assert.equal(await repo.buscarPorId(criado.id), null);
});

test('Template Method (Repositorio): ganchos de regra de negócio', async () => {
  const imovel = await new ImovelRepositorio().salvar({
    titulo: 'Teste', tipo: 'Casa', finalidade: 'Venda', preco: 100000, cidade: 'Curitiba', uf: 'pr', proprietarioId: 1, corretorId: 1,
  });
  assert.match(imovel.codigo, /^HH-\d{4}$/);
  assert.equal(imovel.endereco.uf, 'PR');
  await assert.rejects(new ProprietarioRepositorio().excluir(1), ErroRegraNegocio);

  const proposta = await new PropostaRepositorio().salvar({ imovelId: imovel.id, clienteId: 1, valor: 95000 });
  await new PropostaRepositorio().salvar({ status: 'Aprovada' }, proposta.id);
  assert.equal((await new ImovelRepositorio().buscarPorId(imovel.id)).status, 'Reservado');
});

test('Template Method (Relatorio) + Strategy (Exportador)', async () => {
  const csv = await new RelatorioImoveis().gerar(new ExportadorCsv());
  assert.match(csv, /^﻿Código;Título/);
  const json = JSON.parse(await new RelatorioImoveis().gerar(new ExportadorJson(), { status: 'Disponível' }));
  assert.ok(json.registros.every((r) => r.Status === 'Disponível'));
  assert.equal(exportadorPara('pdf'), null);
});

test('Strategy: comissão por modalidade', () => {
  assert.equal(new ComissaoVenda(6).calcular(500000), 30000);
  assert.equal(new ComissaoLocacao(1).calcular(2000), 2000);
});

test('Strategy: canais de notificação', async () => {
  const pessoa = { email: 'a@b.com', telefone: '(41) 9' };
  assert.equal(new CanalEmail().destinatario(pessoa), 'a@b.com');
  assert.equal(new CanalWhatsApp().destinatario(pessoa), '(41) 9');
  assert.ok(new CanalSms().formatar('x'.repeat(300)).length <= 160);
  assert.ok((await new NotificacaoRepositorio().listar()).every((n) => n.canal === 'whatsapp'));
});

test('Transação: erro no meio desfaz a gravação inteira', async () => {
  const db = Database.instancia();
  const antes = (await new ClienteRepositorio().listar()).length;
  await assert.rejects(db.transacao(async () => {
    await new ClienteRepositorio().salvar({ nome: 'Rollback', cpf: '111.444.777-35', email: 'r@r.com', interesse: 'Venda' });
    throw new Error('falha proposital');
  }), /falha proposital/);
  assert.equal((await new ClienteRepositorio().listar()).length, antes);
});

// ---------- Login ----------

test('Senhas: hash scrypt com sal aleatório', async () => {
  const a = await gerarHash('segredo123');
  const b = await gerarHash('segredo123');
  assert.match(a, /^scrypt\$/);
  assert.notEqual(a, b);
  assert.equal(await conferir('segredo123', a), true);
  assert.equal(await conferir('segredo124', a), false);
  assert.equal(await conferir('segredo123', null), false);
});

test('Login: senha certa entra; senha errada e e-mail desconhecido não', async () => {
  const auth = new Autenticacao();
  const { token, usuario } = await auth.entrar('CARLA@habitahub.demo ', SENHA_DEMO);
  assert.equal(usuario.nome, 'Carla Mendes');
  assert.equal((await auth.usuarioDoToken(token)).email, 'carla@habitahub.demo');
  await assert.rejects(auth.entrar('carla@habitahub.demo', 'errada123'), { status: 401, message: 'E-mail ou senha inválidos.' });
  await assert.rejects(auth.entrar('ninguem@x.com', SENHA_DEMO), { status: 401, message: 'E-mail ou senha inválidos.' });
  auth.sair(token);
  assert.equal(await auth.usuarioDoToken(token), null);
});

test('Login: bloqueio depois de 5 senhas erradas e sessão que expira', async () => {
  let agora = Date.now();
  const auth = new Autenticacao({ agora: () => agora });
  for (let i = 0; i < 5; i++) await assert.rejects(auth.entrar('rafael@habitahub.demo', 'errada123'), { status: 401 });
  await assert.rejects(auth.entrar('rafael@habitahub.demo', SENHA_DEMO), { status: 429 });
  agora += 5 * 60 * 1000 + 1;
  const { token } = await auth.entrar('rafael@habitahub.demo', SENHA_DEMO);
  agora += DURACAO_SESSAO;
  assert.equal(await auth.usuarioDoToken(token), null);
});

test('Login: corretor desativado ou com senha trocada perde o acesso', async () => {
  const repo = new CorretorRepositorio();
  const corretor = await repo.salvar({ nome: 'Teste Acesso', email: 'acesso@teste.com', creci: '99001-F/PR', senha: 'primeira123' });
  assert.equal(JSON.stringify(corretor).includes('senha'), false);
  await assert.rejects(repo.salvar({ senha: 'curta' }, corretor.id), (e) => e instanceof ErroValidacao && 'senha' in e.erros);

  const auth = new Autenticacao();
  const { token } = await auth.entrar('acesso@teste.com', 'primeira123');
  await repo.salvar({ senha: 'segunda123' }, corretor.id);
  assert.equal(await auth.usuarioDoToken(token), null, 'troca de senha encerra a sessão');
  await assert.rejects(auth.entrar('acesso@teste.com', 'primeira123'), { status: 401 });

  const nova = await auth.entrar('acesso@teste.com', 'segunda123');
  await repo.salvar({ nome: 'Teste Acesso' }, corretor.id); // salvar sem senha mantém a atual
  assert.ok(await auth.usuarioDoToken(nova.token));
  await repo.salvar({ ativo: false }, corretor.id);
  assert.equal(await auth.usuarioDoToken(nova.token), null, 'desativar encerra a sessão');
  await assert.rejects(auth.entrar('acesso@teste.com', 'segunda123'), (e) => e instanceof ErroAplicacao && e.status === 403);
});

test('Criar conta: nasce aguardando aprovação e só entra depois de aprovada', async () => {
  const repo = new CorretorRepositorio();
  await assert.rejects(repo.criarConta({ nome: 'Sem Senha', email: 'semsenha@teste.com', creci: 'x' }),
    (e) => e instanceof ErroValidacao && 'senha' in e.erros && 'creci' in e.erros);

  const novo = await repo.criarConta({ nome: 'Nova Corretora', email: 'nova@teste.com', telefone: '(41) 99999-1234', creci: '77001-F/PR', senha: 'novaconta1' });
  assert.equal(novo.ativo, false);
  assert.equal(novo.aguardandoAprovacao, true);
  assert.ok((await new NotificacaoRepositorio().listar()).some((n) => /Nova Corretora .* aguarda aprovação/.test(n.mensagem)), 'corretores ativos são avisados');

  const auth = new Autenticacao();
  await assert.rejects(auth.entrar('nova@teste.com', 'novaconta1'), { status: 403, message: /aguardando aprovação/ });

  const aprovada = await repo.salvar({ ativo: true }, novo.id);
  assert.equal(aprovada.aguardandoAprovacao, false);
  assert.ok((await new NotificacaoRepositorio().listar()).some((n) => /cadastro foi aprovado/.test(n.mensagem)));
  assert.ok((await auth.entrar('nova@teste.com', 'novaconta1')).token);

  await repo.salvar({ ativo: false }, novo.id); // desativar depois não volta a "aguardando"
  await assert.rejects(auth.entrar('nova@teste.com', 'novaconta1'), { status: 403, message: /desativado/ });
});

test('HTTP: a API exige login e o cookie de sessão é HttpOnly', async () => {
  const servidor = await criarAplicacao({ produto: 'lana-mayan', banco: process.env.HABITAHUB_BANCO_URL || ':memory:' });
  await new Promise((r) => servidor.listen(0, r));
  const base = `http://localhost:${servidor.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/imoveis`)).status, 401);
    assert.equal((await fetch(`${base}/api/nao-existe`)).status, 401, 'sem sessão não revela quais rotas existem');
    assert.equal((await fetch(`${base}/api/produto`)).status, 200);
    assert.equal((await fetch(`${base}/api/sessao`)).status, 401);

    const errado = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ email: 'carla@habitahub.demo', senha: 'x' }) });
    assert.equal(errado.status, 401);

    const login = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ email: 'carla@habitahub.demo', senha: SENHA_DEMO }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /^hh_sessao_lana-mayan=[\w-]+;.*HttpOnly.*SameSite=Strict/);
    const headers = { cookie: cookie.split(';')[0] };

    assert.equal((await (await fetch(`${base}/api/sessao`, { headers })).json()).nome, 'Carla Mendes');
    const corretores = await fetch(`${base}/api/corretores`, { headers });
    assert.equal(corretores.status, 200);
    assert.doesNotMatch(await corretores.text(), /senha|scrypt/, 'o hash nunca sai da API');

    // "Criar conta" é pública, mas não deixa o próprio cadastro entrar já ativo.
    const cadastro = await fetch(`${base}/api/cadastro`, { method: 'POST', body: JSON.stringify({ nome: 'Pelo Site', email: 'site@teste.com', creci: '77002-F/PR', senha: 'pelosite1', ativo: true }) });
    assert.equal(cadastro.status, 201);
    const pelaApi = (await (await fetch(`${base}/api/corretores`, { headers })).json()).find((c) => c.email === 'site@teste.com');
    assert.equal(pelaApi.ativo, false);
    assert.equal(pelaApi.aguardandoAprovacao, true);

    assert.equal((await fetch(`${base}/api/logout`, { method: 'POST', headers })).status, 204);
    assert.equal((await fetch(`${base}/api/imoveis`, { headers })).status, 401);
  } finally {
    servidor.close();
  }
});
