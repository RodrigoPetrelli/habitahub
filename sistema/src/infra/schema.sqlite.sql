-- HabitaHub – esquema do banco (SQLite, usado sem Docker e nos testes)
-- Mantenha igual a schema.postgres.sql.

CREATE TABLE IF NOT EXISTS corretores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  telefone   TEXT,
  creci      TEXT    NOT NULL UNIQUE,
  ativo      INTEGER NOT NULL DEFAULT 1,
  senha_hash TEXT,    -- acesso ao sistema (scrypt); NULL = corretor sem login
  aguardando_aprovacao INTEGER NOT NULL DEFAULT 0, -- 1 = criou a conta e espera aprovação
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proprietarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  cpf        TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  telefone   TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  cpf        TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  telefone   TEXT,
  interesse  TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS imoveis (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo           TEXT    NOT NULL UNIQUE,
  titulo           TEXT    NOT NULL,
  tipo             TEXT    NOT NULL,
  finalidade       TEXT    NOT NULL,
  preco            REAL    NOT NULL,
  area             REAL,
  quartos          INTEGER,
  cep              TEXT,
  logradouro       TEXT,
  numero           TEXT,
  bairro           TEXT,
  cidade           TEXT    NOT NULL,
  uf               TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'Disponível',
  proprietario_id  INTEGER NOT NULL REFERENCES proprietarios(id),
  corretor_id      INTEGER NOT NULL REFERENCES corretores(id),
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visitas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  imovel_id    INTEGER NOT NULL REFERENCES imoveis(id),
  cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
  corretor_id  INTEGER NOT NULL REFERENCES corretores(id),
  data_hora    TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'Agendada',
  feedback     TEXT,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS propostas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  imovel_id             INTEGER NOT NULL REFERENCES imoveis(id),
  cliente_id            INTEGER NOT NULL REFERENCES clientes(id),
  valor                 REAL    NOT NULL,
  condicoes             TEXT,
  status                TEXT    NOT NULL DEFAULT 'Em análise',
  valor_contraproposta  REAL,
  criado_em             TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  canal         TEXT NOT NULL,
  destinatario  TEXT NOT NULL,
  mensagem      TEXT NOT NULL,
  enviado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
