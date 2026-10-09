const { test } = require('node:test');
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
const { popularSeVazio } = require('../src/infra/seed');
const ClienteRepositorio = require('../src/repositorios/ClienteRepositorio');
const ImovelRepositorio = require('../src/repositorios/ImovelRepositorio');
const ProprietarioRepositorio = require('../src/repositorios/ProprietarioRepositorio');
const PropostaRepositorio = require('../src/repositorios/PropostaRepositorio');
const NotificacaoRepositorio = require('../src/repositorios/NotificacaoRepositorio');
const { ErroValidacao, ErroRegraNegocio } = require('../src/infra/erros');

Configuracao.instancia().carregar('lana-mayan');
Database.instancia().conectar(':memory:');
Database.instancia().executar(fs.readFileSync(path.join(__dirname, '..', 'src', 'infra', 'schema.sql'), 'utf8'));
popularSeVazio();

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

test('Template Method (Repositorio): CRUD completo com ganchos', () => {
  const repo = new ClienteRepositorio();
  const criado = repo.salvar({ nome: 'Teste da Silva', cpf: '529.982.247-25', email: 't@t.com', interesse: 'Locação' });
  assert.ok(criado.id);
  const alterado = repo.salvar({ telefone: '(41) 90000-0000' }, criado.id);
  assert.equal(alterado.nome, 'Teste da Silva');
  assert.equal(alterado.telefone, '(41) 90000-0000');
  assert.throws(() => repo.salvar({ email: 'invalido' }, criado.id), ErroValidacao);
  repo.excluir(criado.id);
  assert.equal(repo.buscarPorId(criado.id), null);
});

test('Template Method (Repositorio): ganchos de regra de negócio', () => {
  const imovel = new ImovelRepositorio().salvar({
    titulo: 'Teste', tipo: 'Casa', finalidade: 'Venda', preco: 100000, cidade: 'Curitiba', uf: 'pr', proprietarioId: 1, corretorId: 1,
  });
  assert.match(imovel.codigo, /^HH-\d{4}$/);
  assert.equal(imovel.endereco.uf, 'PR');
  assert.throws(() => new ProprietarioRepositorio().excluir(1), ErroRegraNegocio);

  const proposta = new PropostaRepositorio().salvar({ imovelId: imovel.id, clienteId: 1, valor: 95000 });
  new PropostaRepositorio().salvar({ status: 'Aprovada' }, proposta.id);
  assert.equal(new ImovelRepositorio().buscarPorId(imovel.id).status, 'Reservado');
});

test('Template Method (Relatorio) + Strategy (Exportador)', () => {
  const csv = new RelatorioImoveis().gerar(new ExportadorCsv());
  assert.match(csv, /^﻿Código;Título/);
  const json = JSON.parse(new RelatorioImoveis().gerar(new ExportadorJson(), { status: 'Disponível' }));
  assert.ok(json.registros.every((r) => r.Status === 'Disponível'));
  assert.equal(exportadorPara('pdf'), null);
});

test('Strategy: comissão por modalidade', () => {
  assert.equal(new ComissaoVenda(6).calcular(500000), 30000);
  assert.equal(new ComissaoLocacao(1).calcular(2000), 2000);
});

test('Strategy: canais de notificação', () => {
  const pessoa = { email: 'a@b.com', telefone: '(41) 9' };
  assert.equal(new CanalEmail().destinatario(pessoa), 'a@b.com');
  assert.equal(new CanalWhatsApp().destinatario(pessoa), '(41) 9');
  assert.ok(new CanalSms().formatar('x'.repeat(300)).length <= 160);
  assert.ok(new NotificacaoRepositorio().listar().every((n) => n.canal === 'whatsapp'));
});
