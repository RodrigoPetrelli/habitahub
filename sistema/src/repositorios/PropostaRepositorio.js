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

  async antesDeSalvar(proposta, anterior) {
    const imovel = await new ImovelRepositorio().buscarPorId(proposta.imovelId);
    if (!imovel) throw new ErroRegraNegocio('Imóvel não encontrado.');
    if (!await new ClienteRepositorio().buscarPorId(proposta.clienteId)) throw new ErroRegraNegocio('Cliente não encontrado.');
    if (!anterior && !imovel.estaDisponivel()) {
      throw new ErroRegraNegocio(`O imóvel ${imovel.codigo} está "${imovel.status}" e não aceita propostas.`);
    }
    if (proposta.status !== 'Contraproposta') proposta.valorContraproposta = null;
    if (anterior?.status === 'Aprovada' && proposta.status !== 'Aprovada' && await this.contar('contratos', 'proposta_id = ?', [proposta.id]) > 0) {
      throw new ErroRegraNegocio('A proposta já tem contrato e precisa continuar aprovada.');
    }
  }

  async antesDeExcluir(proposta) {
    await this.impedirSeUsado('contratos', 'proposta_id', proposta.id, 'A proposta tem contrato. Exclua o contrato antes.');
  }

  async depoisDeSalvar(proposta, anterior) {
    const imovel = await new ImovelRepositorio().buscarPorId(proposta.imovelId);
    const notificador = Notificador.doProduto();

    if (!anterior) {
      const proprietario = await new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId);
      await notificador.enviar(proprietario, `Nova proposta de ${brl(proposta.valor)} para o imóvel ${imovel.codigo}.`);
      return;
    }
    if (anterior.status !== proposta.status) {
      const cliente = await new ClienteRepositorio().buscarPorId(proposta.clienteId);
      const extra = proposta.status === 'Contraproposta' ? ` Valor proposto: ${brl(proposta.valorContraproposta)}.` : '';
      await notificador.enviar(cliente, `Sua proposta para o imóvel ${imovel.codigo} mudou para "${proposta.status}".${extra}`);
    }
    // Proposta aprovada reserva o imóvel (regra do modelo Imovel).
    if (proposta.status === 'Aprovada' && imovel.estaDisponivel()) {
      imovel.reservar();
      await this.db.rodar('UPDATE imoveis SET status = ? WHERE id = ?', [imovel.status, imovel.id]);
    }
  }

  // Acrescenta a comissão estimada, calculada pela estratégia da modalidade.
  async paraResposta(proposta) {
    const imovel = await new ImovelRepositorio().buscarPorId(proposta.imovelId);
    const cliente = await new ClienteRepositorio().buscarPorId(proposta.clienteId);
    const estrategia = estrategiaComissaoPara(imovel?.finalidade);
    return {
      ...proposta,
      // Rótulo usado no select da tela de Contratos.
      resumo: `${imovel?.codigo} · ${cliente?.nome} · ${brl(proposta.valorNegociado())}`,
      valorNegociado: proposta.valorNegociado(),
      percentualDoPreco: imovel ? proposta.percentualDoPreco(imovel.preco) : null,
      comissaoEstimada: proposta.calcularComissao(estrategia),
      regraComissao: estrategia.descricao(),
    };
  }
}

module.exports = PropostaRepositorio;
