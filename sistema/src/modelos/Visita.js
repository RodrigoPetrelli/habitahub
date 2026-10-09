const numeroOuNulo = (v) => (v == null || v === '' ? null : Number(v));

class Visita {
  static STATUS = ['Agendada', 'Realizada', 'Cancelada'];

  constructor(dados = {}) {
    this.id = dados.id ?? null;
    this.imovelId = numeroOuNulo(dados.imovelId);
    this.clienteId = numeroOuNulo(dados.clienteId);
    this.corretorId = numeroOuNulo(dados.corretorId);
    this.dataHora = dados.dataHora || '';
    this.status = dados.status || 'Agendada';
    this.feedback = dados.feedback || '';
    this.criadoEm = dados.criadoEm || null;
  }

  ehFutura(agora = new Date()) {
    return new Date(this.dataHora) > agora;
  }

  reagendar(novaDataHora) {
    if (this.status !== 'Agendada') throw new Error('Só é possível reagendar visitas agendadas.');
    this.dataHora = novaDataHora;
  }

  registrarRealizacao(feedback) {
    if (this.status === 'Cancelada') throw new Error('Visita cancelada não pode ser realizada.');
    this.status = 'Realizada';
    this.feedback = feedback;
  }

  cancelar() {
    if (this.status === 'Realizada') throw new Error('Visita já realizada não pode ser cancelada.');
    this.status = 'Cancelada';
  }

  static deLinha(l) {
    return new Visita({ id: l.id, imovelId: l.imovel_id, clienteId: l.cliente_id, corretorId: l.corretor_id, dataHora: l.data_hora, status: l.status, feedback: l.feedback, criadoEm: l.criado_em });
  }

  paraLinha() {
    return { imovel_id: this.imovelId, cliente_id: this.clienteId, corretor_id: this.corretorId, data_hora: this.dataHora, status: this.status, feedback: this.feedback };
  }
}

module.exports = Visita;
