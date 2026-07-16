// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Pasta para servir as fotos e o site
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Cria a pasta de uploads se não existir
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Conectando ao Banco SQLite (Cria o arquivo automaticamente)
const db = new sqlite3.Database('./budokai.db', (err) => {
    if (err) console.error(err.message);
    console.log('Conectado ao banco SQLite.');
});

// Criando a tabela de Alunos
db.run(`CREATE TABLE IF NOT EXISTS alunos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    dataNasc TEXT NOT NULL,
    cpf TEXT,
    alergias TEXT,
    doencas TEXT,
    medicamentos TEXT,
    cirurgias TEXT,
    resp_nome TEXT,
    resp_parentesco TEXT,
    resp_telefone TEXT,
    statusPagamento INTEGER DEFAULT 0,
    foto TEXT
)`);

// Criando a tabela de Frequência
db.run(`CREATE TABLE IF NOT EXISTS frequencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aluno_id INTEGER,
    data TEXT,
    status TEXT, -- 'Presente' ou 'Falta'
    FOREIGN KEY(aluno_id) REFERENCES alunos(id)
)`);

// --- ROTAS DA API ---

// 1. Listar todos os alunos
app.get('/api/alunos', (req, res) => {
    db.all("SELECT * FROM alunos ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Cadastrar novo aluno (versão simplificada sem upload de arquivo pesado por enquanto)
app.post('/api/alunos', (req, res) => {
    const { nome, dataNasc, cpf, alergias, doencas, medicamentos, cirurgias, resp_nome, resp_parentesco, resp_telefone, foto } = req.body;
    
    const sql = `INSERT INTO alunos (nome, dataNasc, cpf, alergias, doencas, medicamentos, cirurgias, resp_nome, resp_parentesco, resp_telefone, statusPagamento, foto) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`;
    const params = [nome, dataNasc, cpf, alergias, doencas, medicamentos, cirurgias, resp_nome, resp_parentesco, resp_telefone, foto || ''];

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, success: true });
    });
});

// 3. Atualizar Status de Pagamento
app.put('/api/alunos/:id', (req, res) => {
    const id = req.params.id;
    const { statusPagamento } = req.body;
    db.run(`UPDATE alunos SET statusPagamento = ? WHERE id = ?`, [statusPagamento, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 4. Marcar Frequência
app.post('/api/frequencia', (req, res) => {
    const { aluno_id, data, status } = req.body;
    // Verifica se já foi marcado nesse dia
    db.get(`SELECT id FROM frequencia WHERE aluno_id = ? AND data = ?`, [aluno_id, data], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            // Atualiza
            db.run(`UPDATE frequencia SET status = ? WHERE id = ?`, [status, row.id]);
        } else {
            // Insere novo
            db.run(`INSERT INTO frequencia (aluno_id, data, status) VALUES (?, ?, ?)`, [aluno_id, data, status]);
        }
        res.json({ success: true });
    });
});

// Roda o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});