# SlackFlow 💬

A modern, real-time web workspace and chat application built for seamless team collaboration. Feature-packed with instant messaging, workspace channels, Google OAuth integration, and file sharing capabilities.

🚀 **Live Demo:** [https://real-time-chat-app-r5ca.onrender.com](https://real-time-chat-app-r5ca.onrender.com)

---

## ✨ Features

- **⚡ Real-Time Messaging:** Instant bidirectional communication powered by Socket.IO.
- **🔐 Flexible Authentication:** Standard JWT-based session auth alongside secure Google OAuth 2.0 integration.
- **📁 Workspace & Channels:** Organized channel hierarchy for distinct team topics and public/private rooms.
- **👤 User Presence Tracking:** Accurate real-time online/offline status updates and activity state management.
- **📎 File Sharing:** Attach and share dynamic file formats directly within chat streams via Multer storage handling.
- **🎨 Modern UI/UX:** Server-side rendered views built with Pug templates and custom CSS for a clean, responsive layout.

---

## 🛠️ Tech Stack

**Backend & Real-Time Engine:**

- **Runtime:** Node.js
- **Framework:** Express.js
- **Real-Time Communication:** Socket.IO
- **Template Engine:** Pug

**Database & Authentication:**

- **Database:** MongoDB & Mongoose ODM
- **Auth Protocols:** OAuth 2.0 (Google Auth Library), JSON Web Tokens (JWT) / Express Sessions

**Deployment & DevOps:**

- **Cloud Hosting:** Render
- **Database Hosting:** MongoDB Atlas
- **Version Control:** Git & GitHub

---

## 🚀 Getting Started Locally

### Prerequisites

Ensure you have the following software installed locally:

- [Node.js](https://nodejs.org/) (v18.x or higher)
- [MongoDB](https://www.mongodb.com/) running locally or a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster URI

### Installation

1. **Clone the Repository:**

   ```bash
   git clone [https://github.com/abdo-div/real-time-chat-app.git](https://github.com/abdo-div/real-time-chat-app.git)
   cd real-time-chat-app


   Install Dependencies:
   ```

Bash
npm install
Set Up Environment Variables:
Create a .env or config.env file in the root directory and populate it with the following keys:

مقتطف الرمز
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/slackflow
SESSION_SECRET=your_super_secret_session_key

# Google OAuth Credentials

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
Start the Local Development Server:

Bash
npm run dev
Navigate to http://localhost:5000 in your web browser.

📂 Project Structure
Plaintext
├── config/ # Application environment and DB configurations
├── controllers/ # Business logic (Auth, Messages, Rooms, Workspaces)
├── middleware/ # Custom Express & authentication middlewares
├── models/ # Mongoose database schemas (User, Message, Room)
├── public/ # Static assets (CSS, client JS, uploaded images)
├── routes/ # Express API route declarations
├── utils/ # Helper utilities & custom error classes
├── views/ # Pug server-rendered template layouts
├── app.js # Express application initialization
└── server.js # Entry point establishing HTTP & Socket.IO server

🌐 Deployment Overview
This application is deployed on Render linked to a MongoDB Atlas cluster.

Start Command: node server.js

Production Callback: https://real-time-chat-app-r5ca.onrender.com/auth/google/callback

📄 License
Distributed under the MIT License. See LICENSE for more information.
