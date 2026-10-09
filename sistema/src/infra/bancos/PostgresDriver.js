const { Pool } = require('pg');

// PostgreSQL em servidor separado (container "banco" no docker compose).
// Os repositórios escrevem SQL com "?"; aqui os marcadores viram $1, $2, ...
const paraPostgres = (sql) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

class PostgresDriver {
  dialeto = 'postgres';

  #url;
  #pool = null;

  constructor(url) {
    this.#url = url;
  }

  get descricao() {
    const u = new URL(this.#url);
    return `PostgreSQL (${u.hostname}:${u.port || 5432}${u.pathname})`;
  }

  // O container do banco pode demorar alguns segundos para aceitar conexões.
  async conectar(tentativas = 15) {
    this.#pool = new Pool({ connectionString: this.#url, max: 10 });
    for (let i = 1; ; i++) {
      try {
        await this.#pool.query('SELECT 1');
        return;
      } catch (e) {
        if (i >= tentativas) throw new Error(`Não foi possível conectar ao PostgreSQL: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  async executar(sql) {
    await this.#pool.query(sql);
  }

  async consultar(sql, parametros) {
    return (await this.#pool.query(paraPostgres(sql), parametros)).rows;
  }

  async rodar(sql, parametros) {
    return { alteradas: (await this.#pool.query(paraPostgres(sql), parametros)).rowCount };
  }

  // O UNIQUE de coluna ganha o nome padrão <tabela>_<coluna>_key.
  async removerUnico(tabela, coluna) {
    await this.#pool.query(`ALTER TABLE ${tabela} DROP CONSTRAINT IF EXISTS ${tabela}_${coluna}_key`);
  }

  async abrirTransacao() {
    const cliente = await this.#pool.connect();
    await cliente.query('BEGIN');
    const fim = (sql) => async () => {
      try { await cliente.query(sql); } finally { cliente.release(); }
    };
    return {
      consultar: async (sql, p) => (await cliente.query(paraPostgres(sql), p)).rows,
      rodar: async (sql, p) => ({ alteradas: (await cliente.query(paraPostgres(sql), p)).rowCount }),
      confirmar: fim('COMMIT'),
      desfazer: fim('ROLLBACK'),
    };
  }

  async fechar() {
    await this.#pool.end();
  }
}

module.exports = PostgresDriver;
