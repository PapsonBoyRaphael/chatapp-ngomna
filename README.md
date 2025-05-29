ChatApp server Microservices for application nGomna
- This repository contains the microservices architecture for a chat application.
Services

auth-service: Handles authentication (port 3000)
user-service: Manages user data with PostgreSQL (port 3001)
chat-service: Manages messages and conversations with MongoDB (port 3002)
group-service: Manages groups with MongoDB (port 3003)
contact-service: Manages contacts with MongoDB (port 3004)
file-service: Manages file uploads with MongoDB and Cloudinary (port 3005)
gateway: Entry point for all requests (port 8000)

- Setup

Clone the repository:git clone https://github.com/PapsonBoyRaphael/chatapp-ngomna.git
cd chatapp-microservices

- Install dependencies for each service:cd auth-service && npm install

cd ../user-service && npm install
cd ../chat-service && npm install
cd ../group-service && npm install
cd ../contact-service && npm install
cd ../file-service && npm install
cd ../gateway && npm install

Set up environment variables:
Copy the .env files from the examples provided in each service folder.

- Start the services using Docker:docker-compose up --build

Development
To run in development mode:
cd <service-name>
npm run dev

