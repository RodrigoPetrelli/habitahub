// Imobiliária ou corretor autônomo que usa o HabitaHub. Cada organização tem os
// seus corretores, imóveis, clientes etc. e um ou mais administradores.
class Organizacao {
  constructor({ id = null, nome = '', criadoEm = null } = {}) {
    this.id = id;
    this.nome = nome;
    this.criadoEm = criadoEm;
  }

  static deLinha(l) {
    return new Organizacao({ id: l.id, nome: l.nome, criadoEm: l.criado_em });
  }

  paraLinha() {
    return { nome: this.nome };
  }
}

module.exports = Organizacao;
