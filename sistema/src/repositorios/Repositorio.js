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
// O SQL do CRUD fica escrito uma única vez, aqui.
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

  antesDeSalvar(entidade, anterior) {}

  depoisDeSalvar(entidade, anterior) {}

  antesDeExcluir(entidade) {}

  // Formato devolvido para a tela; pode acrescentar campos calculados.
  paraResposta(entidade) {
    return entidade;
  }

  // ---------- Operações fixas ----------
  listar() {
    return this.db.todos(`SELECT * FROM ${this.tabela()} ORDER BY ${this.ordenacao()}`)
      .map((linha) => this.modelo().deLinha(linha));
  }

  buscarPorId(id) {
    const linha = this.db.um(`SELECT * FROM ${this.tabela()} WHERE id = ?`, [Number(id)]);
    return linha ? this.modelo().deLinha(linha) : null;
  }

  buscarOuFalhar(id) {
    const entidade = this.buscarPorId(id);
    if (!entidade) throw new ErroNaoEncontrado();
    return entidade;
  }

  // TEMPLATE METHOD
  salvar(dadosBrutos, id = null) {
    const anterior = id == null ? null : this.buscarOuFalhar(id);
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

    return this.db.transacao(() => {
      this.antesDeSalvar(entidade, anterior);
      if (anterior) this.#atualizar(entidade);
      else entidade.id = this.#inserir(entidade);
      this.depoisDeSalvar(entidade, anterior);
      return this.buscarPorId(entidade.id);
    });
  }

  // TEMPLATE METHOD
  excluir(id) {
    const entidade = this.buscarOuFalhar(id);
    this.antesDeExcluir(entidade);
    this.db.rodar(`DELETE FROM ${this.tabela()} WHERE id = ?`, [entidade.id]);
    return entidade;
  }

  // ---------- Apoio às subclasses ----------
  contar(tabela, condicao, parametros) {
    return this.db.um(`SELECT COUNT(*) AS n FROM ${tabela} WHERE ${condicao}`, parametros).n;
  }

  impedirSeUsado(tabela, coluna, id, mensagem) {
    if (this.contar(tabela, `${coluna} = ?`, [id]) > 0) throw new ErroRegraNegocio(mensagem);
  }

  #inserir(entidade) {
    const linha = entidade.paraLinha();
    const colunas = Object.keys(linha);
    const sql = `INSERT INTO ${this.tabela()} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`;
    return Number(this.db.rodar(sql, Object.values(linha)).lastInsertRowid);
  }

  #atualizar(entidade) {
    const linha = entidade.paraLinha();
    const colunas = Object.keys(linha);
    const sql = `UPDATE ${this.tabela()} SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
    this.db.rodar(sql, [...Object.values(linha), entidade.id]);
  }
}

module.exports = Repositorio;
