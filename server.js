const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configuração do banco de dados
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configurada' : '❌ NÃO CONFIGURADA');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ROTA RAIZ
app.get('/', (req, res) => {
  res.json({
    nome: 'Budokai Fight API',
    versao: '1.0.0',
    status: 'Online',
    banco: process.env.DATABASE_URL ? 'Conectado' : 'Sem banco',
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
    console.log('🔄 Iniciando criação das tabelas...');
    
    // Verifica conexão
    await pool.query('SELECT NOW()');
    console.log('✅ Conexão com banco estabelecida!');

    // Cria tabela alunos
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
    console.log('✅ Tabela alunos criada/verificada');

    // Cria tabela frequencias
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
    console.log('✅ Tabela frequencias criada/verificada');
    
    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    console.error('Detalhes:', error);
  }
}

// ROTAS DA API

// GET - Listar todos os alunos
app.get('/api/alunos', async (req, res) => {
  try {
    console.log('📊 Buscando alunos...');
    const result = await pool.query('SELECT * FROM alunos ORDER BY id DESC');
    console.log(`✅ ${result.rows.length} alunos encontrados`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao buscar alunos:', error.message);
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
    console.error('Erro ao cadastrar:', error);
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

// GET - Frequência de todos os alunos
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

    if (!aluno_id || !data || !status) {
      return res.status(400).json({ error: 'aluno_id, data e status são obrigatórios' });
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
    console.log(`📱 Acesse: https://budokai-backend.onrender.com`);
  });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: err.message });
});

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    message: 'Acesse / para ver as rotas disponíveis'
  });
});