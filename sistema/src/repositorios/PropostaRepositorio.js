const Repositorio = require('./Repositorio');
const Proposta = require('../modelos/Proposta');
const { ValidadorProposta } = require('../validacao/validadores');
const { Notificador } = require('../estrategias/notificacao');
const { estrategiaComissaoPara } = require('../estrategias/comissao');
const { ErroRegraNegocio } = require('../infra/erros');
const ImovelRepositorio = require('./ImovelRepositorio');
const ClienteRepositorio = require('./ClienteRepositorio');
const ProprietarioRepositorio = require('./ProprietarioRepositorio');

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

class PropostaRepositorio extends Repositorio {
  tabela() {
    return 'propostas';
  }

  modelo() {
    return Proposta;
  }

  validador() {
    return new ValidadorProposta();
  }

  antesDeSalvar(proposta, anterior) {
    const imovel = new ImovelRepositorio().buscarPorId(proposta.imovelId);
    if (!imovel) throw new ErroRegraNegocio('Imóvel não encontrado.');
    if (!anterior && !imovel.estaDisponivel()) {
      throw new ErroRegraNegocio(`O imóvel ${imovel.codigo} está "${imovel.status}" e não aceita propostas.`);
    }
    if (proposta.status !== 'Contraproposta') proposta.valorContraproposta = null;
  }

  depoisDeSalvar(proposta, anterior) {
    const imoveis = new ImovelRepositorio();
    const imovel = imoveis.buscarPorId(proposta.imovelId);
    const notificador = Notificador.doProduto();

    if (!anterior) {
      const proprietario = new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId);
      notificador.enviar(proprietario, `Nova proposta de ${brl(proposta.valor)} para o imóvel ${imovel.codigo}.`);
      return;
    }
    if (anterior.status !== proposta.status) {
      const cliente = new ClienteRepositorio().buscarPorId(proposta.clienteId);
      const extra = proposta.status === 'Contraproposta' ? ` Valor proposto: ${brl(proposta.valorContraproposta)}.` : '';
      notificador.enviar(cliente, `Sua proposta para o imóvel ${imovel.codigo} mudou para "${proposta.status}".${extra}`);
    }
    // Proposta aprovada reserva o imóvel (regra do modelo Imovel).
    if (proposta.status === 'Aprovada' && imovel.estaDisponivel()) {
      imovel.reservar();
      this.db.rodar('UPDATE imoveis SET status = ? WHERE id = ?', [imovel.status, imovel.id]);
    }
  }

  // Acrescenta a comissão estimada, calculada pela estratégia da modalidade.
  paraResposta(proposta) {
    const imovel = new ImovelRepositorio().buscarPorId(proposta.imovelId);
    const estrategia = estrategiaComissaoPara(imovel?.finalidade);
    return {
      ...proposta,
      valorNegociado: proposta.valorNegociado(),
      percentualDoPreco: imovel ? proposta.percentualDoPreco(imovel.preco) : null,
      comissaoEstimada: proposta.calcularComissao(estrategia),
      regraComissao: estrategia.descricao(),
    };
  }
}

module.exports = PropostaRepositorio;
