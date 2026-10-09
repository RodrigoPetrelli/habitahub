// PADRÃO STRATEGY (exemplo 2 de 3): canal de notificação.
// Ponto de variação VP5: o produto escolhe um único canal (feature alternativa). Os
// repositórios chamam Notificador.enviar() sem saber qual canal está ativo.
// O envio é simulado: a mensagem fica registrada na tabela "notificacoes".
const Configuracao = require('../../infra/Configuracao');
const Notificacao = require('../../modelos/Notificacao');
const NotificacaoRepositorio = require('../../repositorios/NotificacaoRepositorio');

class CanalNotificacao {
  // Endereço do destinatário no canal (e-mail ou telefone).
  destinatario(pessoa) {
    throw new Error(`${this.constructor.name} precisa implementar destinatario().`);
  }

  formatar(mensagem) {
    throw new Error(`${this.constructor.name} precisa implementar formatar().`);
  }
}

class CanalEmail extends CanalNotificacao {
  nome = 'email';

  destinatario(pessoa) {
    return pessoa.email;
  }

  formatar(mensagem) {
    return `Assunto: HabitaHub – atualização\n\n${mensagem}\n\nEquipe HabitaHub`;
  }
}

class CanalWhatsApp extends CanalNotificacao {
  nome = 'whatsapp';

  destinatario(pessoa) {
    return pessoa.telefone || pessoa.email;
  }

  formatar(mensagem) {
    return `*HabitaHub* 🏠 ${mensagem}`;
  }
}

class CanalSms extends CanalNotificacao {
  nome = 'sms';

  destinatario(pessoa) {
    return pessoa.telefone || pessoa.email;
  }

  formatar(mensagem) {
    const texto = `HabitaHub: ${mensagem}`;
    return texto.length > 160 ? `${texto.slice(0, 157)}...` : texto;
  }
}

const CANAIS = { email: CanalEmail, whatsapp: CanalWhatsApp, sms: CanalSms };

class Notificador {
  constructor(canal) {
    this.canal = canal;
  }

  static doProduto() {
    const Canal = CANAIS[Configuracao.instancia().produto.features.notificacao];
    return new Notificador(new Canal());
  }

  enviar(pessoa, mensagem) {
    if (!pessoa) return null;
    const notificacao = new Notificacao({
      canal: this.canal.nome,
      destinatario: this.canal.destinatario(pessoa),
      mensagem: this.canal.formatar(mensagem),
    });
    return new NotificacaoRepositorio().salvar(notificacao);
  }
}

module.exports = { CanalNotificacao, CanalEmail, CanalWhatsApp, CanalSms, Notificador };
