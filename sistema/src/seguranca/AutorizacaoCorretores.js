// Permissões da tela Corretores (perfil de administrador).
//
// - Todos os corretores veem a lista (ela alimenta os selects de imóveis e visitas).
// - Só o administrador cria, exclui, aprova, ativa ou desativa corretores e
//   dá ou tira o perfil de administrador. Sem isso, um corretor comum poderia
//   criar uma conta já ativa e pular a aprovação.
// - O corretor comum edita só o próprio cadastro (dados e senha).
// - O administrador não tira o próprio perfil nem se desativa: assim o sistema
//   nunca fica sem quem aprove contas.
const { ErroAplicacao } = require('../infra/erros');

const negar = (mensagem) => { throw new ErroAplicacao(mensagem, 403); };
const SO_ADMINISTRADOR = 'Só um administrador pode fazer isso.';

// O campo veio no formulário com um valor diferente do atual?
const muda = (dados, campo, atual) => campo in dados && Boolean(Number(dados[campo])) !== atual;

class AutorizacaoCorretores {
  async verificar(acao, { usuario, id, dados, repositorio }) {
    if (acao === 'listar' || acao === 'obter') return;
    if (acao === 'criar' || acao === 'excluir') {
      if (!usuario.administrador) negar(SO_ADMINISTRADOR);
      if (acao === 'excluir' && id === usuario.id) negar('Você não pode excluir o próprio cadastro.');
      return;
    }

    // atualizar
    const alvo = await repositorio.buscarOuFalhar(id);
    const proprio = alvo.id === usuario.id;
    if (!usuario.administrador) {
      if (!proprio) negar('Você só pode editar o próprio cadastro.');
      if (muda(dados, 'ativo', alvo.ativo) || muda(dados, 'administrador', alvo.administrador)) negar(SO_ADMINISTRADOR);
      return;
    }
    if (proprio && (muda(dados, 'ativo', alvo.ativo) || muda(dados, 'administrador', alvo.administrador))) {
      negar('Você não pode se desativar nem tirar o próprio perfil de administrador. Peça a outro administrador.');
    }
  }
}

module.exports = AutorizacaoCorretores;
