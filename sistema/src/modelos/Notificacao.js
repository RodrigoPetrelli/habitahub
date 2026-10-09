class Notificacao {
  constructor({ id = null, canal, destinatario, mensagem, enviadoEm = null } = {}) {
    this.id = id;
    this.canal = canal;
    this.destinatario = destinatario;
    this.mensagem = mensagem;
    this.enviadoEm = enviadoEm;
  }

  resumo(tamanho = 60) {
    return this.mensagem.length > tamanho ? `${this.mensagem.slice(0, tamanho - 1)}…` : this.mensagem;
  }

  static deLinha(l) {
    return new Notificacao({ id: l.id, canal: l.canal, destinatario: l.destinatario, mensagem: l.mensagem, enviadoEm: l.enviado_em });
  }

  paraLinha() {
    return { canal: this.canal, destinatario: this.destinatario, mensagem: this.mensagem };
  }
}

module.exports = Notificacao;
