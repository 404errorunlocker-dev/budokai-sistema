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

// ROTA RAIZ - Corrige o erro "Cannot GET /"
app.get('/', (req, res) => {
  res.json({
    nome: 'Budokai Fight API',
    versao: '1.0.0',
    status: 'Online',
    rotas: {
      alunos: '/api/alunos',
      aluno: '/api/alunos/:id',
      frequencia: '/api/frequencia/aluno/:id',
      marcar_frequencia: '/api/frequencia'
    }
  });
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

    // Verifica se o nome foi enviado
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

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

// PUT - Atualizar aluno (status de pagamento)
app.put('/api/alunos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status_pagamento } = req.body;

    if (status_pagamento === undefined) {
      return res.status(400).json({ error: 'status_pagamento é obrigatório' });
    }

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
    
    // Primeiro deleta as frequências do aluno
    await pool.query('DELETE FROM frequencias WHERE aluno_id = $1', [id]);
    
    // Depois deleta o aluno
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

// GET - Frequência de todos os alunos (opcional)
app.get('/api/frequencia/todos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.nome, 
             COUNT(f.id) as total,
             SUM(CASE WHEN f.status = 'Presente' THEN 1 ELSE 0 END) as presentes,
             SUM(CASE WHEN f.status = 'Falta' THEN 1 ELSE 0 END) as faltas
      FROM alunos a
      LEFT JOIN frequencias f ON a.id = f.aluno_id
      GROUP BY a.id, a.nome
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Marcar frequência
app.post('/api/frequencia', async (req, res) => {
  try {
    const { aluno_id, data, status } = req.body;

    // Validações
    if (!aluno_id || !data || !status) {
      return res.status(400).json({ error: 'aluno_id, data e status são obrigatórios' });
    }

    if (!['Presente', 'Falta'].includes(status)) {
      return res.status(400).json({ error: 'Status deve ser "Presente" ou "Falta"' });
    }

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
    console.log(`📱 Acesse: http://localhost:${port}`);
    console.log(`📊 API: http://localhost:${port}/api/alunos`);
  });
});

// Tratamento de erros globais
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo deu errado!' });
});

// Rota 404 - Para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    message: 'Acesse / para ver as rotas disponíveis'
  });
});