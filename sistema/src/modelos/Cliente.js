const Usuario = require('./Usuario');

class Cliente extends Usuario {
  constructor(dados = {}) {
    super(dados);
    this.cpf = dados.cpf || '';
    this.interesse = dados.interesse || 'Venda';
  }

  // O interesse do cliente usa os mesmos valores da finalidade do imóvel.
  combinaCom(imovel) {
    return imovel.finalidade === this.interesse && imovel.estaDisponivel();
  }

  static deLinha(l) {
    return new Cliente({ id: l.id, nome: l.nome, cpf: l.cpf, email: l.email, telefone: l.telefone, interesse: l.interesse, criadoEm: l.criado_em });
  }

  paraLinha() {
    return { nome: this.nome, cpf: this.cpf, email: this.email, telefone: this.telefone, interesse: this.interesse };
  }
}

module.exports = Cliente;
