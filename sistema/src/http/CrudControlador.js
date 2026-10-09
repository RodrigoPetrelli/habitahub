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

  listar() {
    return { status: 200, corpo: this.repositorio.listar().map((e) => this.#resposta(e)) };
  }

  obter(id) {
    return { status: 200, corpo: this.#resposta(this.repositorio.buscarOuFalhar(id)) };
  }

  criar(dados) {
    return { status: 201, corpo: this.#resposta(this.repositorio.salvar(dados)) };
  }

  atualizar(id, dados) {
    return { status: 200, corpo: this.#resposta(this.repositorio.salvar(dados, id)) };
  }

  excluir(id) {
    this.repositorio.excluir(id);
    return { status: 204 };
  }
}

module.exports = CrudControlador;
