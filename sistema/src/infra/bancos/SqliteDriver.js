const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// SQLite embutido no processo: usado sem Docker e nos testes.
class SqliteDriver {
  dialeto = 'sqlite';

  #arquivo;
  #conexao = null;
  // O SQLite tem uma conexão só: as transações entram em fila.
  #fila = Promise.resolve();

  constructor(arquivo) {
    this.#arquivo = arquivo;
  }

  get descricao() {
    return `SQLite (${this.#arquivo})`;
  }

  async conectar() {
    if (this.#arquivo !== ':memory:') fs.mkdirSync(path.dirname(this.#arquivo), { recursive: true });
    this.#conexao = new DatabaseSync(this.#arquivo);
    this.#conexao.exec('PRAGMA foreign_keys = ON;');
  }

  async executar(sql) {
    this.#conexao.exec(sql);
  }

  async consultar(sql, parametros) {
    return this.#conexao.prepare(sql).all(...parametros);
  }

  async rodar(sql, parametros) {
    return { alteradas: Number(this.#conexao.prepare(sql).run(...parametros).changes) };
  }

  // O SQLite não apaga o UNIQUE de uma coluna: a tabela é recriada sem ele, com os
  // mesmos dados (roteiro de sqlite.org/lang_altertable.html). Sem UNIQUE, não faz nada.
  async removerUnico(tabela, coluna) {
    const { sql } = this.#conexao.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabela);
    const restricao = new RegExp(`([(,]\\s*${coluna}\\s[^,]*?)\\s+UNIQUE\\b`);
    if (!restricao.test(sql)) return;
    const nova = sql.replace(restricao, '$1').replace(/^CREATE TABLE[^(]*\(/, `CREATE TABLE ${tabela}_nova (`);
    this.#conexao.exec('PRAGMA foreign_keys = OFF;');
    try {
      this.#conexao.exec(`BEGIN; ${nova}; INSERT INTO ${tabela}_nova SELECT * FROM ${tabela}; DROP TABLE ${tabela}; ALTER TABLE ${tabela}_nova RENAME TO ${tabela}; COMMIT;`);
    } catch (e) {
      try { this.#conexao.exec('ROLLBACK'); } catch { /* a falha veio antes do BEGIN */ }
      throw e;
    } finally {
      this.#conexao.exec('PRAGMA foreign_keys = ON;');
    }
  }

  async abrirTransacao() {
    let liberar;
    const vez = this.#fila;
    this.#fila = new Promise((r) => { liberar = r; });
    await vez;
    this.#conexao.exec('BEGIN');
    const fim = (sql) => async () => {
      try { this.#conexao.exec(sql); } finally { liberar(); }
    };
    return {
      consultar: (sql, p) => this.consultar(sql, p),
      rodar: (sql, p) => this.rodar(sql, p),
      confirmar: fim('COMMIT'),
      desfazer: fim('ROLLBACK'),
    };
  }

  async fechar() {
    this.#conexao.close();
  }
}

module.exports = SqliteDriver;
