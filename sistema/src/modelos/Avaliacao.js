// Avaliação do atendimento depois de uma visita realizada. Ainda não é
// persistida: a tabela entra na próxima etapa do projeto.
class Avaliacao {
  constructor({ visitaId, corretorId, nota, comentario = '', anonimo = false } = {}) {
    if (!(nota >= 1 && nota <= 5)) throw new Error('A nota deve ficar entre 1 e 5.');
    this.visitaId = visitaId;
    this.corretorId = corretorId;
    this.nota = nota;
    this.comentario = comentario;
    this.anonimo = anonimo;
    this.data = new Date();
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
}

module.exports = Avaliacao;
