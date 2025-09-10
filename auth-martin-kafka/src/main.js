const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const { connectProducer } = require('./config/kafka');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/', authRoutes);

(async () => {
  await connectProducer();
  app.listen(PORT, () => {
    console.log(`Auth service running on http://localhost:${PORT}`);
  });
})();