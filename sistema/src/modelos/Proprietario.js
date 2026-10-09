const Usuario = require('./Usuario');

class Proprietario extends Usuario {
  constructor(dados = {}) {
    super(dados);
    this.cpf = dados.cpf || '';
  }

  // Exibe só o começo e o fim do CPF (LGPD): 123.***.***-09
  cpfMascarado() {
    const f = Usuario.formatarCpf(this.cpf);
    return f.length === 14 ? `${f.slice(0, 3)}.***.***-${f.slice(12)}` : f;
  }

  possuiImoveis(imoveis) {
    return imoveis.some((i) => i.proprietarioId === this.id);
  }

  static deLinha(l) {
    return new Proprietario({ id: l.id, nome: l.nome, cpf: l.cpf, email: l.email, telefone: l.telefone, criadoEm: l.criado_em });
  }

  paraLinha() {
    return { nome: this.nome, cpf: this.cpf, email: this.email, telefone: this.telefone };
  }
}

module.exports = Proprietario;
