const express = require('express');
const session = require('express-session');
const authRoutes = require('./routes/auth.routes');
const config = require('../../../config/env');

const app = express();

app.set('view engine', 'ejs');
app.set('views', 'src/presentation/views');

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);

app.use('/', authRoutes);

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});