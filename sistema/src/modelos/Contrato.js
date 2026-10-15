const MES_MS = 30 * 24 * 3600 * 1000;

const numeroOuNulo = (v) => (v == null || v === '' ? null : Number(v));
// Data local (o toISOString daria a data em UTC, que vira o dia às 21h no Brasil).
const hoje = () => new Date().toLocaleDateString('sv-SE');
const somarMeses = (data, meses) => new Date(new Date(data).getTime() + meses * MES_MS).toISOString().slice(0, 10);

// Contrato gerado a partir de uma proposta aprovada. As datas ficam no formato
// AAAA-MM-DD. O negócio só se fecha quando as três partes assinam.
class Contrato {
  static PAPEIS = ['Cliente', 'Proprietário', 'Imobiliária'];

  // Campo do formulário que marca a assinatura de cada papel.
  static CAMPO_DO_PAPEL = { Cliente: 'assinadoCliente', Proprietário: 'assinadoProprietario', Imobiliária: 'assinadoImobiliaria' };

  constructor(dados = {}) {
    this.id = dados.id ?? null;
    this.numero = dados.numero || '';
    this.propostaId = numeroOuNulo(dados.propostaId);
    this.imovelId = numeroOuNulo(dados.imovelId);
    this.tipo = dados.tipo || '';
    this.valor = Number(dados.valor) || 0;
    this.inicio = dados.inicio || hoje();
    this.termino = dados.termino || null;
    this.assinaturas = typeof dados.assinaturas === 'string' ? JSON.parse(dados.assinaturas) : [...(dados.assinaturas || [])];
    // O formulário manda uma caixa por papel: marcada assina, desmarcada retira.
    for (const papel of Contrato.PAPEIS) {
      const marcado = dados[Contrato.CAMPO_DO_PAPEL[papel]];
      if (marcado === undefined) continue;
      if (marcado && !this.assinadoPor(papel)) this.adicionarAssinatura(papel);
      if (!marcado) this.assinaturas = this.assinaturas.filter((a) => a.papel !== papel);
    }
    this.criadoEm = dados.criadoEm || null;
  }

  static aPartirDaProposta(proposta, imovel, numero, mesesLocacao = 30, inicio = hoje()) {
    if (proposta.status !== 'Aprovada') throw new Error('Só propostas aprovadas geram contrato.');
    const termino = imovel.finalidade === 'Locação' ? somarMeses(inicio, mesesLocacao) : null;
    return new Contrato({ numero, propostaId: proposta.id, imovelId: imovel.id, tipo: imovel.finalidade, valor: proposta.valorNegociado(), inicio, termino });
  }

  adicionarAssinatura(papel, nome = '') {
    this.assinaturas.push({ papel, nome, data: hoje() });
  }

  assinadoPor(papel) {
    return this.assinaturas.some((a) => a.papel === papel);
  }

  estaAssinadoPor(papeis) {
    return papeis.every((p) => this.assinadoPor(p));
  }

  estaCompleto() {
    return this.estaAssinadoPor(Contrato.PAPEIS);
  }

  status() {
    return this.estaCompleto() ? 'Assinado' : 'Aguardando assinaturas';
  }

  duracaoEmMeses() {
    return this.termino ? Math.round((new Date(this.termino) - new Date(this.inicio)) / MES_MS) : null;
  }

  static deLinha(l) {
    return new Contrato({
      id: l.id, numero: l.numero, propostaId: l.proposta_id, imovelId: l.imovel_id, tipo: l.tipo, valor: l.valor,
      inicio: l.inicio, termino: l.termino, assinaturas: l.assinaturas, criadoEm: l.criado_em,
    });
  }

  paraLinha() {
    return {
      numero: this.numero, proposta_id: this.propostaId, imovel_id: this.imovelId, tipo: this.tipo, valor: this.valor,
      inicio: this.inicio, termino: this.termino, assinaturas: JSON.stringify(this.assinaturas),
    };
  }
}

module.exports = Contrato;
