const Usuario = require('./Usuario');

class Corretor extends Usuario {
  constructor(dados = {}) {
    super(dados);
    this.creci = dados.creci || '';
    this.ativo = dados.ativo === undefined ? true : Boolean(Number(dados.ativo));
  }

  ativar() {
    this.ativo = true;
  }

  desativar() {
    this.ativo = false;
  }

  // CRECI no formato "12345-F/PR": a UF fica depois da barra.
  ufDoCreci() {
    const partes = this.creci.split('/');
    return partes.length > 1 ? partes[1].trim().toUpperCase() : null;
  }

  podeAtenderImoveis() {
    return this.ativo && this.creci !== '';
  }

  static deLinha(l) {
    return new Corretor({ id: l.id, nome: l.nome, email: l.email, telefone: l.telefone, creci: l.creci, ativo: l.ativo, criadoEm: l.criado_em });
  }

  paraLinha() {
    return { nome: this.nome, email: this.email, telefone: this.telefone, creci: this.creci, ativo: this.ativo ? 1 : 0 };
  }
}

module.exports = Corretor;
