// Validadores concretos: cada um preenche só os passos variáveis do Template
// Method definido em Validador.validar().
const Validador = require('./Validador');
const Usuario = require('../modelos/Usuario');
const Imovel = require('../modelos/Imovel');
const Visita = require('../modelos/Visita');
const Proposta = require('../modelos/Proposta');
const Configuracao = require('../infra/Configuracao');
const { senhaForte } = require('../seguranca/senhas');

class ValidadorPessoa extends Validador {
  normalizar(dados) {
    super.normalizar(dados);
    if (dados.email) dados.email = dados.email.toLowerCase();
    if (dados.cpf) dados.cpf = Usuario.formatarCpf(dados.cpf);
    return dados;
  }

  validarRegras(dados, erros) {
    if (dados.email && !Usuario.emailValido(dados.email)) erros.email = 'E-mail inválido.';
    if ('cpf' in this.camposObrigatorios() && dados.cpf && !Usuario.cpfValido(dados.cpf)) erros.cpf = 'CPF inválido.';
    if (dados.telefone && Usuario.somenteDigitos(dados.telefone).length < 10) erros.telefone = 'Telefone com DDD, ao menos 10 dígitos.';
  }
}

class ValidadorCorretor extends ValidadorPessoa {
  normalizar(dados) {
    const { senha } = dados; // espaços fazem parte da senha: ela não é aparada
    super.normalizar(dados);
    dados.senha = senha;
    if (dados.creci) dados.creci = dados.creci.toUpperCase();
    return dados;
  }

  camposObrigatorios() {
    return { nome: 'Nome', email: 'E-mail', creci: 'CRECI' };
  }

  validarRegras(dados, erros) {
    super.validarRegras(dados, erros);
    if (dados.creci && !/^\d{3,6}-?[FJ]?\/[A-Z]{2}$/.test(dados.creci)) {
      erros.creci = 'Use o formato 12345-F/PR.';
    }
    // Senha é opcional (em branco mantém a atual); se vier, precisa ser forte.
    if (dados.senha && !senhaForte(dados.senha)) erros.senha = 'Use 8 ou mais caracteres, com letras e números.';
  }
}

class ValidadorProprietario extends ValidadorPessoa {
  camposObrigatorios() {
    return { nome: 'Nome', cpf: 'CPF', email: 'E-mail' };
  }
}

class ValidadorCliente extends ValidadorPessoa {
  camposObrigatorios() {
    return { nome: 'Nome', cpf: 'CPF', email: 'E-mail', interesse: 'Interesse' };
  }

  // Ponto de variação VP3: só aceita as modalidades do produto ativo.
  opcoesPermitidas() {
    return { interesse: Configuracao.instancia().opcoes('modalidades') };
  }
}

class ValidadorImovel extends Validador {
  normalizar(dados) {
    super.normalizar(dados);
    if (dados.uf) dados.uf = dados.uf.toUpperCase();
    if (dados.cep) dados.cep = Usuario.somenteDigitos(dados.cep);
    return dados;
  }

  camposObrigatorios() {
    return {
      titulo: 'Título', tipo: 'Tipo', finalidade: 'Finalidade', preco: 'Preço',
      cidade: 'Cidade', uf: 'UF', proprietarioId: 'Proprietário', corretorId: 'Corretor',
    };
  }

  // Ponto de variação VP3: a finalidade só pode ser uma modalidade do produto ativo.
  opcoesPermitidas() {
    return { tipo: Imovel.TIPOS, finalidade: Configuracao.instancia().opcoes('modalidades'), status: Imovel.STATUS };
  }

  validarRegras(dados, erros) {
    if (dados.preco !== undefined && !(Number(dados.preco) > 0)) erros.preco = 'Preço deve ser maior que zero.';
    if (dados.area && !(Number(dados.area) > 0)) erros.area = 'Área deve ser maior que zero.';
    if (dados.quartos && !(Number.isInteger(Number(dados.quartos)) && Number(dados.quartos) >= 0)) erros.quartos = 'Quartos deve ser um número inteiro.';
    if (dados.cep && dados.cep.length !== 8) erros.cep = 'CEP deve ter 8 dígitos.';
    if (dados.uf && !/^[A-Z]{2}$/.test(dados.uf)) erros.uf = 'UF com 2 letras.';
    // O negócio fechado tem de combinar com a finalidade do imóvel.
    if (dados.status === 'Vendido' && dados.finalidade !== 'Venda') erros.status = '"Vendido" só vale para imóvel à venda.';
    if (dados.status === 'Alugado' && dados.finalidade !== 'Locação') erros.status = '"Alugado" só vale para imóvel para locação.';
  }
}

class ValidadorVisita extends Validador {
  camposObrigatorios() {
    return { imovelId: 'Imóvel', clienteId: 'Cliente', corretorId: 'Corretor', dataHora: 'Data e hora' };
  }

  opcoesPermitidas() {
    return { status: Visita.STATUS };
  }

  validarRegras(dados, erros) {
    if (dados.dataHora && Number.isNaN(new Date(dados.dataHora).getTime())) erros.dataHora = 'Data inválida.';
    if (dados.status === 'Realizada' && !dados.feedback) erros.feedback = 'Informe o feedback da visita realizada.';
  }
}

class ValidadorProposta extends Validador {
  camposObrigatorios() {
    return { imovelId: 'Imóvel', clienteId: 'Cliente', valor: 'Valor' };
  }

  opcoesPermitidas() {
    return { status: Proposta.STATUS };
  }

  validarRegras(dados, erros) {
    if (dados.valor !== undefined && !(Number(dados.valor) > 0)) erros.valor = 'Valor deve ser maior que zero.';
    if (dados.status === 'Contraproposta' && !(Number(dados.valorContraproposta) > 0)) {
      erros.valorContraproposta = 'Informe o valor da contraproposta.';
    }
  }
}

const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(d).getTime());

class ValidadorContrato extends Validador {
  camposObrigatorios() {
    return { propostaId: 'Proposta' }; // início em branco = hoje
  }

  validarRegras(dados, erros) {
    if (dados.inicio && !dataValida(dados.inicio)) erros.inicio = 'Data inválida.';
    if (dados.termino && !dataValida(dados.termino)) erros.termino = 'Data inválida.';
    else if (dados.termino && dados.inicio && dados.termino <= dados.inicio) erros.termino = 'O término deve ser depois do início.';
  }
}

class ValidadorAvaliacao extends Validador {
  camposObrigatorios() {
    return { visitaId: 'Visita', nota: 'Nota' };
  }

  opcoesPermitidas() {
    return { nota: [1, 2, 3, 4, 5] };
  }

  normalizar(dados) {
    super.normalizar(dados);
    if (dados.nota !== undefined && dados.nota !== '') dados.nota = Number(dados.nota);
    return dados;
  }

  validarRegras() {}
}

class ValidadorOrganizacao extends Validador {
  normalizar(dados) {
    super.normalizar(dados);
    if (dados.nome) dados.nome = dados.nome.replace(/\s+/g, ' ');
    return dados;
  }

  camposObrigatorios() {
    return { nome: 'Nome da organização' };
  }

  validarRegras(dados, erros) {
    if (dados.nome && (dados.nome.length < 3 || dados.nome.length > 80)) erros.nome = 'Use de 3 a 80 caracteres.';
  }
}

module.exports = {
  ValidadorOrganizacao, ValidadorContrato, ValidadorAvaliacao, ValidadorCorretor, ValidadorProprietario, ValidadorCliente,
  ValidadorImovel, ValidadorVisita, ValidadorProposta,
};
