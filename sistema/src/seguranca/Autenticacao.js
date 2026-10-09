// Login dos corretores e sessões do sistema.
//
// - A senha é conferida contra o hash scrypt guardado em corretores.senha_hash.
// - A sessão é um token aleatório guardado num cookie HttpOnly (o JavaScript da
//   página não consegue lê-lo) e SameSite=Strict (outro site não consegue usá-lo).
// - A sessão cai se o corretor for desativado ou excluído, ou se a senha dele mudar.
// - As sessões ficam em memória: reiniciar o servidor pede login de novo.
// - Depois de 5 senhas erradas para o mesmo e-mail, o login fica bloqueado por 5 minutos.
const crypto = require('node:crypto');
const CorretorRepositorio = require('../repositorios/CorretorRepositorio');
const { ErroAplicacao } = require('../infra/erros');
const { conferir, gerarHash } = require('./senhas');

const DURACAO_SESSAO = 8 * 60 * 60 * 1000;
const LIMITE_FALHAS = 5;
const BLOQUEIO = 5 * 60 * 1000;
const LOGIN_INVALIDO = 'E-mail ou senha inválidos.';

class Autenticacao {
  #sessoes = new Map(); // token → { corretorId, senhaHash, expiraEm }
  #falhas = new Map(); // e-mail → { quantidade, bloqueadoAte }
  #hashFicticio = null;

  constructor({ repositorio = new CorretorRepositorio(), agora = () => Date.now() } = {}) {
    this.repositorio = repositorio;
    this.agora = agora;
  }

  // Devolve { token, usuario } ou lança ErroAplicacao (401, 403 ou 429).
  async entrar(email, senha) {
    const chave = String(email || '').trim().toLowerCase();
    this.#verificarBloqueio(chave);

    const credenciais = chave ? await this.repositorio.credenciaisPorEmail(chave) : null;
    // Sem corretor, confere contra um hash fictício: a resposta leva o mesmo tempo
    // e não revela quais e-mails estão cadastrados.
    this.#hashFicticio ??= await gerarHash(crypto.randomUUID());
    const confere = await conferir(String(senha || ''), credenciais?.senhaHash || this.#hashFicticio);
    if (!credenciais?.senhaHash || !confere) {
      this.#registrarFalha(chave);
      throw new ErroAplicacao(LOGIN_INVALIDO, 401);
    }
    if (credenciais.aguardandoAprovacao) throw new ErroAplicacao('Seu cadastro está aguardando a aprovação de um administrador. Você vai receber um aviso quando o acesso for liberado.', 403);
    if (!credenciais.ativo) throw new ErroAplicacao('Seu acesso está desativado. Fale com um administrador da sua organização.', 403);

    this.#falhas.delete(chave);
    const token = crypto.randomBytes(32).toString('base64url');
    this.#sessoes.set(token, { corretorId: credenciais.id, senhaHash: credenciais.senhaHash, expiraEm: this.agora() + DURACAO_SESSAO });
    return { token, usuario: await this.usuarioDoToken(token) };
  }

  sair(token) {
    this.#sessoes.delete(token);
  }

  // Usuário logado dono do token, ou null.
  async usuarioDoToken(token) {
    const sessao = token && this.#sessoes.get(token);
    if (!sessao) return null;
    const corretor = sessao.expiraEm > this.agora() ? await this.repositorio.credenciaisPorId(sessao.corretorId) : null;
    if (!corretor?.ativo || corretor.senhaHash !== sessao.senhaHash) {
      this.#sessoes.delete(token);
      return null;
    }
    return { id: corretor.id, nome: corretor.nome, email: corretor.email, administrador: corretor.administrador, organizacao: corretor.organizacao };
  }

  #verificarBloqueio(chave) {
    const f = this.#falhas.get(chave);
    if (!f?.bloqueadoAte) return;
    if (f.bloqueadoAte > this.agora()) {
      const minutos = Math.ceil((f.bloqueadoAte - this.agora()) / 60000);
      throw new ErroAplicacao(`Muitas tentativas erradas. Tente de novo em ${minutos} min.`, 429);
    }
    this.#falhas.delete(chave);
  }

  #registrarFalha(chave) {
    const f = this.#falhas.get(chave) || { quantidade: 0, bloqueadoAte: 0 };
    f.quantidade += 1;
    if (f.quantidade >= LIMITE_FALHAS) f.bloqueadoAte = this.agora() + BLOQUEIO;
    this.#falhas.set(chave, f);
  }
}

module.exports = { Autenticacao, DURACAO_SESSAO };
