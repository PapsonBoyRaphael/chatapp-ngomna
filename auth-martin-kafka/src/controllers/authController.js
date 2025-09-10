const { getUserByMatricule } = require('../models/userModel');
const { sendMessage } = require('../config/kafka');

const getLogin = (req, res) => {
  res.render('login', { error: null }); // Pass error as null for initial render
};

const postLogin = async (req, res) => {
  const { matricule } = req.body;
  try {
    const user = await getUserByMatricule(matricule);
    if (!user) {
      return res.render('login', { error: 'User not found' });
    }
    // Publish to Kafka asynchronously (non-blocking)
    sendMessage(process.env.KAFKA_TOPIC, { event: 'user_logged_in', user })
      .catch(err => console.error('Kafka publish error:', err));
    
    res.render('profile', { user });
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Server error' });
  }
};

const proceed = (req, res) => {
  // Redirect to Visibility service
  res.redirect('http://localhost:3002/unit-search');
};

module.exports = { getLogin, postLogin, proceed };