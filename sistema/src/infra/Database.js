const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// PADRÃO SINGLETON (exemplo 1 de 2)
// Uma única conexão com o SQLite para todo o processo. Os repositórios pedem
// Database.instancia() e compartilham a mesma conexão, sem abrir arquivos
// repetidos nem disputar travas do banco.
class Database {
  static #instancia = null;
  static #chave = Symbol('Database');

  #conexao = null;
  #arquivo = null;

  constructor(chave) {
    if (chave !== Database.#chave) {
      throw new Error('Use Database.instancia() em vez de new Database().');
    }
  }

  static instancia() {
    if (!Database.#instancia) Database.#instancia = new Database(Database.#chave);
    return Database.#instancia;
  }

  conectar(arquivo) {
    if (this.#conexao) return this;
    if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    this.#arquivo = arquivo;
    this.#conexao = new DatabaseSync(arquivo);
    this.#conexao.exec('PRAGMA foreign_keys = ON;');
    return this;
  }

  get conectado() {
    return this.#conexao !== null;
  }

  get arquivo() {
    return this.#arquivo;
  }

  #exigirConexao() {
    if (!this.#conexao) throw new Error('Banco não conectado. Chame conectar() na inicialização.');
    return this.#conexao;
  }

  executar(sql) {
    this.#exigirConexao().exec(sql);
  }

  todos(sql, parametros = []) {
    return this.#exigirConexao().prepare(sql).all(...parametros);
  }

  um(sql, parametros = []) {
    return this.#exigirConexao().prepare(sql).get(...parametros) || null;
  }

  rodar(sql, parametros = []) {
    return this.#exigirConexao().prepare(sql).run(...parametros);
  }

  // Reentrante: uma gravação feita dentro de outra (ex.: a notificação enviada
  // no depoisDeSalvar) entra na transação que já está aberta.
  transacao(fn) {
    const conexao = this.#exigirConexao();
    if (conexao.isTransaction) return fn();
    conexao.exec('BEGIN');
    try {
      const resultado = fn();
      conexao.exec('COMMIT');
      return resultado;
    } catch (e) {
      conexao.exec('ROLLBACK');
      throw e;
    }
  }

  fechar() {
    if (this.#conexao) this.#conexao.close();
    this.#conexao = null;
  }
}

module.exports = Database;
