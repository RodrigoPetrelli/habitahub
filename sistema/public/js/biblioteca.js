// Ponto de entrada da biblioteca reutilizável (dist/lib/tela-crud.min.js).
// Outro produto da linha monta uma tela de CRUD só com a definição dela:
//
//   import { TelaCrud } from '/lib/tela-crud.min.js';
//   new TelaCrud({ titulo, recurso, campos, colunas }, produto).montar(container);
export { TelaCrud } from './TelaCrud.js';
export { api, el, etiqueta, avisar, brl, dataHora } from './util.js';
