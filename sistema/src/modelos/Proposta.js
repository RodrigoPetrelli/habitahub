const numeroOuNulo = (v) => (v == null || v === '' ? null : Number(v));

class Proposta {
  static STATUS = ['Em análise', 'Aprovada', 'Recusada', 'Contraproposta'];

  constructor(dados = {}) {
    this.id = dados.id ?? null;
    this.imovelId = numeroOuNulo(dados.imovelId);
    this.clienteId = numeroOuNulo(dados.clienteId);
    this.valor = Number(dados.valor) || 0;
    this.condicoes = dados.condicoes || '';
    this.status = dados.status || 'Em análise';
    this.valorContraproposta = numeroOuNulo(dados.valorContraproposta);
    this.criadoEm = dados.criadoEm || null;
  }

  aprovar() {
    this.status = 'Aprovada';
  }

  recusar() {
    this.status = 'Recusada';
  }

  contrapropor(valor) {
    this.status = 'Contraproposta';
    this.valorContraproposta = Number(valor);
  }

  // Valor que vale para o negócio: a contraproposta, quando houver.
  valorNegociado() {
    return this.status === 'Contraproposta' && this.valorContraproposta ? this.valorContraproposta : this.valor;
  }

  percentualDoPreco(precoImovel) {
    return precoImovel ? Math.round((this.valorNegociado() / precoImovel) * 1000) / 10 : null;
  }

  // A regra de comissão vem de fora (padrão Strategy).
  calcularComissao(estrategiaComissao) {
    return estrategiaComissao.calcular(this.valorNegociado());
  }

  static deLinha(l) {
    return new Proposta({ id: l.id, imovelId: l.imovel_id, clienteId: l.cliente_id, valor: l.valor, condicoes: l.condicoes, status: l.status, valorContraproposta: l.valor_contraproposta, criadoEm: l.criado_em });
  }

  paraLinha() {
    return { imovel_id: this.imovelId, cliente_id: this.clienteId, valor: this.valor, condicoes: this.condicoes, status: this.status, valor_contraproposta: this.valorContraproposta };
  }
}

module.exports = Proposta;
