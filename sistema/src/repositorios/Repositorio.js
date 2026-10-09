const Database = require('../infra/Database');
const { organizacaoAtual } = require('../infra/ContextoOrganizacao');
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
//
// Cada registro pertence a uma organização (coluna organizacao_id). O SQL daqui
// filtra todas as leituras e gravações pela organização ativa (ContextoOrganizacao),
// então nenhuma subclasse consegue ler ou alterar dados de outra organização.
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

  // false = tabela do sistema inteiro, sem organizacao_id (a própria tabela organizacoes).
  porOrganizacao() {
    return true;
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
    const { condicao, parametros } = this.#daOrganizacao();
    const linhas = await this.db.todos(`SELECT * FROM ${this.tabela()} WHERE ${condicao} ORDER BY ${this.ordenacao()}`, parametros);
    return linhas.map((linha) => this.modelo().deLinha(linha));
  }

  async buscarPorId(id) {
    const numero = Number(id);
    if (!Number.isInteger(numero)) return null;
    const { condicao, parametros } = this.#daOrganizacao();
    const linha = await this.db.um(`SELECT * FROM ${this.tabela()} WHERE id = ? AND ${condicao}`, [numero, ...parametros]);
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
    const { condicao, parametros } = this.#daOrganizacao();
    await this.db.rodar(`DELETE FROM ${this.tabela()} WHERE id = ? AND ${condicao}`, [entidade.id, ...parametros]);
    return entidade;
  }

  // ---------- Apoio às subclasses ----------
  async contar(tabela, condicao, parametros) {
    return (await this.db.um(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM ${tabela} WHERE ${condicao}`, parametros)).n;
  }

  async impedirSeUsado(tabela, coluna, id, mensagem) {
    if (await this.contar(tabela, `${coluna} = ?`, [id]) > 0) throw new ErroRegraNegocio(mensagem);
  }

  // Filtro da organização ativa. Sem organização ativa, organizacaoAtual() lança erro.
  #daOrganizacao() {
    return this.porOrganizacao()
      ? { condicao: 'organizacao_id = ?', parametros: [organizacaoAtual()] }
      : { condicao: '1 = 1', parametros: [] };
  }

  // RETURNING funciona no PostgreSQL e no SQLite (3.35+).
  async #inserir(entidade) {
    const linha = this.porOrganizacao() ? { ...entidade.paraLinha(), organizacao_id: organizacaoAtual() } : entidade.paraLinha();
    const colunas = Object.keys(linha);
    const sql = `INSERT INTO ${this.tabela()} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')}) RETURNING id`;
    return Number((await this.db.um(sql, Object.values(linha))).id);
  }

  async #atualizar(entidade) {
    const linha = entidade.paraLinha();
    const colunas = Object.keys(linha);
    const { condicao, parametros } = this.#daOrganizacao();
    const sql = `UPDATE ${this.tabela()} SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND ${condicao}`;
    await this.db.rodar(sql, [...Object.values(linha), entidade.id, ...parametros]);
  }
}

module.exports = Repositorio;
