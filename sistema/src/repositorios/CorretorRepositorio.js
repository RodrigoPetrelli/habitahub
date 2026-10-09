const Repositorio = require('./Repositorio');
const Corretor = require('../modelos/Corretor');
const { ValidadorCorretor } = require('../validacao/validadores');
const { gerarHash } = require('../seguranca/senhas');
const { Notificador } = require('../estrategias/notificacao');
const { ErroValidacao } = require('../infra/erros');

class CorretorRepositorio extends Repositorio {
  tabela() {
    return 'corretores';
  }

  modelo() {
    return Corretor;
  }

  validador() {
    return new ValidadorCorretor();
  }

  ordenacao() {
    return 'nome';
  }

  // A senha não faz parte da entidade Corretor (nunca volta para a tela): quando
  // o formulário traz uma senha nova, só o hash é gravado, na mesma transação.
  async salvar(dados, id = null) {
    return this.db.transacao(async () => {
      const corretor = await super.salvar(dados, id);
      if (dados.senha) {
        await this.db.rodar('UPDATE corretores SET senha_hash = ? WHERE id = ?', [await gerarHash(dados.senha), corretor.id]);
      }
      return corretor;
    });
  }

  // Tela pública "Criar conta": o corretor nasce inativo, aguardando aprovação,
  // e os corretores ativos são avisados para aprovar. Aqui a senha é obrigatória.
  async criarConta({ nome, email, telefone, creci, senha }) {
    const dados = { nome, email, telefone, creci, senha, ativo: false, aguardandoAprovacao: true };
    const { erros } = this.validador().validar(dados);
    if (!senha) erros.senha = 'Senha é obrigatória.';
    if (Object.keys(erros).length) throw new ErroValidacao(erros);

    return this.db.transacao(async () => {
      const novo = await this.salvar(dados);
      const notificador = Notificador.doProduto();
      for (const aprovador of (await this.listar()).filter((c) => c.ativo)) {
        await notificador.enviar(aprovador, `${novo.nome} (CRECI ${novo.creci}) criou uma conta e aguarda aprovação. Para liberar o acesso, marque "Corretor ativo" na tela Corretores.`);
      }
      return novo;
    });
  }

  // Aprovação = primeira ativação de uma conta criada pela tela pública.
  async depoisDeSalvar(corretor, anterior) {
    if (anterior?.aguardandoAprovacao && corretor.ativo) {
      await Notificador.doProduto().enviar(corretor, `Olá, ${corretor.primeiroNome()}! Seu cadastro foi aprovado e você já pode entrar no HabitaHub.`);
    }
  }

  // Dados de acesso, usados só pela autenticação.
  async credenciaisPorEmail(email) {
    return this.#credenciais('email = ?', email);
  }

  async credenciaisPorId(id) {
    return this.#credenciais('id = ?', id);
  }

  async #credenciais(condicao, valor) {
    const l = await this.db.um(`SELECT id, nome, email, ativo, aguardando_aprovacao, senha_hash FROM corretores WHERE ${condicao}`, [valor]);
    return l ? {
      id: l.id, nome: l.nome, email: l.email, ativo: Boolean(Number(l.ativo)),
      aguardandoAprovacao: Boolean(Number(l.aguardando_aprovacao)), senhaHash: l.senha_hash,
    } : null;
  }

  async antesDeExcluir(corretor) {
    await this.impedirSeUsado('imoveis', 'corretor_id', corretor.id, 'O corretor é responsável por imóveis. Desative-o em vez de excluir.');
    await this.impedirSeUsado('visitas', 'corretor_id', corretor.id, 'O corretor tem visitas registradas. Desative-o em vez de excluir.');
  }
}

module.exports = CorretorRepositorio;
