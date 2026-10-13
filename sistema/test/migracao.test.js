// Banco SQLite no formato de antes das organizações (roda em processo próprio,
// porque o Database é um Singleton e o outro arquivo de testes usa :memory:).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const Database = require('../src/infra/Database');
const { criarAplicacao } = require('../src/app');
const { naOrganizacao } = require('../src/infra/ContextoOrganizacao');
const { SENHA_DEMO } = require('../src/infra/seed');
const ProprietarioRepositorio = require('../src/repositorios/ProprietarioRepositorio');
const OrganizacaoRepositorio = require('../src/repositorios/OrganizacaoRepositorio');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'habitahub-migracao-'));
const arquivo = path.join(pasta, 'antigo.db');

after(async () => {
  await Database.instancia().fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

function criarBancoAntigo() {
  const db = new DatabaseSync(arquivo);
  db.exec(`
    CREATE TABLE corretores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, telefone TEXT,
      creci TEXT NOT NULL UNIQUE, ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE proprietarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cpf TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
      telefone TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE imoveis (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, titulo TEXT NOT NULL, tipo TEXT NOT NULL,
      finalidade TEXT NOT NULL, preco REAL NOT NULL, area REAL, quartos INTEGER, cep TEXT, logradouro TEXT, numero TEXT,
      bairro TEXT, cidade TEXT NOT NULL, uf TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Disponível',
      proprietario_id INTEGER NOT NULL REFERENCES proprietarios(id), corretor_id INTEGER NOT NULL REFERENCES corretores(id),
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO corretores (nome, email, creci) VALUES ('Carla Mendes', 'carla@habitahub.demo', '12345-F/PR');
    INSERT INTO proprietarios (nome, cpf, email) VALUES ('João Pereira', '529.982.247-25', 'joao@x.com');
    INSERT INTO imoveis (codigo, titulo, tipo, finalidade, preco, cidade, uf, proprietario_id, corretor_id)
      VALUES ('HH-0001', 'Casa antiga', 'Casa', 'Venda', 100000, 'Curitiba', 'PR', 1, 1);
  `);
  db.close();
}

test('Migração: dados antigos vão para a organização padrão e o CPF passa a ser único por organização', async () => {
  criarBancoAntigo();
  const servidor = await criarAplicacao({ produto: 'completo', banco: arquivo });
  servidor.close();
  const db = Database.instancia();

  const organizacoes = await new OrganizacaoRepositorio().listar();
  assert.deepEqual(organizacoes.map((o) => o.nome), ['Lana Mayan Negócios Imobiliários']);
  for (const tabela of ['corretores', 'proprietarios', 'imoveis']) {
    assert.equal((await db.um(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM ${tabela} WHERE organizacao_id IS NULL`)).n, 0, tabela);
  }
  assert.equal((await db.um('SELECT administrador FROM corretores WHERE id = 1')).administrador, 1, 'a organização ganhou administrador');

  // A tabela foi recriada sem o UNIQUE antigo, com os dados e as chaves estrangeiras intactos.
  const outra = await new OrganizacaoRepositorio().salvar({ nome: 'Outra Imobiliária' });
  await naOrganizacao(outra.id, () => new ProprietarioRepositorio().salvar({ nome: 'João Pereira', cpf: '52998224725', email: 'joao@outra.com' }));
  await assert.rejects(naOrganizacao(organizacoes[0].id, () => new ProprietarioRepositorio().salvar({ nome: 'Repetido', cpf: '52998224725', email: 'r@x.com' })), /UNIQUE/);
  assert.equal((await db.um('SELECT titulo FROM imoveis WHERE proprietario_id = 1')).titulo, 'Casa antiga');
  assert.deepEqual(await db.todos('PRAGMA foreign_key_check'), []);

  // A conta antiga ganhou a senha de demonstração e entra na organização padrão.
  const { Autenticacao } = require('../src/seguranca/Autenticacao');
  const { usuario } = await new Autenticacao().entrar('carla@habitahub.demo', SENHA_DEMO);
  assert.equal(usuario.organizacao.nome, 'Lana Mayan Negócios Imobiliários');
});
