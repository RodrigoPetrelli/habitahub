// Hash de senha com scrypt (node:crypto). Formato guardado no banco:
//   scrypt$<sal em base64>$<hash em base64>
// O sal é aleatório por senha, então duas senhas iguais geram hashes diferentes.
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const TAMANHO = 64;

async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(senha, sal, TAMANHO);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

// Comparação em tempo constante para não vazar, pelo tempo de resposta, quanto da senha bate.
async function conferir(senha, guardado) {
  const [algoritmo, sal, hash] = String(guardado || '').split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(senha, Buffer.from(sal, 'base64'), esperado.length);
  return crypto.timingSafeEqual(calculado, esperado);
}

// Mesma regra do protótipo: 8+ caracteres, com letra e número.
const senhaForte = (senha) => typeof senha === 'string' && senha.length >= 8 && /[A-Za-z]/.test(senha) && /\d/.test(senha);

module.exports = { gerarHash, conferir, senhaForte };
