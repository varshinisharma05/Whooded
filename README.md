# Whooded: A Real-Time Multiplayer Social Deduction Game

**Live Demo:** [https://whooded.vercel.app/](https://whooded.vercel.app/)  
**Author:** [Varshini Sharma](https://github.com/varshinisharma05)

---

### **Project Summary**

**Whooded** is a web-based social deduction game inspired by Mafia, built for 5-12 players. It provides a real-time, browser-based environment for friends to play remotely, solving the challenge of coordinating complex party games online with features like secret roles, private chats, and automated game phases.

---

### **How to Play: A Walkthrough**

The game is designed to be intuitive, guiding players through each phase with clear on-screen instructions.

**1. The Lobby**
Create or join a room and wait for your friends. The host can start the game once 5 or more players have joined.

<img width="857" height="839" alt="image" src="https://github.com/user-attachments/assets/de374e03-1d0e-4eb0-b34a-6418f5dc64ed" />


**2. Role Reveal**
At the start of the game, you are secretly assigned a role. This is your secret identity for the entire game. Will you be a member of the town, or the treacherous Mafia?

<img width="369" height="741" alt="image" src="https://github.com/user-attachments/assets/cc4aa749-5ba2-4408-89eb-49222a37450e" />


**3. The Night Phase**
The village sleeps, and players with special abilities take their turn. The Mafia have access to a private chat to coordinate their target.

<img width="602" height="723" alt="image" src="https://github.com/user-attachments/assets/3a15337e-b425-4a1c-bacd-d62acd2eb8b5" />


**4. The Day & Voting Phases**
The village awakens to see who was eliminated. All surviving players must then discuss, debate, and vote to eliminate a suspect.

<img width="586" height="796" alt="image" src="https://github.com/user-attachments/assets/adaa7f93-573e-4114-b530-eedd215cafff" />

<img width="710" height="656" alt="image" src="https://github.com/user-attachments/assets/f0fcbe96-f402-4af2-bcab-aefcc343e659" />



---

### **Workflow Architecture**

The project is built on a modern client-server architecture designed for real-time, multi-user interaction.

1.  **Client (Frontend):** A dynamic single-page application built in **React** and hosted on **Vercel**. It handles all user interactions and renders the game state.
2.  **Server (Backend):** An authoritative **Node.js/Express** server hosted on **Render**. It manages all game logic, state for multiple rooms, and communication.
3.  **Real-Time Communication:** The client and server maintain a persistent connection using **Socket.IO**. The server emits events to update clients on game state changes, and clients emit events to send player actions to the server.
4.  **Continuous Deployment:** The project is connected to GitHub for a seamless CI/CD pipeline. Any push to the `main` branch automatically triggers a new deployment on both Vercel and Render.

---

### **Tech Stack**

* **Frontend:** React, Vite, Socket.IO Client, Tailwind CSS
* **Backend:** Node.js, Express.js, Socket.IO
* **Deployment:** Vercel, Render, Git & GitHub
