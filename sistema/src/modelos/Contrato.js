const MES_MS = 30 * 24 * 3600 * 1000;

// Contrato gerado a partir de uma proposta aprovada. Ainda não é persistido:
// a tabela entra na próxima etapa do projeto.
class Contrato {
  constructor({ numero, propostaId, imovelId, tipo, valor, inicio = new Date(), termino = null } = {}) {
    this.numero = numero;
    this.propostaId = propostaId;
    this.imovelId = imovelId;
    this.tipo = tipo;
    this.valor = valor;
    this.inicio = inicio;
    this.termino = termino;
    this.assinaturas = [];
  }

  static aPartirDaProposta(proposta, imovel, numero, mesesLocacao = 30) {
    if (proposta.status !== 'Aprovada') throw new Error('Só propostas aprovadas geram contrato.');
    const inicio = new Date();
    const termino = imovel.finalidade === 'Locação' ? new Date(inicio.getTime() + mesesLocacao * MES_MS) : null;
    return new Contrato({ numero, propostaId: proposta.id, imovelId: imovel.id, tipo: imovel.finalidade, valor: proposta.valorNegociado(), inicio, termino });
  }

  adicionarAssinatura(nome, papel) {
    this.assinaturas.push({ nome, papel, data: new Date() });
  }

  estaAssinadoPor(papeis) {
    return papeis.every((p) => this.assinaturas.some((a) => a.papel === p));
  }

  duracaoEmMeses() {
    return this.termino ? Math.round((this.termino - this.inicio) / MES_MS) : null;
  }
}

module.exports = Contrato;
