const numeroOuNulo = (v) => (v == null || v === '' ? null : Number(v));

// Avaliação do atendimento depois de uma visita realizada: uma por visita, com
// nota de 1 a 5. O corretor avaliado é o da visita.
class Avaliacao {
  constructor(dados = {}) {
    const nota = Number(dados.nota);
    if (!(nota >= 1 && nota <= 5)) throw new Error('A nota deve ficar entre 1 e 5.');
    this.id = dados.id ?? null;
    this.visitaId = numeroOuNulo(dados.visitaId);
    this.corretorId = numeroOuNulo(dados.corretorId);
    this.nota = nota;
    this.comentario = dados.comentario || '';
    this.anonimo = Boolean(Number(dados.anonimo || 0));
    this.criadoEm = dados.criadoEm || null;
  }

  ehPositiva() {
    return this.nota >= 4;
  }

  autorExibido(nomeCliente) {
    return this.anonimo ? 'Cliente anônimo' : nomeCliente;
  }

  static media(avaliacoes) {
    if (!avaliacoes.length) return null;
    return Math.round((avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length) * 10) / 10;
  }

  static deLinha(l) {
    return new Avaliacao({ id: l.id, visitaId: l.visita_id, corretorId: l.corretor_id, nota: l.nota, comentario: l.comentario, anonimo: l.anonimo, criadoEm: l.criado_em });
  }

  paraLinha() {
    return { visita_id: this.visitaId, corretor_id: this.corretorId, nota: this.nota, comentario: this.comentario, anonimo: this.anonimo ? 1 : 0 };
  }
}

module.exports = Avaliacao;
