import express from 'express';
import cors from 'cors';
import usersRouter from './routes/users.js';
import groupsRouter from './routes/groups.js';
import expensesRouter from './routes/expenses.js';
import { ping } from '../db/pool.js';
import invitesRouter from './routes/invites.js';
import migrationsRouter from './routes/migrations.js';
import authRouter from './routes/auth.js';

const app = express();

app.use(cors());
app.use(express.json());

// Root landing for cPanel health checks and humans
app.get('/', (req, res) => {
  res
    .type('html')
    .send('<h1>SplitHive API</h1><p>OK</p><p>Try <a href="/health">/health</a> or <a href="/db/health">/db/health</a>.</p>');
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'splithive-backend' });
});

app.get('/db/health', async (req, res, next) => {
  try {
    await ping();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use('/users', usersRouter);
app.use('/groups', groupsRouter);
app.use('/expenses', expensesRouter);
app.use('/invites', invitesRouter);
app.use('/db/migrations', migrationsRouter);
app.use('/auth', authRouter);

// Basic error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
