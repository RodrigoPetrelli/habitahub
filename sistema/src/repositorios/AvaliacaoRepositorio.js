const Repositorio = require('./Repositorio');
const Avaliacao = require('../modelos/Avaliacao');
const { ValidadorAvaliacao } = require('../validacao/validadores');
const { Notificador } = require('../estrategias/notificacao');
const { ErroRegraNegocio } = require('../infra/erros');
const VisitaRepositorio = require('./VisitaRepositorio');
const ImovelRepositorio = require('./ImovelRepositorio');
const CorretorRepositorio = require('./CorretorRepositorio');
const ClienteRepositorio = require('./ClienteRepositorio');

class AvaliacaoRepositorio extends Repositorio {
  tabela() {
    return 'avaliacoes';
  }

  modelo() {
    return Avaliacao;
  }

  validador() {
    return new ValidadorAvaliacao();
  }

  // Só visita realizada é avaliada, uma vez; o corretor avaliado é o da visita.
  async antesDeSalvar(avaliacao, anterior) {
    if (anterior && avaliacao.visitaId !== anterior.visitaId) throw new ErroRegraNegocio('A visita de uma avaliação não muda.');
    const visita = await new VisitaRepositorio().buscarPorId(avaliacao.visitaId);
    if (!visita) throw new ErroRegraNegocio('Visita não encontrada.');
    if (visita.status !== 'Realizada') throw new ErroRegraNegocio('Só visitas realizadas podem ser avaliadas.');
    if (!anterior && await this.contar('avaliacoes', 'visita_id = ?', [visita.id]) > 0) throw new ErroRegraNegocio('Esta visita já foi avaliada.');
    avaliacao.corretorId = visita.corretorId;
  }

  // O nome do cliente aparece só se a avaliação não for anônima.
  async paraResposta(avaliacao) {
    const visita = await new VisitaRepositorio().buscarPorId(avaliacao.visitaId);
    const cliente = visita && await new ClienteRepositorio().buscarPorId(visita.clienteId);
    return { ...avaliacao, autor: avaliacao.autorExibido(cliente?.nome || '—'), positiva: avaliacao.ehPositiva() };
  }

  async depoisDeSalvar(avaliacao, anterior) {
    if (anterior) return;
    const visita = await new VisitaRepositorio().buscarPorId(avaliacao.visitaId);
    const imovel = await new ImovelRepositorio().buscarPorId(visita.imovelId);
    const corretor = await new CorretorRepositorio().buscarPorId(avaliacao.corretorId);
    await Notificador.doProduto().enviar(corretor, `Você recebeu uma avaliação nota ${avaliacao.nota}/5 pela visita ao imóvel ${imovel.codigo}.`);
  }
}

module.exports = AvaliacaoRepositorio;
