// Controlador REST genérico: o mesmo código atende os 6 CRUDs. Cada recurso
// só entra com o seu repositório.
class CrudControlador {
  constructor(repositorio) {
    this.repositorio = repositorio;
  }

  registrar(roteador, recurso) {
    const base = `/api/${recurso}`;
    roteador
      .get(base, () => this.listar())
      .get(`${base}/:id`, (_, p) => this.obter(p.id))
      .post(base, (req) => this.criar(req.corpo))
      .put(`${base}/:id`, (req, p) => this.atualizar(p.id, req.corpo))
      .delete(`${base}/:id`, (_, p) => this.excluir(p.id));
  }

  #resposta(entidade) {
    return this.repositorio.paraResposta(entidade);
  }

  async listar() {
    const entidades = await this.repositorio.listar();
    return { status: 200, corpo: await Promise.all(entidades.map((e) => this.#resposta(e))) };
  }

  async obter(id) {
    return { status: 200, corpo: await this.#resposta(await this.repositorio.buscarOuFalhar(id)) };
  }

  async criar(dados) {
    return { status: 201, corpo: await this.#resposta(await this.repositorio.salvar(dados)) };
  }

  async atualizar(id, dados) {
    return { status: 200, corpo: await this.#resposta(await this.repositorio.salvar(dados, id)) };
  }

  async excluir(id) {
    await this.repositorio.excluir(id);
    return { status: 204 };
  }
}

module.exports = CrudControlador;
