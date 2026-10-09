// Controlador REST genérico: o mesmo código atende os 6 CRUDs. Cada recurso
// só entra com o seu repositório e, se precisar, com regras de permissão:
//   autorizacao.verificar(acao, { usuario, id, dados, repositorio })
// onde acao é 'listar', 'obter', 'criar', 'atualizar' ou 'excluir'. Para negar,
// verificar() lança um ErroAplicacao (403).
class CrudControlador {
  constructor(repositorio, autorizacao = null) {
    this.repositorio = repositorio;
    this.autorizacao = autorizacao;
  }

  registrar(roteador, recurso) {
    const base = `/api/${recurso}`;
    roteador
      .get(base, (req) => this.listar(req.usuario))
      .get(`${base}/:id`, (req, p) => this.obter(p.id, req.usuario))
      .post(base, (req) => this.criar(req.corpo, req.usuario))
      .put(`${base}/:id`, (req, p) => this.atualizar(p.id, req.corpo, req.usuario))
      .delete(`${base}/:id`, (req, p) => this.excluir(p.id, req.usuario));
  }

  async #autorizar(acao, usuario, id = null, dados = null) {
    await this.autorizacao?.verificar(acao, { usuario, id: id == null ? null : Number(id), dados, repositorio: this.repositorio });
  }

  #resposta(entidade) {
    return this.repositorio.paraResposta(entidade);
  }

  async listar(usuario) {
    await this.#autorizar('listar', usuario);
    const entidades = await this.repositorio.listar();
    return { status: 200, corpo: await Promise.all(entidades.map((e) => this.#resposta(e))) };
  }

  async obter(id, usuario) {
    await this.#autorizar('obter', usuario, id);
    return { status: 200, corpo: await this.#resposta(await this.repositorio.buscarOuFalhar(id)) };
  }

  async criar(dados, usuario) {
    await this.#autorizar('criar', usuario, null, dados);
    return { status: 201, corpo: await this.#resposta(await this.repositorio.salvar(dados)) };
  }

  async atualizar(id, dados, usuario) {
    await this.#autorizar('atualizar', usuario, id, dados);
    return { status: 200, corpo: await this.#resposta(await this.repositorio.salvar(dados, id)) };
  }

  async excluir(id, usuario) {
    await this.#autorizar('excluir', usuario, id);
    await this.repositorio.excluir(id);
    return { status: 204 };
  }
}

module.exports = CrudControlador;
