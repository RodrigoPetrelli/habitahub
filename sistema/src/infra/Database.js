const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs');
const path = require('node:path');
const SqliteDriver = require('./bancos/SqliteDriver');
const PostgresDriver = require('./bancos/PostgresDriver');

// PADRÃO SINGLETON (exemplo 1 de 2)
// Um único ponto de acesso ao banco para todo o processo. Os repositórios pedem
// Database.instancia() e compartilham o mesmo driver: o pool do PostgreSQL
// (container "banco" no docker compose) ou o arquivo SQLite local.
class Database {
  // Tabelas cujos registros pertencem a uma organização (coluna organizacao_id).
  static TABELAS_DA_ORGANIZACAO = ['corretores', 'proprietarios', 'clientes', 'imoveis', 'visitas', 'propostas', 'notificacoes', 'contratos', 'avaliacoes'];

  static #instancia = null;
  static #chave = Symbol('Database');

  #driver = null;
  // Guarda a conexão da transação aberta para as consultas feitas dentro dela.
  #transacaoAtual = new AsyncLocalStorage();

  constructor(chave) {
    if (chave !== Database.#chave) {
      throw new Error('Use Database.instancia() em vez de new Database().');
    }
  }

  static instancia() {
    if (!Database.#instancia) Database.#instancia = new Database(Database.#chave);
    return Database.#instancia;
  }

  // "postgres://..." usa o PostgreSQL; qualquer outro valor é um arquivo SQLite (ou ":memory:").
  async conectar(endereco) {
    if (this.#driver) return this;
    this.#driver = /^postgres(ql)?:\/\//.test(endereco) ? new PostgresDriver(endereco) : new SqliteDriver(endereco);
    await this.#driver.conectar();
    const schema = path.join(__dirname, `schema.${this.#driver.dialeto}.sql`);
    await this.#driver.executar(fs.readFileSync(schema, 'utf8'));
    await this.#migrar();
    return this;
  }

  // Bancos criados antes de uma coluna existir não passam pelo CREATE TABLE de
  // novo: aqui a coluna é acrescentada. Se ela já existe, o ALTER falha e é ignorado.
  // Os registros antigos, sem organização, são adotados por seed.adotarDadosSemOrganizacao().
  async #migrar() {
    const colunas = [
      ['corretores', 'senha_hash', 'TEXT'],
      ['corretores', 'aguardando_aprovacao', 'INTEGER NOT NULL DEFAULT 0'],
      ['corretores', 'administrador', 'INTEGER NOT NULL DEFAULT 0'],
      ...Database.TABELAS_DA_ORGANIZACAO.map((tabela) => [tabela, 'organizacao_id', 'INTEGER REFERENCES organizacoes(id)']),
    ];
    for (const [tabela, coluna, tipo] of colunas) {
      try {
        await this.#driver.executar(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
      } catch (e) {
        if (!/duplicate column|already exists/i.test(e.message)) throw e;
      }
    }
    // CPF e código do imóvel eram únicos no banco inteiro; agora são únicos dentro
    // da organização (duas imobiliárias podem atender o mesmo proprietário).
    for (const [tabela, coluna] of [['proprietarios', 'cpf'], ['clientes', 'cpf'], ['imoveis', 'codigo']]) {
      await this.#driver.removerUnico(tabela, coluna);
      await this.#driver.executar(`CREATE UNIQUE INDEX IF NOT EXISTS ${tabela}_organizacao_${coluna} ON ${tabela} (organizacao_id, ${coluna})`);
    }
  }

  get descricao() {
    return this.#driver ? this.#driver.descricao : 'desconectado';
  }

  #executor() {
    if (!this.#driver) throw new Error('Banco não conectado. Chame conectar() na inicialização.');
    return this.#transacaoAtual.getStore() || this.#driver;
  }

  async todos(sql, parametros = []) {
    return this.#executor().consultar(sql, parametros);
  }

  async um(sql, parametros = []) {
    return (await this.#executor().consultar(sql, parametros))[0] || null;
  }

  async rodar(sql, parametros = []) {
    return this.#executor().rodar(sql, parametros);
  }

  // Reentrante: uma gravação feita dentro de outra (ex.: a notificação enviada
  // no depoisDeSalvar) entra na transação que já está aberta.
  async transacao(fn) {
    if (this.#transacaoAtual.getStore()) return fn();
    const conexao = await this.#executor().abrirTransacao();
    try {
      const resultado = await this.#transacaoAtual.run(conexao, fn);
      await conexao.confirmar();
      return resultado;
    } catch (e) {
      await conexao.desfazer();
      throw e;
    }
  }

  async fechar() {
    if (this.#driver) await this.#driver.fechar();
    this.#driver = null;
  }
}

module.exports = Database;
