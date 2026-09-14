# DataBridge AI

> **Enterprise Multi-Tenant Natural Language to SQL & Database Intelligence Platform**

DataBridge AI bridges business stakeholders, analysts, and disparate data stores with conversational intelligence. Query Microsoft SQL Server, PostgreSQL, MySQL, MongoDB, and Firebase Firestore using plain English, synthesize cross-system insights, and build interactive dashboards with real-time visualization.

---

## 🚀 Quick Start

### 1. Start the SQL Server Database
```powershell
docker start databridge-sql
```
*(To make it start automatically on boot without running Docker manually: `docker update --restart unless-stopped databridge-sql`)*

### 2. Install Dependencies & Generate Client
```powershell
npm install
npx prisma db push
npx prisma generate
```

### 3. Launch the Application
```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Default Test Credentials

| Role | Email | Password | Organization | Org Invite Code |
| :--- | :--- | :--- | :--- | :--- |
| **Workspace Owner** | `usman.khan@tajgasoli` | `1234567890` | Test Org | `TES-MFGZRW` |
| **Workspace Member** | `test@test.com` | `12345678` | Test Org | `TES-MFGZRW` |
| **Workspace Owner** | `usman.khan@tajgasoline.com` | *(User managed)* | Taj Gasoline | `TAJ-IMU4X9` |

---

## 📖 Comprehensive Documentation

Complete, in-depth documentation is organized in the [`docs/`](./docs) folder:

* 🛠️ **[Setup & Installation Guide](./docs/setup-guide.md)** — Full environment setup, Docker configuration, native Windows SQL Server setup, and production deployment.
* 🔐 **[Credentials & Test Data Reference](./docs/credentials-and-test-data.md)** — Master database credentials, test users, organization invite codes, and pre-configured database connection targets.
* 🏛️ **[Architecture & Core Features](./docs/architecture-and-features.md)** — System architecture diagrams, multi-tenancy privacy model, AES-256 security, RAG schema introspection, and database-backed chat persistence.
* 📡 **[API Reference](./docs/api-reference.md)** — Complete HTTP REST and Server Action specifications for authentication, password resets, registration, and chat history.
* 🩺 **[Troubleshooting & FAQ](./docs/troubleshooting.md)** — Solutions for Docker connectivity, Windows Prisma file locks, target database timeouts, and AI inference configuration.

---

## ✨ Core Features

- **Conversational NL-to-SQL Engine**: Translates natural language questions into database-specific queries across MSSQL, MySQL, Postgres, MongoDB, and Firestore.
- **Multi-Tenant Privacy**: Strict workspace isolation with unique Organization Invite Codes. Members can only join workspaces with valid authorization.
- **Database-Backed Chat History**: Query sessions and conversational history are persisted in Microsoft SQL Server, automatically syncing across browser restarts, incognito windows, and multiple devices.
- **AES-256 Encrypted Credential Store**: External database connection secrets are encrypted using AES-256-CBC and decrypted only in volatile memory during query execution.
- **Interactive Dashboards & Analytics**: Drag-and-drop grid layouts powered by `react-grid-layout` with Recharts (Bar, Line, Area, Pie, and Data Tables).
- **Executive Exporting**: One-click vector PDF generation and formatted Excel/CSV exports.
- **Multi-Model AI Flexibility**: Configurable support for OpenRouter, NVIDIA NIM, local offline Ollama models, and OpenAI.
- **Progressive Web App (PWA)**: Installable desktop and mobile web app with offline caching and background synchronization.

---

## 💻 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 16 (App Router + Webpack)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI & Styling**: React 19, Vanilla CSS, Tailwind CSS, [Lucide Icons](https://lucide.dev/)
- **Internal Database**: Microsoft SQL Server 2022 via [Prisma ORM](https://www.prisma.io/)
- **Authentication**: [Auth.js / NextAuth](https://authjs.dev/) v5 with bcrypt password hashing
- **Visualizations**: [Recharts](https://recharts.org/), `react-grid-layout`
- **Data Drivers**: `mssql`, `pg`, `mysql2`, `mongodb`, `firebase-admin`
