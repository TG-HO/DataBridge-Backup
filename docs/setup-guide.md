# DataBridge AI - Setup & Installation Guide

This guide provides step-by-step instructions to configure, initialize, and run DataBridge AI on your local or server environment.

---

## 1. System Prerequisites

Before starting, ensure you have the following software installed on your host machine:

| Component | Minimum Version | Description |
| :--- | :--- | :--- |
| **Node.js** | `v20.x` or `v24.x` | JavaScript runtime (Node 20 LTS or Node 24 recommended) |
| **npm** | `v10.x` or higher | Node package manager |
| **Docker Desktop** | `v4.x` or higher | Required if running Microsoft SQL Server container |
| **Git** | `v2.x` | Source code version control |

---

## 2. SQL Server Database Setup

DataBridge AI uses **Microsoft SQL Server** as its primary internal database for authentication, multi-tenant organizations, connection metadata, and chat history.

### Option A: Using Docker (Default)

The project includes a Docker-based Microsoft SQL Server 2022 instance:

#### 1. Start Existing Container
If the container `databridge-sql` is already provisioned:
```powershell
docker start databridge-sql
```

#### 2. Create Container from Scratch (First-Time Setup)
If setting up on a new machine without an existing container:
```powershell
docker run -e "ACCEPT_EULA=Y" `
  -e "MSSQL_SA_PASSWORD=YourStrong@Password123" `
  -p 1433:1433 `
  --name databridge-sql `
  -d mcr.microsoft.com/mssql/server:2022-latest
```

#### 3. Automatic Startup on Boot (Recommended)
To prevent having to manually run `docker start` every time Windows restarts:
```powershell
docker update --restart unless-stopped databridge-sql
```
*(Ensure "Start Docker Desktop when you log in" is checked in Docker Desktop settings).*

---

### Option B: Native SQL Server on Windows (No Docker)

If you prefer not to use Docker:
1. Download and install **SQL Server 2022 Express** or **Developer Edition** directly on Windows.
2. In SQL Server Configuration Manager:
   - Enable TCP/IP on IPAll with port `1433`.
   - Ensure the `SQL Server (MSSQLSERVER)` service is set to Startup Type: **Automatic**.
3. Create a database named `databridge_ai`.
4. Update the `DATABASE_URL` in `.env` to match your local SQL Server credentials.

---

## 3. Environment Variables Configuration

Create or verify the `.env` file in the project root (`d:\DataBridge AI\.env`):

```env
# -------------------------------------------------------------
# DATABASE CONNECTION (Microsoft SQL Server)
# -------------------------------------------------------------
DATABASE_URL="sqlserver://localhost:1433;database=databridge_ai;user=sa;password=YourStrong@Password123;encrypt=true;trustServerCertificate=true"

# -------------------------------------------------------------
# AUTH.JS / NEXTAUTH SECURITY
# -------------------------------------------------------------
AUTH_SECRET="databridge-ai-super-secret-jwt-key-2026-production"
NEXTAUTH_SECRET="databridge-ai-super-secret-jwt-key-2026-production"
NEXTAUTH_URL="http://localhost:3000"

# -------------------------------------------------------------
# AES-256-CBC CREDENTIAL ENCRYPTION KEY (64 hex characters / 32 bytes)
# Used to encrypt target database passwords in the database
# -------------------------------------------------------------
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# -------------------------------------------------------------
# AI INFERENCE PROVIDER CONFIGURATION
# -------------------------------------------------------------

# OPTION 1: OLLAMA (Local offline models)
# AI_PROVIDER="ollama"
# AI_BASE_URL="http://localhost:11434/v1"
# AI_MODEL="qwen2.5-coder:7b"

# OPTION 2: NVIDIA NIM
# AI_PROVIDER="nvidia"
# AI_BASE_URL="https://integrate.api.nvidia.com/v1"
# NVIDIA_API_KEY="your-nvidia-api-key"
# AI_MODEL="nvidia/nemotron-3.5-lightning-30b-a3b"

# OPTION 3: OPENAI
# AI_PROVIDER="openai"
# OPENAI_API_KEY="your-openai-api-key"
# AI_MODEL="gpt-4o"

# OPTION 4: OPENROUTER (Recommended - High Speed & Model Diversity)
AI_PROVIDER="openrouter"
OPENROUTER_API_KEY="sk-or-v1-your-openrouter-key"
AI_MODEL="nvidia/nemotron-3-super-120b-a12b:free"
```

---

## 4. Install Dependencies & Synchronize Schema

Run the following commands in PowerShell from the project root:

### Step 1: Install Node modules
```powershell
npm install
```

### Step 2: Push Prisma Schema to SQL Server
This creates the tables (`User`, `Organization`, `OrganizationUser`, `DbConnection`, `Dashboard`, `QuerySession`, `ChatMessage`) in SQL Server:
```powershell
npx prisma db push
```

### Step 3: Generate Prisma Client Types
```powershell
npx prisma generate
```

> [!TIP]
> **Windows DLL Locking Tip:**
> If `npx prisma generate` fails with an `EPERM` error on Windows (`query_engine-windows.dll.node`), it means the Next.js dev server is running and locking the binary in memory. Stop the dev server (`Ctrl+C`), re-run `npx prisma generate`, and start the dev server again.

---

## 5. Running the Application

### Development Mode
DataBridge AI uses Next.js with the Webpack builder:
```powershell
npm run dev
```
Once started, open your browser and navigate to:
```
http://localhost:3000
```

### Production Build
To validate and produce an optimized production bundle:
```powershell
npm run build
npm run start
```

---

## 6. Verifying Health & Connectivity

1. Navigate to `http://localhost:3000/login`.
2. Enter one of the pre-configured test credentials (see [credentials-and-test-data.md](./credentials-and-test-data.md)).
3. Once logged in, verify:
   - Sidebar displays your user and organization name.
   - Org invite code is displayed in the sidebar footer with a copy button.
   - Go to **Databases** (`/settings/connections`) to test connected databases.
