const express = require('express');
const AuthController = require('../controllers/auth.controller');
const AgentPostgresRepository = require('../../database/postgres/agent-postgres.repository');

const router = express.Router();
const authController = new AuthController(new AgentPostgresRepository());

router.get('/', authController.renderAuthPage.bind(authController));
router.post('/authenticate', authController.authenticate.bind(authController));

module.exports = router;