// Relatórios concretos: cada um implementa só os passos do Template Method
// definido em Relatorio.gerar().
const Relatorio = require('./Relatorio');
const ImovelRepositorio = require('../repositorios/ImovelRepositorio');
const VisitaRepositorio = require('../repositorios/VisitaRepositorio');
const PropostaRepositorio = require('../repositorios/PropostaRepositorio');
const ProprietarioRepositorio = require('../repositorios/ProprietarioRepositorio');
const CorretorRepositorio = require('../repositorios/CorretorRepositorio');
const ClienteRepositorio = require('../repositorios/ClienteRepositorio');
const { estrategiaComissaoPara } = require('../estrategias/comissao');

const indexar = (lista) => new Map(lista.map((x) => [x.id, x]));

class RelatorioImoveis extends Relatorio {
  titulo() {
    return 'Carteira de imóveis';
  }

  buscarDados() {
    this.proprietarios = indexar(new ProprietarioRepositorio().listar());
    this.corretores = indexar(new CorretorRepositorio().listar());
    return new ImovelRepositorio().listar();
  }

  filtrar(imoveis, { status }) {
    return status ? imoveis.filter((i) => i.status === status) : imoveis;
  }

  colunas() {
    return ['Código', 'Título', 'Finalidade', 'Status', 'Preço', 'Preço/m²', 'Endereço', 'Proprietário', 'Corretor'];
  }

  formatarLinha(i) {
    return [
      i.codigo, i.titulo, i.finalidade, i.status, Relatorio.moeda(i.preco), Relatorio.moeda(i.precoPorM2()),
      i.endereco.formatado(), this.proprietarios.get(i.proprietarioId)?.nome, this.corretores.get(i.corretorId)?.nome,
    ];
  }

  resumo(imoveis) {
    const disponiveis = imoveis.filter((i) => i.estaDisponivel());
    return {
      'Total de imóveis': imoveis.length,
      Disponíveis: disponiveis.length,
      'Valor da carteira disponível': Relatorio.moeda(disponiveis.reduce((s, i) => s + i.preco, 0)),
    };
  }
}

class RelatorioVisitas extends Relatorio {
  titulo() {
    return 'Visitas e feedbacks';
  }

  buscarDados() {
    this.imoveis = indexar(new ImovelRepositorio().listar());
    this.clientes = indexar(new ClienteRepositorio().listar());
    this.corretores = indexar(new CorretorRepositorio().listar());
    return new VisitaRepositorio().listar();
  }

  filtrar(visitas, { status }) {
    return status ? visitas.filter((v) => v.status === status) : visitas;
  }

  colunas() {
    return ['Data', 'Imóvel', 'Cliente', 'Corretor', 'Status', 'Feedback'];
  }

  formatarLinha(v) {
    return [
      Relatorio.dataHora(v.dataHora), this.imoveis.get(v.imovelId)?.codigo, this.clientes.get(v.clienteId)?.nome,
      this.corretores.get(v.corretorId)?.nome, v.status, v.feedback,
    ];
  }

  resumo(visitas) {
    const realizadas = visitas.filter((v) => v.status === 'Realizada').length;
    return {
      'Total de visitas': visitas.length,
      Realizadas: realizadas,
      'Taxa de realização': visitas.length ? `${Math.round((realizadas / visitas.length) * 100)}%` : '–',
    };
  }
}

class RelatorioPropostas extends Relatorio {
  titulo() {
    return 'Propostas e comissões estimadas';
  }

  buscarDados() {
    this.imoveis = indexar(new ImovelRepositorio().listar());
    this.clientes = indexar(new ClienteRepositorio().listar());
    return new PropostaRepositorio().listar();
  }

  filtrar(propostas, { status }) {
    return status ? propostas.filter((p) => p.status === status) : propostas;
  }

  colunas() {
    return ['Imóvel', 'Cliente', 'Status', 'Valor ofertado', 'Valor negociado', '% do preço', 'Comissão estimada', 'Regra'];
  }

  #comissao(p) {
    const imovel = this.imoveis.get(p.imovelId);
    const estrategia = estrategiaComissaoPara(imovel?.finalidade);
    return { valor: p.calcularComissao(estrategia), regra: estrategia.descricao(), imovel };
  }

  formatarLinha(p) {
    const { valor, regra, imovel } = this.#comissao(p);
    const pct = imovel ? p.percentualDoPreco(imovel.preco) : null;
    return [
      imovel?.codigo, this.clientes.get(p.clienteId)?.nome, p.status, Relatorio.moeda(p.valor),
      Relatorio.moeda(p.valorNegociado()), pct == null ? '' : `${pct}%`, Relatorio.moeda(valor), regra,
    ];
  }

  resumo(propostas) {
    const aprovadas = propostas.filter((p) => p.status === 'Aprovada');
    return {
      'Total de propostas': propostas.length,
      Aprovadas: aprovadas.length,
      'Comissão das aprovadas': Relatorio.moeda(aprovadas.reduce((s, p) => s + this.#comissao(p).valor, 0)),
    };
  }
}

module.exports = { RelatorioImoveis, RelatorioVisitas, RelatorioPropostas };
