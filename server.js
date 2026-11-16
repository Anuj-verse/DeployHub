require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
process.env.BASE_URL = BASE_URL;

app.set('trust proxy', 1); // correct protocol/cookies behind ngrok or a load balancer
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/webhook', require('./routes/webhook'));
// @@RAW_ROUTES@@  (routes that need the raw request body: mounted before the JSON parser)

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'deployhub.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: BASE_URL.startsWith('https'), maxAge: 8 * 3600 * 1000 },
}));
app.use((req, res, next) => { res.locals.user = req.session.user || null; next(); });

app.get('/', (req, res) => {
  if (req.session.token) return res.redirect('/repos');
  res.render('login', { title: 'Sign in', error: req.query.error || null });
});

app.use(require('./routes/auth'));
app.use(require('./routes/repos'));
app.use(require('./routes/deploy'));
// @@ROUTES@@

app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).send('Page not found');
});
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: 'Internal server error' });
  res.status(500).send('Internal server error');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DeployHub running at ${BASE_URL}`);
    ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'DOCKER_USER'].forEach((k) => {
      if (!process.env[k]) console.warn(`WARNING: ${k} is not set in .env`);
    });
  });
}
module.exports = app;
