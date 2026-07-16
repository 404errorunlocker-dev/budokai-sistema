const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configuração do banco de dados PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Criar tabelas
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alunos (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        data_nasc DATE NOT NULL,
        cpf VARCHAR(20),
        alergias TEXT,
        doencas TEXT,
        medicamentos TEXT,
        cirurgias TEXT,
        resp_nome VARCHAR(100),
        resp_parentesco VARCHAR(50),
        resp_telefone VARCHAR(20),
        foto TEXT,
        status_pagamento INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS frequencias (
        id SERIAL PRIMARY KEY,
        aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
        data DATE NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(aluno_id, data)
      )
    `);
    
    console.log('✅ Banco de dados inicializado');
  } catch (error) {
    console.error('Erro ao inicializar banco:', error);
  }
}

// ROTAS DA API

// GET - Listar todos os alunos
app.get('/api/alunos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alunos ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - Buscar um aluno
app.get('/api/alunos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM alunos WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Cadastrar aluno
app.post('/api/alunos', async (req, res) => {
  try {
    const {
      nome, data_nasc, cpf, alergias, doencas, medicamentos,
      cirurgias, resp_nome, resp_parentesco, resp_telefone, foto
    } = req.body;

    const result = await pool.query(
      `INSERT INTO alunos 
       (nome, data_nasc, cpf, alergias, doencas, medicamentos, 
        cirurgias, resp_nome, resp_parentesco, resp_telefone, foto, status_pagamento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)
       RETURNING *`,
      [nome, data_nasc, cpf, alergias, doencas, medicamentos,
       cirurgias, resp_nome, resp_parentesco, resp_telefone, foto]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT - Atualizar aluno
app.put('/api/alunos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status_pagamento } = req.body;

    const result = await pool.query(
      'UPDATE alunos SET status_pagamento = $1 WHERE id = $2 RETURNING *',
      [status_pagamento, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Excluir aluno
app.delete('/api/alunos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM frequencias WHERE aluno_id = $1', [id]);
    const result = await pool.query('DELETE FROM alunos WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    res.json({ message: 'Aluno excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - Frequência de um aluno
app.get('/api/frequencia/aluno/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM frequencias WHERE aluno_id = $1 ORDER BY data DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Marcar frequência
app.post('/api/frequencia', async (req, res) => {
  try {
    const { aluno_id, data, status } = req.body;

    const result = await pool.query(
      `INSERT INTO frequencias (aluno_id, data, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (aluno_id, data) 
       DO UPDATE SET status = $3
       RETURNING *`,
      [aluno_id, data, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializar banco e iniciar servidor
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
  });
});