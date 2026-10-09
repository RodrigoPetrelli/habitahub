class ErroAplicacao extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

class ErroValidacao extends ErroAplicacao {
  constructor(erros) {
    super('Há campos inválidos.', 422);
    this.erros = erros;
  }
}

class ErroNaoEncontrado extends ErroAplicacao {
  constructor(mensagem = 'Registro não encontrado.') {
    super(mensagem, 404);
  }
}

class ErroRegraNegocio extends ErroAplicacao {
  constructor(mensagem) {
    super(mensagem, 409);
  }
}

module.exports = { ErroAplicacao, ErroValidacao, ErroNaoEncontrado, ErroRegraNegocio };
