# DataBridge AI - Documentation Hub

Welcome to the central documentation library for **DataBridge AI**, an enterprise multi-tenant Natural Language to SQL analytics platform.

---

## 📚 Documentation Index

| Guide | Description | Primary Audience |
| :--- | :--- | :--- |
| **[Setup & Installation Guide](./setup-guide.md)** | Step-by-step instructions for environment configuration, Docker SQL Server setup, Prisma migrations, and running the project. | Developers, DevOps, SysAdmins |
| **[Credentials & Test Data](./credentials-and-test-data.md)** | Verified list of test accounts, passwords, organization invite codes, and pre-configured database connection targets. | QA Testers, Evaluators, Developers |
| **[Architecture & Features](./architecture-and-features.md)** | System architecture diagrams, RAG pipeline, multi-tenancy model, AES-256 security, and persistent chat sessions. | Architects, Lead Developers |
| **[API Reference](./api-reference.md)** | Complete HTTP REST specification for authentication, registration, password resets, and chat persistence endpoints. | Integrators, Frontend/Backend Devs |
| **[Troubleshooting & FAQ](./troubleshooting.md)** | Solutions for Docker connectivity, Windows Prisma DLL locks, target database timeouts, and AI inference configuration. | All Users |

---

## ⚡ Quick Start Cheat-Sheet

```powershell
# 1. Start Microsoft SQL Server Container
docker start databridge-sql

# 2. Install Dependencies
npm install

# 3. Synchronize Database Tables
npx prisma db push

# 4. Generate Prisma Client
npx prisma generate

# 5. Start Development Server
npm run dev
```

Visit: **`http://localhost:3000`**

### Default Test Login:
* **Email:** `usman.khan@tajgasoli`
* **Password:** `1234567890`
* **Organization:** Test Org (`TES-MFGZRW`)
