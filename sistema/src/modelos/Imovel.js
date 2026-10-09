const Endereco = require('./Endereco');

const numeroOuNulo = (v) => (v == null || v === '' ? null : Number(v));

class Imovel {
  static STATUS = ['Disponível', 'Reservado', 'Vendido', 'Alugado', 'Inativo'];
  static STATUS_INICIAIS = ['Disponível', 'Inativo'];
  static TIPOS = ['Apartamento', 'Casa', 'Terreno', 'Sala comercial'];

  constructor(dados = {}) {
    this.id = dados.id ?? null;
    this.codigo = dados.codigo || '';
    this.titulo = dados.titulo || '';
    this.tipo = dados.tipo || 'Apartamento';
    this.finalidade = dados.finalidade || 'Venda';
    this.preco = Number(dados.preco) || 0;
    this.area = numeroOuNulo(dados.area);
    this.quartos = numeroOuNulo(dados.quartos);
    this.endereco = dados.endereco instanceof Endereco ? dados.endereco : new Endereco(dados);
    this.status = dados.status || 'Disponível';
    this.proprietarioId = numeroOuNulo(dados.proprietarioId);
    this.corretorId = numeroOuNulo(dados.corretorId);
    this.criadoEm = dados.criadoEm || null;
  }

  estaDisponivel() {
    return this.status === 'Disponível';
  }

  precoPorM2() {
    return this.area ? Math.round((this.preco / this.area) * 100) / 100 : null;
  }

  reservar() {
    if (!this.estaDisponivel()) throw new Error(`Imóvel ${this.codigo} não está disponível.`);
    this.status = 'Reservado';
  }

  concluirNegocio() {
    this.status = this.finalidade === 'Locação' ? 'Alugado' : 'Vendido';
  }

  inativar() {
    this.status = 'Inativo';
  }

  static deLinha(l) {
    return new Imovel({
      id: l.id, codigo: l.codigo, titulo: l.titulo, tipo: l.tipo, finalidade: l.finalidade,
      preco: l.preco, area: l.area, quartos: l.quartos,
      cep: l.cep, logradouro: l.logradouro, numero: l.numero, bairro: l.bairro, cidade: l.cidade, uf: l.uf,
      status: l.status, proprietarioId: l.proprietario_id, corretorId: l.corretor_id, criadoEm: l.criado_em,
    });
  }

  paraLinha() {
    const e = this.endereco;
    return {
      codigo: this.codigo, titulo: this.titulo, tipo: this.tipo, finalidade: this.finalidade,
      preco: this.preco, area: this.area, quartos: this.quartos,
      cep: e.cep, logradouro: e.logradouro, numero: e.numero, bairro: e.bairro, cidade: e.cidade, uf: e.uf,
      status: this.status, proprietario_id: this.proprietarioId, corretor_id: this.corretorId,
    };
  }

  // O endereço sai "achatado" no JSON para preencher o formulário da tela.
  toJSON() {
    const { endereco, ...resto } = this;
    return { ...resto, ...endereco, enderecoFormatado: endereco.formatado(), precoPorM2: this.precoPorM2() };
  }
}

module.exports = Imovel;
