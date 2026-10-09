const Database = require('../infra/Database');
const { ErroValidacao, ErroNaoEncontrado, ErroRegraNegocio } = require('../infra/erros');

// PADRÃO TEMPLATE METHOD (exemplo 2 de 3)
// salvar() e excluir() definem o fluxo de gravação de qualquer tabela:
//
//   salvar(dados, id):  buscar o registro atual → mesclar → validar → criar a entidade
//                       → antesDeSalvar() → INSERT ou UPDATE → depoisDeSalvar()
//   excluir(id):        buscar → antesDeExcluir() → DELETE
//
// As subclasses informam tabela(), modelo() e validador() e, se precisarem,
// usam os ganchos antesDeSalvar, depoisDeSalvar, antesDeExcluir e paraResposta.
// O SQL do CRUD fica escrito uma única vez, aqui, e serve ao SQLite e ao PostgreSQL.
class Repositorio {
  constructor() {
    this.db = Database.instancia();
  }

  // ---------- Passos abstratos ----------
  tabela() {
    throw new Error(`${this.constructor.name} precisa implementar tabela().`);
  }

  modelo() {
    throw new Error(`${this.constructor.name} precisa implementar modelo().`);
  }

  validador() {
    throw new Error(`${this.constructor.name} precisa implementar validador().`);
  }

  // ---------- Ganchos (padrão: não fazem nada) ----------
  ordenacao() {
    return 'id DESC';
  }

  async antesDeSalvar(entidade, anterior) {}

  async depoisDeSalvar(entidade, anterior) {}

  async antesDeExcluir(entidade) {}

  // Formato devolvido para a tela; pode acrescentar campos calculados.
  async paraResposta(entidade) {
    return entidade;
  }

  // ---------- Operações fixas ----------
  async listar() {
    const linhas = await this.db.todos(`SELECT * FROM ${this.tabela()} ORDER BY ${this.ordenacao()}`);
    return linhas.map((linha) => this.modelo().deLinha(linha));
  }

  async buscarPorId(id) {
    const numero = Number(id);
    if (!Number.isInteger(numero)) return null;
    const linha = await this.db.um(`SELECT * FROM ${this.tabela()} WHERE id = ?`, [numero]);
    return linha ? this.modelo().deLinha(linha) : null;
  }

  async buscarOuFalhar(id) {
    const entidade = await this.buscarPorId(id);
    if (!entidade) throw new ErroNaoEncontrado();
    return entidade;
  }

  // TEMPLATE METHOD
  async salvar(dadosBrutos, id = null) {
    const anterior = id == null ? null : await this.buscarOuFalhar(id);
    const mesclados = anterior ? { ...JSON.parse(JSON.stringify(anterior)), ...dadosBrutos } : { ...dadosBrutos };

    const validador = this.validador();
    let dados = mesclados;
    if (validador) {
      const resultado = validador.validar(mesclados);
      if (!resultado.valido) throw new ErroValidacao(resultado.erros);
      dados = resultado.dados;
    }

    const Modelo = this.modelo();
    const entidade = new Modelo({ ...dados, id: anterior ? anterior.id : null });

    return this.db.transacao(async () => {
      await this.antesDeSalvar(entidade, anterior);
      if (anterior) await this.#atualizar(entidade);
      else entidade.id = await this.#inserir(entidade);
      await this.depoisDeSalvar(entidade, anterior);
      return this.buscarPorId(entidade.id);
    });
  }

  // TEMPLATE METHOD
  async excluir(id) {
    const entidade = await this.buscarOuFalhar(id);
    await this.antesDeExcluir(entidade);
    await this.db.rodar(`DELETE FROM ${this.tabela()} WHERE id = ?`, [entidade.id]);
    return entidade;
  }

  // ---------- Apoio às subclasses ----------
  async contar(tabela, condicao, parametros) {
    return (await this.db.um(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM ${tabela} WHERE ${condicao}`, parametros)).n;
  }

  async impedirSeUsado(tabela, coluna, id, mensagem) {
    if (await this.contar(tabela, `${coluna} = ?`, [id]) > 0) throw new ErroRegraNegocio(mensagem);
  }

  // RETURNING funciona no PostgreSQL e no SQLite (3.35+).
  async #inserir(entidade) {
    const linha = entidade.paraLinha();
    const colunas = Object.keys(linha);
    const sql = `INSERT INTO ${this.tabela()} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')}) RETURNING id`;
    return Number((await this.db.um(sql, Object.values(linha))).id);
  }

  async #atualizar(entidade) {
    const linha = entidade.paraLinha();
    const colunas = Object.keys(linha);
    const sql = `UPDATE ${this.tabela()} SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
    await this.db.rodar(sql, [...Object.values(linha), entidade.id]);
  }
}

module.exports = Repositorio;
