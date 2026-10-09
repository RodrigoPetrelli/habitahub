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
