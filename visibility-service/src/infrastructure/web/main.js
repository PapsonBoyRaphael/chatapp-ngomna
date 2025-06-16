require('express-async-errors');
const express = require('express');
const path = require('path');
const agentRoutes = require('./routes/agents');

const app = express();

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/agents', agentRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Visibility Microservice' });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});