const Repositorio = require('./Repositorio');
const OrganizacaoRepositorio = require('./OrganizacaoRepositorio');
const Corretor = require('../modelos/Corretor');
const { naOrganizacao } = require('../infra/ContextoOrganizacao');
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

  // Tela pública "Criar conta". Aqui a senha é obrigatória, e há dois caminhos:
  // - novaOrganizacao (nome): cria a organização, e o corretor já nasce ativo e
  //   administrador dela. É o caminho do corretor autônomo, que não tem a quem pedir acesso.
  // - organizacaoId: o corretor nasce inativo, aguardando aprovação, e os
  //   administradores daquela organização são avisados para aprovar.
  // Devolve { corretor, organizacao }.
  async criarConta({ nome, email, telefone, creci, senha, organizacaoId, novaOrganizacao }) {
    const organizacoes = new OrganizacaoRepositorio();
    const criando = typeof novaOrganizacao === 'string';
    const dados = { nome, email, telefone, creci, senha, ativo: criando, administrador: criando, aguardandoAprovacao: !criando };
    const { erros } = this.validador().validar(dados);
    if (!senha) erros.senha = 'Senha é obrigatória.';

    let organizacao = null;
    if (criando) {
      const r = organizacoes.validador().validar({ nome: novaOrganizacao });
      if (!r.valido) erros.novaOrganizacao = r.erros.nome;
      else if (await organizacoes.nomeEmUso(r.dados.nome)) erros.novaOrganizacao = 'Já existe uma organização com este nome. Se você trabalha nela, peça para entrar.';
    } else {
      organizacao = await organizacoes.buscarPorId(organizacaoId);
      if (!organizacao) erros.organizacaoId = 'Escolha a organização em que você trabalha.';
    }
    if (Object.keys(erros).length) throw new ErroValidacao(erros);

    return this.db.transacao(async () => {
      organizacao ??= await organizacoes.salvar({ nome: novaOrganizacao });
      const corretor = await naOrganizacao(organizacao.id, async () => {
        const novo = await this.salvar(dados);
        const notificador = Notificador.doProduto();
        if (criando) {
          await notificador.enviar(novo, `Bem-vindo(a) ao HabitaHub! A organização "${organizacao.nome}" foi criada e você é o administrador dela. Se outros corretores pedirem para entrar, é você quem aprova.`);
        } else {
          for (const administrador of await this.administradoresAtivos()) {
            await notificador.enviar(administrador, `${novo.nome} (CRECI ${novo.creci}) criou uma conta e aguarda aprovação. Para liberar o acesso, marque "Corretor ativo" na tela Corretores.`);
          }
        }
        return novo;
      });
      return { corretor, organizacao };
    });
  }

  async administradoresAtivos() {
    return (await this.listar()).filter((c) => c.ativo && c.administrador);
  }

  // Aprovação = primeira ativação de uma conta criada pela tela pública.
  async depoisDeSalvar(corretor, anterior) {
    if (anterior?.aguardandoAprovacao && corretor.ativo) {
      await Notificador.doProduto().enviar(corretor, `Olá, ${corretor.primeiroNome()}! Seu cadastro foi aprovado e você já pode entrar no HabitaHub.`);
    }
  }

  // Dados de acesso, usados só pela autenticação. O login vem antes de se saber a
  // organização, então esta consulta procura no banco inteiro (o e-mail é único).
  async credenciaisPorEmail(email) {
    return this.#credenciais('c.email = ?', email);
  }

  async credenciaisPorId(id) {
    return this.#credenciais('c.id = ?', id);
  }

  async #credenciais(condicao, valor) {
    const l = await this.db.um(`SELECT c.id, c.nome, c.email, c.ativo, c.administrador, c.aguardando_aprovacao, c.senha_hash,
      o.id AS organizacao_id, o.nome AS organizacao_nome
      FROM corretores c JOIN organizacoes o ON o.id = c.organizacao_id WHERE ${condicao}`, [valor]);
    return l ? {
      id: l.id, nome: l.nome, email: l.email, ativo: Boolean(Number(l.ativo)), administrador: Boolean(Number(l.administrador)),
      aguardandoAprovacao: Boolean(Number(l.aguardando_aprovacao)), senhaHash: l.senha_hash,
      organizacao: { id: l.organizacao_id, nome: l.organizacao_nome },
    } : null;
  }

  async antesDeExcluir(corretor) {
    await this.impedirSeUsado('imoveis', 'corretor_id', corretor.id, 'O corretor é responsável por imóveis. Desative-o em vez de excluir.');
    await this.impedirSeUsado('visitas', 'corretor_id', corretor.id, 'O corretor tem visitas registradas. Desative-o em vez de excluir.');
  }
}

module.exports = CorretorRepositorio;
