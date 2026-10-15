const Repositorio = require('./Repositorio');
const Contrato = require('../modelos/Contrato');
const { ValidadorContrato } = require('../validacao/validadores');
const { Notificador } = require('../estrategias/notificacao');
const { ErroRegraNegocio } = require('../infra/erros');
const { organizacaoAtual } = require('../infra/ContextoOrganizacao');
const PropostaRepositorio = require('./PropostaRepositorio');
const ImovelRepositorio = require('./ImovelRepositorio');
const ClienteRepositorio = require('./ClienteRepositorio');
const ProprietarioRepositorio = require('./ProprietarioRepositorio');

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

class ContratoRepositorio extends Repositorio {
  tabela() {
    return 'contratos';
  }

  modelo() {
    return Contrato;
  }

  validador() {
    return new ValidadorContrato();
  }

  ordenacao() {
    return 'numero DESC';
  }

  // Contrato novo: tipo, imóvel e valor vêm da proposta aprovada (Contrato.aPartirDaProposta).
  // Contrato existente: só mudam datas e assinaturas, até as três partes assinarem.
  async antesDeSalvar(contrato, anterior) {
    if (anterior) {
      if (contrato.propostaId !== anterior.propostaId) throw new ErroRegraNegocio('A proposta de um contrato não muda. Exclua o contrato e gere outro.');
      if (anterior.estaCompleto()) throw new ErroRegraNegocio('Contrato assinado pelas três partes não pode mais ser alterado.');
      Object.assign(contrato, { numero: anterior.numero, imovelId: anterior.imovelId, tipo: anterior.tipo, valor: anterior.valor });
    } else {
      const proposta = await new PropostaRepositorio().buscarPorId(contrato.propostaId);
      if (!proposta) throw new ErroRegraNegocio('Proposta não encontrada.');
      if (proposta.status !== 'Aprovada') throw new ErroRegraNegocio('Só propostas aprovadas geram contrato.');
      if (await this.contar('contratos', 'proposta_id = ?', [proposta.id]) > 0) throw new ErroRegraNegocio('Esta proposta já tem contrato.');
      const imovel = await new ImovelRepositorio().buscarPorId(proposta.imovelId);
      const gerado = Contrato.aPartirDaProposta(proposta, imovel, await this.#proximoNumero(), 30, contrato.inicio);
      Object.assign(contrato, { numero: gerado.numero, imovelId: gerado.imovelId, tipo: gerado.tipo, valor: gerado.valor });
      contrato.termino ||= gerado.termino;
    }
    if (contrato.tipo === 'Venda') contrato.termino = null;
  }

  async depoisDeSalvar(contrato, anterior) {
    const imoveis = new ImovelRepositorio();
    const imovel = await imoveis.buscarPorId(contrato.imovelId);
    const proposta = await new PropostaRepositorio().buscarPorId(contrato.propostaId);
    const cliente = await new ClienteRepositorio().buscarPorId(proposta.clienteId);
    const notificador = Notificador.doProduto();
    if (!anterior) {
      await notificador.enviar(cliente, `O contrato ${contrato.numero} do imóvel ${imovel.codigo} (${brl(contrato.valor)}) foi gerado e aguarda as assinaturas.`);
    }
    // Com as três assinaturas, o negócio se fecha: o imóvel fica Vendido ou Alugado.
    if (contrato.estaCompleto() && !anterior?.estaCompleto()) {
      imovel.concluirNegocio();
      await this.db.rodar('UPDATE imoveis SET status = ? WHERE id = ?', [imovel.status, imovel.id]);
      const proprietario = await new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId);
      const mensagem = `O contrato ${contrato.numero} foi assinado pelas três partes. O imóvel ${imovel.codigo} agora está "${imovel.status}".`;
      await notificador.enviar(cliente, mensagem);
      await notificador.enviar(proprietario, mensagem);
    }
  }

  async antesDeExcluir(contrato) {
    if (contrato.estaCompleto()) throw new ErroRegraNegocio('Contrato assinado pelas três partes não pode ser excluído.');
  }

  async paraResposta(contrato) {
    const assinados = Object.fromEntries(Contrato.PAPEIS.map((p) => [Contrato.CAMPO_DO_PAPEL[p], contrato.assinadoPor(p)]));
    return { ...contrato, ...assinados, status: contrato.status(), duracaoEmMeses: contrato.duracaoEmMeses() };
  }

  // Cada organização tem a sua sequência (CT-0001, CT-0002, ...).
  async #proximoNumero() {
    const linha = await this.db.um("SELECT MAX(CAST(SUBSTR(numero, 4) AS INTEGER)) AS n FROM contratos WHERE numero LIKE 'CT-%' AND organizacao_id = ?", [organizacaoAtual()]);
    return `CT-${String((linha.n || 0) + 1).padStart(4, '0')}`;
  }
}

module.exports = ContratoRepositorio;
