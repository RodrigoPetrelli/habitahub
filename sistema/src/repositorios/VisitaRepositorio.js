const Repositorio = require('./Repositorio');
const Visita = require('../modelos/Visita');
const { ValidadorVisita } = require('../validacao/validadores');
const { Notificador } = require('../estrategias/notificacao');
const { ErroRegraNegocio } = require('../infra/erros');
const ImovelRepositorio = require('./ImovelRepositorio');
const ClienteRepositorio = require('./ClienteRepositorio');
const ProprietarioRepositorio = require('./ProprietarioRepositorio');
const CorretorRepositorio = require('./CorretorRepositorio');

const dataHoraBr = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

class VisitaRepositorio extends Repositorio {
  tabela() {
    return 'visitas';
  }

  modelo() {
    return Visita;
  }

  validador() {
    return new ValidadorVisita();
  }

  ordenacao() {
    return 'data_hora DESC';
  }

  async antesDeSalvar(visita, anterior) {
    const imovel = await new ImovelRepositorio().buscarPorId(visita.imovelId);
    if (!imovel) throw new ErroRegraNegocio('Imóvel não encontrado.');
    // Os repositórios só enxergam a organização ativa: um id de outra organização não é encontrado.
    if (!await new ClienteRepositorio().buscarPorId(visita.clienteId)) throw new ErroRegraNegocio('Cliente não encontrado.');
    if (!await new CorretorRepositorio().buscarPorId(visita.corretorId)) throw new ErroRegraNegocio('Corretor não encontrado.');
    if (!anterior && !imovel.estaDisponivel()) {
      throw new ErroRegraNegocio(`O imóvel ${imovel.codigo} está "${imovel.status}" e não aceita novas visitas.`);
    }
    if (anterior && anterior.status !== 'Agendada' && anterior.dataHora !== visita.dataHora) {
      throw new ErroRegraNegocio('Só é possível reagendar visitas com status "Agendada".');
    }
    if (anterior?.status === 'Realizada' && visita.status !== 'Realizada' && await this.contar('avaliacoes', 'visita_id = ?', [visita.id]) > 0) {
      throw new ErroRegraNegocio('A visita já foi avaliada e precisa continuar realizada.');
    }
  }

  async antesDeExcluir(visita) {
    await this.impedirSeUsado('avaliacoes', 'visita_id', visita.id, 'A visita tem avaliação. Exclua a avaliação antes.');
  }

  // Rótulo usado no select da tela de Avaliações.
  async paraResposta(visita) {
    const imovel = await new ImovelRepositorio().buscarPorId(visita.imovelId);
    const cliente = await new ClienteRepositorio().buscarPorId(visita.clienteId);
    return { ...visita, resumo: `${dataHoraBr(visita.dataHora)} · ${imovel?.codigo} · ${cliente?.nome}` };
  }

  async depoisDeSalvar(visita, anterior) {
    const imovel = await new ImovelRepositorio().buscarPorId(visita.imovelId);
    const cliente = await new ClienteRepositorio().buscarPorId(visita.clienteId);
    const notificador = Notificador.doProduto();

    if (!anterior) {
      await notificador.enviar(cliente, `Visita ao imóvel ${imovel.codigo} agendada para ${dataHoraBr(visita.dataHora)}.`);
    } else if (anterior.dataHora !== visita.dataHora) {
      await notificador.enviar(cliente, `Sua visita ao imóvel ${imovel.codigo} foi reagendada para ${dataHoraBr(visita.dataHora)}.`);
    }
    if (visita.status === 'Realizada' && anterior?.status !== 'Realizada') {
      const proprietario = await new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId);
      await notificador.enviar(proprietario, `Feedback da visita ao seu imóvel ${imovel.codigo}: ${visita.feedback}`);
    }
  }
}

module.exports = VisitaRepositorio;
