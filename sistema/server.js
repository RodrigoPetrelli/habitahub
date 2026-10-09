// HabitaHub – servidor. Escolha o produto da linha (LPS) com
//   node server.js --produto=corretor-autonomo
// ou com a variável de ambiente HABITAHUB_PRODUTO.
// Banco: HABITAHUB_BANCO_URL=postgres://... usa o PostgreSQL (container "banco");
// sem ela, o sistema usa um arquivo SQLite em dados/<produto>.db.
const path = require('node:path');
const { criarAplicacao } = require('./src/app');
const Database = require('./src/infra/Database');

const argumento = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];

const produto = argumento('produto') || process.env.HABITAHUB_PRODUTO || 'lana-mayan';
const porta = Number(argumento('porta') || process.env.PORT || 3200);
const banco = process.env.HABITAHUB_BANCO_URL || process.env.HABITAHUB_BANCO || path.join(__dirname, 'dados', `${produto}.db`);

criarAplicacao({ produto, banco })
  .then((servidor) => {
    servidor.listen(porta, () => {
      console.log(`HabitaHub [${produto}] em http://localhost:${porta} – banco: ${Database.instancia().descricao}`);
    });
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
